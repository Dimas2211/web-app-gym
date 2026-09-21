# FASE VI-E5B — DTE transmission runtime awareness

Migra la **transmisión a Hacienda** de DTE (FE01, CCFE03, FSE14, FEX11, NC05)
para que un RUNTIME_CLIENT transmita íntegramente contra su propia runtime
DB, siguiendo el mismo patrón `requireOperationalContext` / `db` explícito ya
certificado en VI-E3 (FE/CCFE), VI-E4A (FSE/FEX), VI-E4B (NC05 creación) y
VI-E5A (firma).

DTE creación: ✅ (VI-E3/E4A/E4B, sin cambios en esta fase)
DTE firma: ✅ (VI-E5A, sin cambios en esta fase)
DTE transmisión a Hacienda: ✅ (esta fase, PLATFORM_NATIVE y RUNTIME_CLIENT)
Reconciliación / invalidación / contingencia / MariaDB: ❌ explícitamente
fuera de alcance (VI-E6)

Con esta fase, el ciclo de EMISIÓN completo (crear → generar JSON → validar
schema → firmar → transmitir) queda runtime-aware end-to-end para
RUNTIME_CLIENT. Lo que sigue pendiente (reconciliación de estado MH,
invalidación, eventos de contingencia, delivery a MariaDB) es todo
post-emisión y queda para VI-E6.

## 1. Inventario de entry points de transmisión (antes de esta fase)

| Path / entry point | Tipos | DB source (antes) | Auth source | Tenant/location source | Credential client | Environment source | Metering DB source | Support | ¿Llama MH? | Runtime-safe antes |
|---|---|---|---|---|---|---|---|---|---|---|
| `transmit-dte-document.action.ts` → `transmitDteDocumentAction` | 01,03,05,14 (11 vía fex11-feature-guard) | Prisma global | `requireAdmin` (JWT) | `sessionUser.tenant_id` + `getEffectiveLocationId` | Ninguno (global) | `dteDoc.environment` | Prisma global (`runtimeDb: prisma` hardcodeado en el service) | No filtraba Support/read-only propio (`resolveCommercialEnforcementContext` + `assertOrganizationModule` manual, sin `readOnly`) | Sí | NO |
| `transmit-dte-document.service.ts` → `transmitDteDocument` | agnóstico de tipo (SUPPORTED_TYPE_CODES 01/03/05/14 + FEX11 guardado) | Prisma global (`import { prisma }`, sin parámetro `db`) | — (recibe tenantId/locationId ya resueltos) | params | Ninguno — `new MhDteTransmissionAdapter()` sin `authAdapter`, por lo que `MhAuthAdapter` interno nunca recibía `credentialClient` | `dteDoc.environment` | `runtimeDb: prisma` hardcodeado en la llamada a `reserveDteFiscalCapacity` | N/A (service puro) | Sí | NO |
| `create-and-transmit-credit-note.action.ts` (NC05 combinado) | 05 | `context.client` para create/generate/validate/sign (VI-E4B/E5A); `transmitDteDocument` sin `client` → Prisma global | `requireOperationalContext` | `context.tenantId/locationId` | Ninguno para el paso de transmisión | `dteDoc.environment` | Prisma global (transitivo del service sin `db`) | Bloqueado explícitamente para RUNTIME_CLIENT: la action cortaba fail-closed con `stepFailed: "transmitir_deferred"` inmediatamente después de firmar | Sí, solo PLATFORM_NATIVE (RUNTIME_CLIENT nunca llegaba a este paso) | NO (bloqueado deliberadamente para RUNTIME_CLIENT) |
| `dte-auth.adapter.ts` → `MhAuthAdapter` | N/A | `credentialClient` opcional en el constructor (ya soportado desde IV-B.4), pero **ningún caller de transmisión SEND real lo pasaba** — solo `reconcileDteWithMh` lo usaba | N/A | N/A | Ninguno cuando se instancia sin opciones (cae a `resolveMhAuthCredentials` sin `client` → Prisma global) | `environment` recibido por parámetro | N/A | N/A | Sí (auth MH) | Parcial — la capacidad runtime-aware ya existía, pero no estaba conectada al flujo de transmisión SEND |
| `dte-transmission.adapter.ts` → `MhDteTransmissionAdapter` | 01,03,05,14 | Sin Prisma — HTTP puro | Delegado a `MhAuthAdapter` interno | N/A | El que reciba `MhAuthAdapter` en el constructor (antes: siempre el default, sin `credentialClient`) | recibido por parámetro (`input.environment`) | N/A | N/A | Sí | Dependía enteramente de qué `MhAuthAdapter` se le inyectara |
| `dte-fiscal-metering.service.ts` (`reserveDteFiscalCapacity`/`finalize`/`release`) | N/A | ya runtime-capable — exige `runtimeDb: PrismaClient` explícito en la firma, sin default global | N/A | params | N/A | N/A | Ya certificado desde IV-A/IV-D — el problema NO era el motor, era el `prisma` global que `transmit-dte-document.service.ts` le pasaba | N/A | No | Ya runtime-safe en sí mismo (IV-A/IV-D); el gap estaba en el caller |
| `assert-dte-contingency-transmission-allowed.service.ts` | solo `transmission_type_code="2"` | Prisma global (`import { prisma }`), sin parámetro `db` | N/A | params | N/A | N/A | N/A | N/A | No | NO — pero **fuera de alcance de esta fase** (ver §3) |
| `export-sale-dte.actions.ts` / `purchase-dte-fiscal-panel.tsx` / `sales-client.tsx` / `fex11-test-console.actions.ts` (callers UI de `transmitDteDocumentAction`) | 01,03,05,11,14 | Delegan a `transmit-dte-document.action.ts` | Delegado | Delegado | Delegado | Delegado | Delegado | Delegado | Delegado (indirecto) | Heredaban el estado NO de la action/service |

