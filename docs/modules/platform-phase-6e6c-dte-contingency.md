# FASE VI-E6C — DTE Contingency Runtime Awareness

Dedicated DB only. NO Shared/Hybrid. Migra el dominio de **contingencia DTE**
(El Salvador, transmission_type_code="2") para que un RUNTIME_CLIENT opere
íntegramente contra su propia runtime DB, cerrando el último gap conocido del
pipeline de transmisión (`assertDteContingencyTransmissionAllowed`).

## 1. Alcance

Migrados a `db: PrismaClient = prisma` explícito (mismo patrón certificado en
VI-E5A/E5B/E6A/E6B):

| Servicio | Archivo | Rol |
|---|---|---|
| `createContingencyEvent` | `src/modules/commerce/dte/services/create-contingency-event.service.ts` | Crea `DteContingencyEvent` (DRAFT) + `DteContingencyEventItem[]` |
| `buildAndPersistContingencyEventJson` | `src/modules/commerce/dte/services/persist-contingency-event-json.service.ts` | Carga evento DRAFT, delega a builder puro, persiste `event_json`, avanza a PENDING_SIGNATURE |
| `signContingencyEvent` | `src/modules/commerce/dte/services/sign-contingency-event.service.ts` | Firma PENDING_SIGNATURE → SIGNED |
| `transmitContingencyEvent` | `src/modules/commerce/dte/services/transmit-contingency-event.service.ts` | Transmite SIGNED a MH `/fesv/contingencia` → ACCEPTED/REJECTED |
| `assertDteContingencyTransmissionAllowed` | `src/modules/commerce/dte/services/assert-dte-contingency-transmission-allowed.service.ts` | **Guard crítico** — gatea `transmitDteDocument` para `transmission_type_code="2"` |

No migrado (por diseño): `build-contingency-event-json.service.ts` — builder
puro, sin acceso a DB, no requiere `db`.

Caller cerrado: `transmit-dte-document.service.ts` (paso 3b) ahora pasa `db`
explícito al guard: `assertDteContingencyTransmissionAllowed({...}, db)`. Antes
de esta fase, el guard consultaba siempre el Prisma global aunque el resto del
pipeline de transmisión ya fuera runtime-aware desde VI-E5B — un RUNTIME_CLIENT
con documentos `transmission_type_code="2"` tenía un cross-DB gap real.

## 2. Semántica de negocio (reconstruida del código real)

- Dispara contingencia: un `DteOutgoingDocument` con `transmission_type_code
  === "2"` y `contingency_type_code` ∈ {"1".."5"} (CAT-023).
- Tipos DTE elegibles para el Evento de Contingencia: solo "01" (FE) y "03"
  (CCFE) — validado en `createContingencyEvent`.
- Estados del Evento (`DteContingencyStatus`): `DRAFT → PENDING_SIGNATURE →
  SIGNED → SENT → ACCEPTED | REJECTED`.
- Un DTE contingente solo puede transmitirse a MH (`/recepciondte`, vía
  `transmitDteDocument`) si existe un `DteContingencyEvent` **ACCEPTED**, del
  mismo tenant/location, mismo `contingency_type_code`, y cuyo
  `event_json.detalleDTE` contenga el `generation_code` del DTE.
- `DteOutgoingStatus.CONTINGENCY_PENDING` **confirmado código muerto** —
  existe en el enum/tipos/labels de UI pero ningún servicio lo escribe nunca.
  El estado real del DTE lo sigue gobernando `transmit-dte-document.service.ts`
  igual que un DTE normal (SIGNED→ACCEPTED/REJECTED); el guard de contingencia
  solo decide si esa transmisión puede ocurrir.
- `CONTINGENCY_PRODUCT_ENTRYPOINT = NONE` — no existe ninguna Server
  Action/UI productiva que invoque create/build/sign/transmit de contingencia;
  los únicos callers son los scripts dev
  (`src/modules/commerce/dte/dev/verify-contingency-*.ts`). Por instrucción
  explícita de esta fase, no se inventó un orquestador nuevo — los 5 servicios
  quedan certificados runtime-capable para cuando exista el caso de uso real.

## 3. Cambios de comportamiento (además del enrutamiento a `db`)

- **`signContingencyEvent`** — antes resolvía credenciales EXCLUSIVAMENTE
  desde `DTE_SIGNER_NIT`/`DTE_SIGNER_PASSWORD` (env global). Ahora reusa
  `resolveDteSignerConfigForIssuer` (mecanismo certificado en VI-E5A/VI-E6B),
  pasando `client: db` — usa `DteCredential` por emisor/ambiente si existe,
  cae al mismo fallback global si no. Nunca cruza ambientes ni bases físicas.
- **`assertDteContingencyTransmissionAllowed`** — el enforcement de ownership
  (tenant/location/status/tipo) se movió del filtrado en memoria (`.some()`
  sobre un `findMany` amplio) al `where` del query mismo:
  `contingency_event: { tenant_id, location_id, status: "ACCEPTED",
  contingency_type_code }`. Sin cambio de regla de negocio — solo dónde se
  aplica el filtro.