## 2. Después de esta fase

| Path / entry point | DB source (después) | Support behavior | Runtime-safe |
|---|---|---|---|
| `transmit-dte-document.action.ts` | `context.client` (runtime DB para RUNTIME_CLIENT, Prisma global para PLATFORM_NATIVE) vía `requireOperationalContext({ module: "fiscal.dte", write: true })` | `requireOperationalContext` rechaza `READ_ONLY` antes de invocar `transmitDteDocument`, MH o el ledger de metering | SÍ |
| `transmit-dte-document.service.ts` | `db` explícito (default `= prisma`) — documento, `$transaction` (3 transiciones finales + rama de error), `runtimeDb: db` para el metering, y `MhAuthAdapter({ credentialClient: db })` para la resolución de `DteCredential`, todo en el mismo `db` | N/A (service puro, hereda el `db` del caller) | SÍ, cuando el caller pasa `db` |
| `create-and-transmit-credit-note.action.ts` | create/generate/validate/sign/transmit → todos `context.client`. Ya no hay corte fail-closed — el flujo llega hasta ACCEPTED/OBSERVED/REJECTED para RUNTIME_CLIENT igual que PLATFORM_NATIVE, reutilizando el mismo `transmitDteDocument` runtime-aware | Igual que arriba | SÍ, end-to-end |
| `dte-auth.adapter.ts` → `MhAuthAdapter` | Sin cambios de código — ahora sí se instancia con `credentialClient: db` desde el flujo SEND real (antes solo `reconcileDteWithMh` lo hacía) | N/A | SÍ, cuando el llamador (el service de transmisión) pasa `credentialClient` |
| `dte-transmission.adapter.ts` → `MhDteTransmissionAdapter` | Sin cambios funcionales — recibe el `MhAuthAdapter` ya runtime-aware por constructor | N/A | SÍ, transitivamente |
| `assert-dte-contingency-transmission-allowed.service.ts` | **Sin cambios — Prisma global.** Fuera de alcance (VI-E6) | Sin cambios | NO para `transmission_type_code="2"` (documentado, no migrado); irrelevante para `"1"` (retorna `{ok:true}` sin tocar DB) |

## 3. Flujos combinados (bypass) — auditoría

El único flujo combinado real que llega a firma+transmisión en una sola
Server Action sigue siendo `create-and-transmit-credit-note.action.ts`
(NC05). VI-E5A dejó la decisión Q pendiente (opción A, threadear firma y
cortar antes de transmitir); esta fase la cierra:

- `transmitDteDocument` ahora recibe `context.client` igual que los 4 pasos
  anteriores (crear/generar/validar/firmar).
- El corte fail-closed `stepFailed: "transmitir_deferred"` para
  `authScope === "RUNTIME_CLIENT"` se elimina — ya no hace falta, porque el
  service de transmisión es runtime-safe.
- PLATFORM_NATIVE conserva el flujo completo sin ningún cambio de
  comportamiento externo (mismo `transmitDteDocument`, ahora con `db`
  explícito en vez de implícito).

No se creó una segunda implementación de transmisión para el flujo
combinado — ambos entry points (`transmit-dte-document.action.ts` standalone
y el paso 5 de `create-and-transmit-credit-note.action.ts`) llaman al mismo
`transmitDteDocument(params, db)`.

## 4. Precondiciones de documento — preservadas sin cambios

- Estado origen: `dte_status === "SIGNED"` únicamente. Campos requeridos
  (`signed_jws`, `generation_code`, `control_number`) sin cambios.
  `SUPPORTED_TYPE_CODES` (01/03/05/14) sin cambios; FEX 11 sigue detrás de
  `canUseFex11InServerFlow` (TEST + flag).
- Guard de contingencia (`assertDteContingencyTransmissionAllowed`) se
  invoca en el mismo punto, con la misma firma — **no se le pasó `db`**
  porque está fuera de alcance de esta fase (ver §3 arriba y §12 abajo).
  Para `transmission_type_code === "1"` (documentos normales, la inmensa
  mayoría) el guard retorna `{ ok: true }` sin tocar ninguna tabla — no hay
  impacto práctico en el invariante same-runtime-DB para el caso común.
- Ninguna regla de negocio de estado MH (`ACCEPTED`/`OBSERVED`/`REJECTED`,
  `determineFinalStatus`) se modificó.

## 5. Invariante misma-runtime-DB (`DTE_TRANSMISSION_SAME_RUNTIME_DB`)

Para RUNTIME_CLIENT, en una sola invocación de `transmitDteDocument(params, db)`:
`DteOutgoingDocument` (paso 1), `DteTransmissionLog` (todas las ramas),
`DteFiscalMeteringReservation` (vía `runtimeDb: db` en
`reserveDteFiscalCapacity`/`finalizeDteFiscalCapacityConsumed`/
`releaseDteFiscalCapacity`) y `DteCredential` (vía
`MhAuthAdapter({ credentialClient: db })` → `resolveMhAuthCredentials`) usan
todos el mismo objeto `db` — nunca se abre un segundo `PrismaClient` ni se
cae a `prisma` global en ningún punto intermedio para documentos normales
(`transmission_type_code="1"`). Certificado por
`transmit-dte-document.service.runtime.test.ts`, que expone un Prisma global
mockeado por separado del `db` runtime y verifica que el primero nunca
recibe llamadas cuando se pasa el segundo.

**Resultado: DTE_TRANSMISSION_SAME_RUNTIME_DB = SÍ** (para
`transmission_type_code="1"`; el guard de contingencia para `"2"` queda
fuera de alcance — ver §12).

## 6. Fuente del emisor (`DteIssuerConfig`)

Sin cambios — `transmit-dte-document.service.ts` nunca cargó
`DteIssuerConfig` directamente (solo pasa `issuer_config_id` al adapter de
transmisión). La validación de consistencia `dteDoc.environment ===
issuerConfig.environment` ya se certificó en `sign-dte-document.service.ts`
(VI-E5A, paso 3b) antes de que el documento pueda llegar a `SIGNED` — para
cuando `transmitDteDocument` se invoca, esa consistencia ya está
garantizada estructuralmente por la fase anterior del ciclo.

## 7. Fuente de la credencial (`DteCredential`) y auth MH

Cambio central de esta fase. Antes:
`new MhDteTransmissionAdapter()` construía internamente
`new MhAuthAdapter()` **sin** `credentialClient` — por lo que
`resolveMhAuthCredentials` (ya `client`-aware desde IV-B.4) siempre caía al
`prisma` global para leer `DteCredential`, sin importar qué `db` runtime
tuviera el documento que se estaba transmitiendo. Esto era el gap real de
runtime-isolation en la transmisión: un RUNTIME_CLIENT podía tener su
documento/emisor en su propia base, pero la credencial MH usada para
autenticar seguía resolviéndose contra el Control Plane / Prisma global.