## 4. Metering

Sin cambios de código. Ninguno de los 5 servicios de contingencia importa
`dte-fiscal-metering.service.ts`. El consumo de `fiscal.dte.monthly_issued`
ocurre exclusivamente dentro de `transmitDteDocument` (idéntico para
transmission_type_code "1" y "2"). La transmisión del **Evento** de
Contingencia (`/fesv/contingencia`) es un canal MH separado del documento DTE
y no mueve el ledger de metering.

## 5. Status / crash semantics

`transmitContingencyEvent` marca `DteContingencyEvent.status = "SENT"` en una
transacción ANTES de llamar a MH (mismo patrón preexistente que transmisión
normal y `transmitInvalidationEvent`). Un crash entre ese commit y la
persistencia del resultado de MH deja el evento en `SENT` sin resolución
automática:

- `dte-reconciliation.service.ts` (VI-E6A) **no tiene ninguna rama que lea
  `DteContingencyEvent`** — confirmado por grep, cero matches.
- **`CONTINGENCY_CRASH_RECOVERY_SAFE = NO`** (deuda documentada, no corregida
  en esta fase — no autoriza un rediseño automático).
- A diferencia de invalidación, este `SENT` no deja ningún campo del
  `DteOutgoingDocument` asociado en un estado intermedio: el Evento de
  Contingencia es una entidad separada, así que el DTE permanece en su estado
  normal (típicamente SIGNED, pendiente de transmisión real vía
  `transmitDteDocument`) durante el crash window.
- Recuperación esperada hoy: reintento manual de `transmitContingencyEvent`
  sobre el mismo evento, revirtiendo manualmente `SENT → SIGNED` en DB si el
  evento quedó huérfano.

## 6. Tests

31 tests nuevos (857 en el repo, antes 826):

- `create-contingency-event.service.runtime-write.test.ts` (4)
- `persist-contingency-event-json.service.runtime-write.test.ts` (5)
- `sign-contingency-event.service.runtime-write.test.ts` (6)
- `transmit-contingency-event.service.runtime-write.test.ts` (6)
- `assert-dte-contingency-transmission-allowed.service.runtime-write.test.ts`
  (9 — incluye type1 passthrough, cobertura ACCEPTED, cross-tenant,
  contingency_type_code distinto, generation_code no cubierto,
  generationCode/contingencyTypeCode ausentes, fallback sin `db`)
- `transmit-dte-document.service.runtime.test.ts` (+1 — certifica que el guard
  recibe `db` como segundo argumento)

Cada test runtime-write usa el patrón de Proxy que lanza `RUNTIME_UNSAFE` al
primer acceso al Prisma global mockeado, certificando que — con `db`
explícito — CERO llamadas tocan el Prisma global.

`tsc --noEmit`: limpio salvo la deuda preexistente ya documentada en
`generate-nc-json.service.runtime-write.test.ts` (mock NC05, sin relación con
esta fase). `npm run lint`: sin errores nuevos. `npm run build`: PASS.

## 7. Impacto en bases de datos y sincronización local/remota

- `schema.prisma`: **sin cambios** (`SCHEMA_CHANGE = NO`).
- **No se generó migración** (`MIGRATION_REQUIRED = NO`).
- No se tocó ninguna base real (local ni remota) — todos los tests usan mocks,
  cero efectos externos (DB real, MH, firmador, MariaDB).
- Nada que sincronizar: no hay comandos de Prisma que ejecutar tras esta fase.

## 8. Estado del ciclo DTE runtime-aware

Con esta fase, **todo** el ciclo DTE queda runtime-aware:

| Sub-flujo | Fase | Estado |
|---|---|---|
| Creación (FE/CCFE/NC/FSE/FEX) | VI-E4A/B | ✅ |
| Firma | VI-E5A | ✅ |
| Transmisión normal | VI-E5B | ✅ |
| Reconciliación / reopen-resign | VI-E6A | ✅ |
| Invalidación | VI-E6B | ✅ |
| Contingencia (create/sign/transmit + guard) | VI-E6C | ✅ |
| Delivery MariaDB end-to-end | VI-E7 | Pendiente (PARTIAL) |

`DTE_TRANSMISSION_RUNTIME_READY = YES` (normal + contingencia). Único paso
restante del ciclo DTE sobre Prisma global/Control Plane:
**delivery MariaDB (VI-E7)**.

## 9. NO se hizo en esta fase

- NO se implementó Shared/Hybrid runtime — Dedicated DB preservado.
- NO se inventó Server Action/UI productiva de contingencia.
- NO se corrigió la deuda de crash recovery (documentada, no rediseñada).
- NO se tocó MariaDB delivery, MH real, firmador real, ni ninguna base de
  datos real.
- NO se corrigió el mock NC05 (deuda preexistente, fuera de alcance).