Después: `transmitDteDocument` construye
`new MhDteTransmissionAdapter(new MhAuthAdapter({ credentialClient: db }))`
— la misma `db` que carga el documento se usa para resolver la credencial.
El fallback a `DTE_MH_USER`/`DTE_MH_PASSWORD` de proceso (solo TEST) y el
bloqueo explícito en PRODUCTION sin credencial de emisor se preservan
intactos (sin cambios en `resolveMhAuthCredentials`).

## 8. Cache de tokens MH (`dte-auth.adapter.ts`)

Auditado, sin cambios necesarios. La key del cache ya es
`` `${issuerConfigId ?? "env"}:${environment}` `` desde F-DTE-ENV — aísla el
token por emisor+ambiente, no solo por ambiente. Dos runtime DBs distintas
con `issuerConfigId` diferentes (que es la norma, ya que
`DteIssuerConfig.id` es un UUID por fila física) nunca comparten entrada de
cache. El riesgo teórico (colisión de `issuerConfigId` entre dos runtime DBs
físicas distintas) requeriría que dos bases distintas generaran el mismo
UUID para un emisor — probabilísticamente descartado, no se rediseñó el
cache.

## 9. Consistencia de ambiente

Sin cambios de lógica — `environment` sigue siendo siempre
`dteDoc.environment` (nunca `DTE_ENVIRONMENT` global), resuelto vía
`resolveDteMhUrls(environment)` para la URL de recepción y pasado
explícitamente al adapter de transmisión y, transitivamente, al de auth. La
consistencia documento↔emisor ya se certificó en VI-E5A (§9 de ese doc)
antes de llegar a `SIGNED`.

**`DTE_TRANSMISSION_ENVIRONMENT_CONSISTENT = SÍ`** (heredado de la garantía
estructural de VI-E5A — ningún documento puede estar `SIGNED` con un
`environment` distinto al de su `DteIssuerConfig`).

## 10. Adapter de transmisión (`dte-transmission.adapter.ts`)

No se modificó funcionalmente. Sigue siendo HTTP puro (fetch a
`receptionUrl`, reintento único en 401 vía `clearTokenCache` +
`_transmitWithRetry`, timeout vía `AbortController`, normalización de
`estado`/`observaciones`). No hace queries a DB. Todos los tests de esta
fase mockean la clase completa (`vi.mock("../adapters/dte-transmission.adapter", ...)`)
— **cero llamadas de red reales**.

## 11. Metering — reserva/consumo/liberación

Sin cambios de semántica (`fiscal.dte.monthly_issued`):
`reserveDteFiscalCapacity` antes de llamar a MH, `finalizeDteFiscalCapacityConsumed`
dentro de la misma transacción que `ACCEPTED`/`OBSERVED`,
`releaseDteFiscalCapacity` dentro de la misma transacción que `REJECTED`.
Único cambio: `runtimeDb: db` en vez de `runtimeDb: prisma` — el motor
interno (`dte-fiscal-metering.service.ts`) ya exigía `runtimeDb` explícito
desde IV-A, así que esto es puro threading, sin tocar la máquina de estados
del ledger (`PENDING → CONSUMED`/`RELEASED`, bypass TEST, bypass
`LEGACY_UNMANAGED`, idempotencia ante reintentos).

**`DTE_METERING_LEDGER_SAME_RUNTIME_DB = SÍ`** (el ledger
`DteFiscalMeteringReservation` vive en la misma runtime DB que el documento
que mide).

## 12. Capacidad comercial vs ledger — split Control Plane / runtime

`resolveCommercialEnforcementContext(tenantId)` (capacidad comercial:
módulos, entitlements, plan) sigue consultando exclusivamente
`controlPlanePrisma` — no se le pasó `db` porque nunca debe leerse del
runtime del tenant (ver `resolve-commercial-context.ts`, sin cambios). El
ledger de uso (`DteFiscalMeteringReservation`) vive en runtime DB (§11). No
hay lectura de `PlatformPlan`/`PlatformModule`/`PlatformEntitlement`/
overrides de organización desde runtime DB, ni escritura del ledger de uso
hacia Control Plane.

**`DTE_METERING_CONTROL_PLANE_RUNTIME_SPLIT_SAFE = SÍ`.**

## 13. Persistencia de la respuesta MH

Sin cambios de forma — `mh_response` sanitizado (nunca incluye
`signed_jws` ni token), `reception_stamp`, `observations` (solo en
`OBSERVED`), `rejection_reason` (solo en `REJECTED`), y
`DteTransmissionLog` con `response_body` correspondiente, todo ahora sobre
`db` en vez de `prisma` global.

## 14. Transiciones de estado — preservadas

`SIGNED → ACCEPTED` (MH `PROCESADO` sin evidencia de observación),
`SIGNED → OBSERVED` (MH `PROCESADO` con evidencia real vía
`isMhProcessedObserved`), `SIGNED → REJECTED` (MH `RECHAZADO`). Estado MH
inesperado (ni `PROCESADO` ni `RECHAZADO`) mantiene `SIGNED`, incrementa
`retry_count`, registra log, retorna error — sin cambios. No existe estado
`SENT` intermedio en este service (el campo `sent_at` se setea junto con la
transición final, no como estado propio).

## 15. Semántica de fallos — preservada

- Error técnico del adapter (timeout, red, HTTP inesperado, respuesta no
  parseable) → `result.ok === false` → mantiene `SIGNED`, incrementa
  `retry_count`, registra `DteTransmissionLog` — **nunca** se llega a
  `finalizeDteFiscalCapacityConsumed`/`releaseDteFiscalCapacity`, la reserva
  queda `PENDING` para el siguiente intento (nunca `CONSUMED` sin
  transmisión real).
- Fallo del gate de metering (`reserveDteFiscalCapacity` retorna
  `ok: false`, ej. `CAPACITY_LIMIT_REACHED`) → `adapter.transmit` **nunca**
  se invoca (certificado desde IV-A, sin cambios).
- Ninguna transacción DB permanece abierta durante la llamada HTTP a MH —
  la reserva de metering es su propia transacción Serializable, separada de
  la llamada de red, separada a su vez de la transacción final de
  persistencia del resultado.

## 16. Idempotencia

Sin cambios — reintento del mismo documento nunca duplica reserva
(`reserveDteFiscalCapacity` es idempotente sobre `dte_document_id` único);
si el ledger ya marca `CONSUMED` pero el documento sigue `SIGNED`
(divergencia), el service falla explícitamente en vez de transmitir dos
veces (`TransmitDteBusinessError` dedicado, sin cambios de esta fase).

## 17. Support Session

`transmitDteDocumentAction` ahora usa
`requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true })`
— para `SUPPORT_RUNTIME` (`context.readOnly === true`), esto lanza
`OperationalContextError("READ_ONLY", ...)` **antes** de resolver
`context.client`, antes de tocar el documento, antes de llamar a MH y antes
de tocar el ledger de metering. Certificado por el test
`"Support Session (READ_ONLY) bloquea -> transmitDteDocument NUNCA se
invoca (0 llamadas a MH/metering)"`.

## 18. Rol efectivo

`transmitDteDocumentAction` usa `context.effectiveUser.id`/
`context.tenantId`/`context.locationId` (rol LIVE para RUNTIME_CLIENT desde
VI-D2/ETAPA A) — nunca `sessionUser.role`/`sessionUser.tenant_id`
directamente.

## 19. Cross-tenant / cross-location

`transmit-dte-document.service.ts` sigue filtrando `DteOutgoingDocument` por
`{id, tenant_id, location_id}` sobre `db` — un documento de otro
tenant/location/runtime es indistinguible de "no existe" (fail closed). El
`dteDocumentId` recibido del cliente es solo un identificador, nunca
autoridad — la autorización real la da el filtro tenant/location aplicado
contra el `db` ya resuelto por `requireOperationalContext`.

## 20. Flujo NC combinado — runtime-safe end-to-end

Certificado por `create-and-transmit-credit-note.action.test.ts`
("RUNTIME_CLIENT -> sign y transmit reciben context.client, flujo completo
hasta ACCEPTED"): para RUNTIME_CLIENT, los 5 pasos (crear, generar JSON,
validar schema, firmar, transmitir) corren contra `context.client`, sin
ninguna llamada al Prisma global mockeado.

## 21. Action de transmisión estándar

Ya existía (`transmit-dte-document.action.ts`) desde antes de esta fase —
no se creó ninguna UI/feature nueva. Se migró su implementación al patrón
`requireOperationalContext`, igual que `sign-dte-document.action.ts` en
VI-E5A.

## 22. Frontera de reintento/reapertura

No se tocó ningún flujo de reapertura/reintento adicional en esta fase
(`reopen-rejected-dte-for-resign.*` ya fue migrado en VI-E5A y no depende de
transmisión). No existe hoy un helper de "retry" global que llame a
`transmitDteDocument` saltándose `requireOperationalContext` — el único
caller productivo fuera de las dos actions ya migradas
(`transmit-dte-document.action.ts` y `create-and-transmit-credit-note.action.ts`)
son scripts `dte/dev/verify-*.ts`, que no son entry points de producción
(mismo criterio documentado en VI-E5A §16).

## 23. Mapa de transacciones

| Transacción | DB | Escrituras | ¿Red dentro? |
|---|---|---|---|
| Reserva de metering (`reserveDteFiscalCapacity`) | `db` (Serializable) | `DteFiscalMeteringReservation` | No |
| Rama error técnico | `db` (`$transaction([...])`, array) | `DteOutgoingDocument.update` (retry_count) + `DteTransmissionLog.create` | No |
| Rama estado MH inesperado | `db` (`$transaction([...])`, array) | ídem + `mh_response` | No |
| Transición `ACCEPTED` | `db` (`$transaction(async tx => ...)`) | `DteOutgoingDocument.update` + `DteTransmissionLog.create` + `finalizeDteFiscalCapacityConsumed` | No |
| Transición `OBSERVED` | `db` (`$transaction(async tx => ...)`) | ídem + `observations` | No |
| Transición `REJECTED` | `db` (`$transaction(async tx => ...)`) | ídem + `releaseDteFiscalCapacity` | No |

La llamada HTTP a MH (`adapter.transmit(...)`) ocurre **fuera** de toda
transacción — entre la reserva de metering y la transacción final de
persistencia. Sin cambios de diseño respecto a antes de esta fase.

## 24. Censo de Prisma global (grafo alcanzable desde transmisión)

| Módulo | Clasificación |
|---|---|
| `transmit-dte-document.service.ts` | RUNTIME_SAFE (con `db` explícito) — `OPTIONAL_DEFAULT_SAFE` sin `db` (cae a global, solo para callers PLATFORM_NATIVE no migrados) |
| `transmit-dte-document.action.ts` | RUNTIME_SAFE |
| `dte-auth.adapter.ts` (`MhAuthAdapter`) | RUNTIME_SAFE cuando se instancia con `credentialClient`; `OPTIONAL_DEFAULT_SAFE` sin él |
| `dte-credential.service.ts` (`resolveMhAuthCredentials`) | RUNTIME_SAFE cuando el caller pasa `client` (ya certificado en IV-B.4, ahora conectado al flujo SEND real) |
| `dte-transmission.adapter.ts` (`MhDteTransmissionAdapter`) | GLOBAL_REFERENCE — HTTP puro, sin Prisma; hereda runtime-safety del `MhAuthAdapter` inyectado |
| `dte-fiscal-metering.service.ts` | RUNTIME_SAFE — ya exigía `runtimeDb` explícito desde IV-A |
| `resolve-commercial-context.ts` | `CONTROL_PLANE_ONLY` — deliberado, capacidad comercial nunca vive en runtime DB |
| `create-and-transmit-credit-note.action.ts` (los 5 pasos) | RUNTIME_SAFE |
| `assert-dte-contingency-transmission-allowed.service.ts` | RUNTIME_UNSAFE (Prisma global, sin `db`) — **fuera de alcance deliberado de esta fase (VI-E6)**; solo afecta `transmission_type_code="2"` |
| `reconcile-dte-with-mh.action.ts` | No tocado — fuera de alcance (VI-E6) |
| `dte/dev/verify-*.ts` | DEAD_CODE a nivel productivo — scripts de desarrollo |

**`RUNTIME_CLIENT_DTE_TRANSMISSION_CAN_HIT_GLOBAL_PRISMA = NO`** (para
`transmission_type_code="1"`, el caso común).
**`RUNTIME_CLIENT_DTE_TRANSMISSION_CAN_FALLBACK_GLOBAL = NO`** (nunca se
invoca `transmitDteDocument` sin `db` desde ningún entry point
RUNTIME_CLIENT).
**`RUNTIME_CLIENT_DTE_METERING_CAN_HIT_GLOBAL_PRISMA = NO`.**

Documentos con `transmission_type_code="2"` (contingencia) siguen
alcanzando Prisma global vía el guard no migrado — hoy esos documentos solo
existen en flujos de contingencia que aún no están expuestos a
RUNTIME_CLIENT (contingencia completa es VI-E6), por lo que no hay un
entry point RUNTIME_CLIENT productivo que dispare ese camino todavía.

## 25. Auditoría de secretos

No se encontró ninguna exposición nueva. `MhAuthAdapter({ credentialClient: db })`
solo cambia DE DÓNDE se lee `DteCredential.encrypted_payload` (misma lógica
de descifrado ya existente), nunca qué se loguea. `mh_response` sanitizado
y `DteTransmissionLog.response_body` siguen sin incluir `signed_jws` ni
tokens. Ningún test nuevo incluye secretos ni JWS completos en sus fixtures.

## 26. Tests agregados/modificados

- `src/modules/commerce/dte/actions/transmit-dte-document.action.test.ts` (nuevo, 5 tests)
- `src/modules/commerce/dte/services/transmit-dte-document.service.runtime.test.ts` (nuevo, 4 tests)
- `src/modules/commerce/dte/actions/create-and-transmit-credit-note.action.test.ts` (modificado, 6 → 6 tests, un test reescrito)

## 27. Resultado de validación

- `npx vitest run`: **124 archivos, 769 tests, todos en verde** (antes 760; +9 tests de esta fase).
- `npx tsc --noEmit`: sin errores nuevos. El único error preexistente
  (`generate-nc-json.service.runtime-write.test.ts`, un mismatch de tipos en
  un mock de un test de VI-E4B, ya documentado en VI-E5A §19) se reconfirmó
  presente también en HEAD antes de esta fase (`git stash` + `tsc --noEmit`
  reproduce el mismo error) — no se tocó ese archivo, fuera de alcance.
- `npm run lint`: sin errores, solo warnings preexistentes no relacionados
  con los archivos de esta fase.
- `npm run build`: verde.
- `git diff --check`: sin problemas de whitespace.

## 28. Impacto en bases de datos y sincronización local/remota

- **`schema.prisma`: sin cambios.** No se agregó ni modificó ningún modelo,
  campo, índice ni relación.
- **Migraciones: ninguna generada ni requerida.** Toda esta fase es
  puramente de código de aplicación (threading de un parámetro `db`
  explícito + wiring del `credentialClient` del auth adapter) — no hay
  `SCHEMA_CHANGE` ni `MIGRATION_REQUIRED`.
- **Base tocada:** ninguna base de datos real (local ni remota) fue escrita
  por este trabajo — todos los tests usan mocks de Prisma (`vi.mock`), no
  una conexión real a `DATABASE_URL` ni `DIRECT_URL`.
- **`DATABASE_URL` (local) / `DIRECT_URL` (remota):** sin cambios, sin
  necesidad de alinear — no hubo ninguna migración que aplicar en ninguna
  de las dos.
- **Comandos a ejecutar por el usuario:** ninguno relacionado con Prisma.
  Se recomienda únicamente validar visualmente el flujo de transmisión real
  (`/dashboard/sales` o `/dashboard/dte/outgoing` → "Transmitir DTE") contra
  MH TEST real, ya que ningún test de este repo hace esa llamada de red
  (requisito explícito de esta fase: NO llamadas reales a MH).

## 29. Pendientes explícitos para VI-E6

- `assert-dte-contingency-transmission-allowed.service.ts`: migrar a `db`
  explícito para que documentos `transmission_type_code="2"` también sean
  same-runtime-DB safe.
- `reconcile-dte-with-mh.action.ts` / `dte-reconciliation.service.ts`:
  runtime-aware (ya parcialmente preparado desde IV-B.4, pendiente de
  cerrar igual que transmisión).
- Invalidación de DTE: no iniciada.
- Delivery externo MariaDB: fuera de alcance, sigue como estaba.
- Nivel intermedio tenant/organización de `DteCredential` (reservado, no
  implementado — ver `dte-credential.service.ts` comentarios de diseño).
