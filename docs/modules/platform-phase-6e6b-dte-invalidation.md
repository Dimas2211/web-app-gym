# FASE VI-E6B — DTE Invalidation Runtime Awareness

## Objetivo

Migrar el flujo completo de invalidación DTE (create → sign → transmit → persist) para
que un tenant `RUNTIME_CLIENT` opere íntegramente contra su propia runtime DB — mismo
patrón certificado en VI-E3 (creación), VI-E4A/B (FSE14/FEX11/NC05), VI-E5A (firma),
VI-E5B (transmisión normal) y VI-E6A (reconciliación + reopen/resign).

Estado del ciclo DTE tras esta fase:

- Creación ✅ (VI-E3/E4)
- Firma ✅ (VI-E5A)
- Transmisión normal ✅ (VI-E5B)
- Metering ✅ (IV-A a IV-D)
- Reconciliación ✅ (VI-E6A)
- **Invalidación ✅ (VI-E6B — esta fase)**
- Contingencia — pendiente VI-E6C
- Delivery MariaDB — pendiente VI-E7 (cierre general)

## B — Inventario de entry points de invalidación

| Path | Función | R/W | Entry point | DB origen (antes) | DB origen (después) |
|---|---|---|---|---|---|
| `services/create-invalidation-event.service.ts` | `createInvalidationEvent` | RW | vía actions | Prisma global | `db` inyectable (default `prisma`) |
| `services/sign-invalidation-event.service.ts` | `signInvalidationEvent` | RW | vía actions | Prisma global | `db` inyectable (default `prisma`) |
| `services/transmit-invalidation-event.service.ts` | `transmitInvalidationEvent` | RW | vía actions | Prisma global | `db` inyectable (default `prisma`) |
| `services/deliver-invalidation-to-external-db.service.ts` | `deliverInvalidationToExternalDb` | RW (lectura runtime, escritura MariaDB fija) | `deliver-invalidation-to-external-db.action.ts` | Prisma global | `client` opcional (default `prisma`) — lectura únicamente |
| `services/build-invalidation-event-json.service.ts` | `buildInvalidationEventJson` | pura, sin DB | — | N/A | N/A (no tocado) |
| `services/build-external-invalidation-payload.service.ts` | `buildExternalInvalidationPayload` | pura, sin DB | — | N/A | N/A (no tocado) |
| `adapters/dte-invalidation-transmission.adapter.ts` | `MhInvalidationTransmissionAdapter` | red (MH), sin DB directa | usado por transmit service | `MhAuthAdapter()` sin credentialClient | acepta `authAdapter` inyectado — ahora recibe `MhAuthAdapter({ credentialClient: db })` |
| `actions/create-invalidation-event.action.ts` | Server Action | RW | UI directa (paso 1 manual) | `requireAdmin` + `getEffectiveLocationId` + enforcement manual | `requireOperationalContext({ module: "fiscal.dte", write: true })` |
| `actions/sign-invalidation-event.action.ts` | Server Action | RW | UI directa (paso 2 manual) | ídem | ídem |
| `actions/transmit-invalidation-event.action.ts` | Server Action | RW | UI directa (paso 3 manual) | ídem | ídem |
| `actions/create-sign-transmit-invalidation.action.ts` | Server Action orquestador | RW | **entry point productivo principal** (flujo en un solo paso) | `requireAdmin` + `getEffectiveLocationId` + `isRuntimeReadOnlyActive()` manual + `resolveCommercialEnforcementContext` | `requireOperationalContext({ module: "fiscal.dte", write: true })` — el guard READ_ONLY manual se retira, queda cubierto por el helper |
| `actions/deliver-invalidation-to-external-db.action.ts` | Server Action | RW (MariaDB) | UI directa, paso opcional post-ACCEPTED | `requireAdmin` + Prisma global | **sin cambios** — deliberado, ver sección S |

No se encontraron más entry points reales (rutas API, cron jobs, scripts) para
`DteInvalidationEvent`/`DteInvalidationEventItem` fuera de los listados arriba —
confirmado por grep exhaustivo de `invalidat|anular|anulacion` en `src/`.

Estados relevantes: `DteInvalidationStatus` = `DRAFT | PENDING_SIGNATURE | SIGNED | SENT | ACCEPTED | REJECTED`
(el código real solo transita `DRAFT → SIGNED → SENT → ACCEPTED|REJECTED`; `PENDING_SIGNATURE`
existe en el enum pero no se usa en el flujo actual). `DteOutgoingDocument.dte_status`
relevante: `ACCEPTED → INVALIDATION_PENDING → INVALIDATED | ACCEPTED` (revertido si MH rechaza).

## C — Semántica real reconstruida (del código, no inventada)

- Solo se puede invalidar un `DteOutgoingDocument` en `dte_status === "ACCEPTED"`.
- Tipos DTE invalidables: `"01"` (FE), `"03"` (CCFE), `"05"` (NC) — `INVALIDABLE_DTE_TYPES`
  en `create-invalidation-event.service.ts`. No hay distinción de código entre
  ACCEPTED y OBSERVED — OBSERVED no está en la lista de estados invalidables (solo
  ACCEPTED literal).
- `reception_stamp` (sello MH) es obligatorio y debe tener exactamente 40 caracteres
  — validado tanto en creación como antes de transmitir.
- `invalidationTypeCode`: `"1" | "2" | "3"` (motivo de anulación MH). La UI del
  orquestador (V1) solo habilita tipo `"2"` (rescindir operación) — restricción de
  producto, no del service, que acepta los 3.
- `responsable`/`solicita`: objetos `{ nombre, tipoDocumento, numeroDocumento }`
  obligatorios en la creación — persona responsable y solicitante ante MH.
- No hay deadline/plazo implementado en código (el plazo legal de 3 días hábiles del
  MH salvadoreño NO está validado en este repositorio — fuera de alcance de esta
  fase, no se inventó).
- Outcome MH ACEPTADO (`estado: "PROCESADO"`): evento → `ACCEPTED`, DTE original →
  `INVALIDATED`, `invalidated_at` seteado.
- Outcome MH RECHAZADO (`estado: "RECHAZADO"`): evento → `REJECTED`, DTE original
  vuelve a `ACCEPTED` (`invalidated_at: null`).
- Error técnico/timeout: evento vuelve a `SIGNED`, DTE original vuelve a `ACCEPTED`
  — reintentable.
- Estado MH inesperado (ni PROCESADO ni RECHAZADO): mismo revert que error técnico,
  mensaje distinto.
- Registro adicional: `DteTransmissionLog` con `operation_type` `"INVALIDATE_SIGN"`
  (firma) o `"INVALIDATE"` (transmisión) — attempt_number incremental por
  `dte_document_id` + `operation_type`.

## D — Contexto de escritura estándar

Los 4 entry points RW manuales/orquestador (`create-invalidation-event.action.ts`,
`sign-invalidation-event.action.ts`, `transmit-invalidation-event.action.ts`,
`create-sign-transmit-invalidation.action.ts`) usan ahora
`requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true })`:

- `RUNTIME_CLIENT` → `context.client` (runtime DB propia).
- `SUPPORT_RUNTIME` → `write: true` + `context.readOnly` → `OperationalContextError("READ_ONLY", ...)`
  ANTES de tocar cualquier service.
- `PLATFORM_NATIVE` → `context.client === prisma` (comportamiento sin cambios).
- Autorización decisiva: `context.effectiveUser.role` (LIVE), nunca el rol del JWT.

`deliver-invalidation-to-external-db.action.ts` **NO** se migró a este helper — sigue
con `requireAdmin` + Prisma global, deliberadamente (ver sección S).

## E, F, G, H, I, J, K — Migración de los 3 servicios core

Ver diffs reales en `create-invalidation-event.service.ts`, `sign-invalidation-event.service.ts`,
`transmit-invalidation-event.service.ts`. Resumen:

- **E/F**: los 3 servicios aceptan `db: PrismaClient = prisma` como último parámetro
  (mismo patrón que `signDteDocument`/`transmitDteDocument`). El DTE original se
  busca SIEMPRE `where: { id, tenant_id, location_id }` contra `db` — el
  `dteDocumentId` del navegador es solo un identificador, nunca autoridad.
  `DTE_INVALIDATION_ORIGINAL_SAME_RUNTIME_DB = YES`.
- **G**: `ALLOWED_FROM_STATUSES` extraído del código real:
  - Creación de evento: DTE debe estar en `dte_status === "ACCEPTED"` exacto.
  - Bloqueo de duplicado: `ACTIVE_INVALIDATION_STATUSES = {DRAFT, PENDING_SIGNATURE, SIGNED, SENT, ACCEPTED}`
    — si existe un evento en cualquiera de esos estados para el mismo
    `dte_document_id`, se rechaza la creación de uno nuevo (no hay soporte para
    invalidaciones concurrentes/múltiples).
  - Firma: evento debe estar en `status === "DRAFT"`, `event_json` presente,
    `signed_jws === null`.
  - Transmisión: evento debe estar en `status === "SIGNED"`, `signed_jws` presente;
    DTE original debe seguir `ACCEPTED`, `invalidated_at === null`,
    `reception_stamp` presente.
  - Tests nuevos cubren: estado permitido, estado no permitido, evento ya activo
    (duplicado), DTE ya invalidado (idempotencia en transmisión).
- **H**: `DTE_INVALIDATION_SAME_RUNTIME_DB = YES` — DTE original, `DteInvalidationEvent`,
  `DteIssuerConfig`, `DteCredential` (vía `resolveDteSignerConfigForIssuer({ client: db })`),
  logs y updates finales pasan siempre por el mismo `db`/`context.client`.
- **I**: `dteDoc.environment` es la autoridad fiscal — se agregó una verificación
  estructural nueva (no existía antes en `create-invalidation-event.service.ts` ni
  en `sign-invalidation-event.service.ts`) que rechaza cualquier mezcla
  `DteIssuerConfig.environment !== DteOutgoingDocument.environment` ANTES de
  construir el JSON o llamar al firmador — mismo criterio agregado a
  `sign-dte-document.service.ts` en VI-E5A. `transmitInvalidationEvent` ya
  determinaba la URL de anulación (`buildAnularUrl`) desde `dteDoc.environment`, sin
  cambios necesarios ahí. `DTE_INVALIDATION_ENVIRONMENT_CONSISTENT = YES`.
- **J**: `signInvalidationEvent` — cambio deliberado de mecanismo de credenciales:
  antes usaba EXCLUSIVAMENTE `DTE_SIGNER_NIT`/`DTE_SIGNER_PASSWORD` (env global) vía
  `resolveDteSignerConfig`. Ahora reusa `resolveDteSignerConfigForIssuer({ issuerConfigId,
  environment, client: db })` — el mismo mecanismo certificado en VI-E5A para
  `sign-dte-document.service.ts`. Si existe una `DteCredential` activa para el
  emisor/ambiente, se usa esa (misma runtime DB); si no, cae al mismo fallback
  global de siempre — nunca cruza ambientes ni bases físicas. El signer real
  (`MhHttpDteSignerAdapter`) sigue siendo el mismo, siempre mockeado en tests.
- **K**: `transmitInvalidationEvent` construye
  `new MhInvalidationTransmissionAdapter(new MhAuthAdapter({ credentialClient: db }))`
  — mismo patrón que `MhDteTransmissionAdapter` en VI-E5B. Todos los updates/logs de
  la transmisión usan `db`.

## L — Riesgo de estado distribuido (crash recovery)

`transmitInvalidationEvent` marca `DteInvalidationEvent.status = "SENT"` y
`DteOutgoingDocument.dte_status = "INVALIDATION_PENDING"` en una transacción **ANTES**
de llamar al adapter de transmisión a MH — igual que `transmit-dte-document.service.ts`
ya hacía antes de VI-E5B (arquitectura preexistente, no introducida por esta fase).

Un crash del proceso entre ese commit y la persistencia del resultado de MH deja el
evento en `SENT` y el DTE en `INVALIDATION_PENDING` de forma indefinida. A diferencia
de la transmisión normal, **`dte-reconciliation.service.ts` (VI-E6A) no tiene ninguna
rama que lea o repare `INVALIDATION_PENDING`** — confirmado por grep, cero matches.

No se implementó un rediseño automático en esta fase (fuera de alcance explícito del
spec — "no big automatic redesign"). Se documenta como deuda:

- **`INVALIDATION_PENDING_CRASH_RECOVERY_SAFE = NO`**
- Estrategia de recuperación esperada hoy: reintento manual — el evento real en DB
  queda en `SENT`/DTE en `INVALIDATION_PENDING`, pero no existe una acción de UI que
  vuelva a intentar `transmitInvalidationEvent` sobre un evento ya `SENT` (el guard
  de precondición exige `status === "SIGNED"`). Esto significa que, en la práctica,
  un crash en este punto requiere intervención manual en base de datos
  (revertir el evento a `SIGNED` y el DTE a `ACCEPTED`) para poder reintentar.
- Recomendación para una fase futura (NO implementada aquí): extender
  `dte-reconciliation.service.ts` para cubrir `DteInvalidationEvent` en `SENT` /
  `DteOutgoingDocument` en `INVALIDATION_PENDING`, tal como ya cubre la transmisión
  normal.

## M, N — Semántica de respuesta MH y estado final

Ver sección C arriba — extraído literal del código de `transmitInvalidationEvent`.
Cuando MH acepta (`PROCESADO`): DTE original → `INVALIDATED`, `invalidated_at`
seteado, `mh_estado`/`mh_sello_recibido`/`mh_codigo_msg`/`mh_descripcion_msg`/
`mh_observaciones` persistidos en el evento. No se registra ningún cambio adicional
de metering en este paso (ver O).

## O — Metering durante invalidación

Confirmado por lectura completa de los 3 servicios: **ninguno importa ni llama**
`dte-fiscal-metering.service.ts` (`reserveDteFiscalCapacity` /
`finalizeDteFiscalCapacityConsumed` / `releaseDteFiscalCapacity`). Un DTE ya
`ACCEPTED` que se invalida sigue contando como consumido en
`fiscal.dte.monthly_issued` — el código NO contradice la semántica esperada, así que
no fue necesario detener la fase ni cambiar nada. Se agregó un test de regresión
explícito (`transmitInvalidationEvent — ... no importa ni llama ningún servicio de
metering`) que falla si algún cambio futuro introduce esa dependencia sin darse cuenta.

**`DTE_INVALIDATION_METERING_REMAINS_CONSUMED = YES`**

## P, Q, R — Aislamiento cross-tenant/location, Support Session, rol efectivo

- Tests nuevos en `create-invalidation-event.service.runtime-write.test.ts`,
  `sign-invalidation-event.service.runtime-write.test.ts` y
  `transmit-invalidation-event.service.runtime-write.test.ts` certifican que un
  `db` cuyo `findFirst` no devuelve el documento/evento (simulando tenant/location
  distinto) bloquea ANTES de tocar el firmador o MH — 0 llamadas externas.
  `transmit-invalidation-event.service.runtime-write.test.ts` agrega además un
  bloque dedicado de aislamiento cross-tenant/cross-location con scoping real
  simulado (mismo patrón que `transmit-dte-document.service.runtime.test.ts` de
  VI-E6A).
- `create-sign-transmit-invalidation.action.test.ts` certifica que
  `OperationalContextError("READ_ONLY", ...)` (Support Session) bloquea ANTES de
  invocar `createInvalidationEvent`/`signInvalidationEvent`/`transmitInvalidationEvent`
  — 0 llamadas a ningún service, sin excepción.
- `DELIVER_EXTERNAL` (permiso general de `requireRuntimeDteWriteAccess`, usado por
  `deliver-dte-to-external-db.action.ts` para FE/CCF/NC) es un mecanismo
  DISTINTO y no relacionado con `fiscal.dte` write vía `requireOperationalContext`
  — tener ese permiso general no implica poder invalidar. La acción de entrega
  externa de invalidación (`deliver-invalidation-to-external-db.action.ts`) sigue
  sobre su propio guard (`requireAdmin` + enforcement comercial), sin relación con
  `DELIVER_EXTERNAL`.
- Autorización decisiva siempre vía `context.effectiveUser.role` (LIVE) —
  heredado automáticamente de `requireOperationalContext`, sin código nuevo de
  autorización en los services.

**`DTE_INVALIDATION_CROSS_TENANT_BLOCKED = YES`**
**`DTE_INVALIDATION_CROSS_LOCATION_BLOCKED = YES`**
**`DTE_SUPPORT_INVALIDATION_BLOCKED = YES`**
**`DTE_INVALIDATION_EFFECTIVE_ROLE_LIVE = YES`**

## S — Delivery externo de invalidación (MariaDB)

`deliver-invalidation-to-external-db.service.ts` se hizo capaz de LEER desde una
runtime DB explícita (`client?: PrismaClient`, default `prisma`) — mismo patrón
preexistente en `deliver-dte-to-external-db.service.ts` (FE/CCF/NC). El delivery a
MariaDB en sí (host/puerto/tabla, vía `getExternalDteMariaDbConfig()` +
`ExternalDteMariaDbAdapter`) sigue siendo siempre el mismo, configurado por
variables de entorno — nunca depende de `client`.

**Deliberadamente NO se tocó** `deliver-invalidation-to-external-db.action.ts` — sigue
sobre `requireAdmin` + Prisma global (nunca pasa `client`). VI-E7 es la fase
reservada para el cierre general de MariaDB/entrega externa (incluye decidir si este
entry point se migra al mecanismo `requireRuntimeDteWriteAccess("DELIVER_EXTERNAL")`
que ya usa su sibling FE/CCF/NC, o a `requireOperationalContext`). Este cambio solo
deja el servicio listo para esa fase futura sin expandir el alcance de VI-E6B.

**`DTE_MARIADB_DELIVERY_RUNTIME_READY = PARTIAL`**

## T — Idempotencia

- Duplicado: `createInvalidationEvent` bloquea si ya existe un evento en cualquier
  estado activo (`DRAFT|PENDING_SIGNATURE|SIGNED|SENT|ACCEPTED`) para el mismo
  `dte_document_id` — test nuevo cubre este caso.
- Retry tras error técnico: el evento vuelve a `SIGNED`/DTE a `ACCEPTED`,
  reintentable sin cambios — cubierto por test.
- Retry tras rechazo MH: el evento queda `REJECTED` (estado terminal en el código
  actual, no está en `ACTIVE_INVALIDATION_STATUSES`) — una nueva invalidación SÍ
  podría crearse para el mismo DTE, porque `REJECTED` no bloquea
  `createInvalidationEvent`. Esto es el comportamiento real del código, no una
  decisión de esta fase — documentado, no cambiado.
- Ya `ACCEPTED`/DTE ya `INVALIDATED`: `transmitInvalidationEvent` rechaza si
  `dteDoc.invalidated_at !== null` — cubierto por test.

## U — Mapa de transacciones

| Service | `$transaction` | Contenido | Red dentro? |
|---|---|---|---|
| `createInvalidationEvent` | ninguna (creates directos) | `DteInvalidationEvent.create` único | No |
| `signInvalidationEvent` | 1 por resultado (éxito o fallo) | update evento + create log | No — la llamada al firmador ocurre ANTES, fuera de la transacción |
| `transmitInvalidationEvent` | hasta 2 por llamada: (1) marca optimista SENT/INVALIDATION_PENDING ANTES de MH, (2) persistencia final (éxito/rechazo/error/inesperado) DESPUÉS de MH | updates evento + DTE + log | No — la llamada a MH ocurre entre las dos transacciones, nunca dentro de una `$transaction` abierta |

Ninguna transacción permanece abierta durante una llamada de red (firmador o MH) —
confirmado por lectura de código. El riesgo real es el gap ENTRE las dos
transacciones de `transmitInvalidationEvent` (ver L), no una transacción abierta
durante la red.

## V — Censo de Prisma global (RUNTIME_CLIENT)

- **`RUNTIME_CLIENT_DTE_INVALIDATION_CREATE_CAN_HIT_GLOBAL_PRISMA = NO`** —
  certificado por `create-invalidation-event.service.runtime-write.test.ts` (mock
  del Prisma global que lanza si se toca).
- **`RUNTIME_CLIENT_DTE_INVALIDATION_SIGN_CAN_HIT_GLOBAL_PRISMA = NO`** —
  certificado por `sign-invalidation-event.service.runtime-write.test.ts`.
- **`RUNTIME_CLIENT_DTE_INVALIDATION_TRANSMIT_CAN_HIT_GLOBAL_PRISMA = NO`** —
  certificado por `transmit-invalidation-event.service.runtime-write.test.ts`.
- `deliver-invalidation-to-external-db.service.ts`: PARTIAL — el servicio es capaz
  de no tocar el global si se le pasa `client`, pero su único entry point productivo
  (`deliver-invalidation-to-external-db.action.ts`) todavía no pasa `client` — sigue
  golpeando el Prisma global en producción hasta VI-E7. Clasificación: `OPTIONAL_DEFAULT_SAFE`
  (capacidad presente, default seguro para PLATFORM_NATIVE, entry point productivo
  aún no lo ejercita para RUNTIME_CLIENT).
- MariaDB externa (config por env, `ExternalDteMariaDbAdapter`) queda fuera del
  censo de Prisma — es una base física distinta, siempre la misma, sin relación con
  el Runtime Database Router.

## W — Auditoría de secretos

Sin cambios respecto al código preexistente: `signed_jws` nunca se loguea completo
(`response_body` solo guarda `{ status: "OK", invalidationEventId }` en éxito),
`last_error`/`error_message` solo contienen el mensaje sanitizado del adapter,
nunca token/password/credential cruda. `resolveDteSignerConfigForIssuer` y
`MhAuthAdapter` ya sanitizaban antes de esta fase — no se tocó su lógica interna de
logging.

## X — Regresión de transmisión normal

Se re-ejecutó la suite completa de DTE (376 tests antes de agregar los nuevos, 413
después solo en `src/modules/commerce/dte/`) — 100% verde, incluyendo
`transmit-dte-document.service.runtime.test.ts`, `dte-transmission.environment-integration.test.ts`
y `reconcile-dte-with-mh.action.test.ts` de fases previas, sin ninguna regresión.
`DTE_NORMAL_TRANSMISSION_RUNTIME_READY` permanece `YES`. Contingencia permanece `NO`
— no se tocó `assertDteContingencyTransmissionAllowed` ni ningún código de
contingencia.

## Y — Deuda TSC

`npx tsc --noEmit` reporta errores ÚNICAMENTE en
`generate-nc-json.service.runtime-write.test.ts` — deuda preexistente ya documentada
desde VI-E4B/E6A, sin relación con los archivos tocados en esta fase. No se corrigió
(fuera de alcance explícito). `TSC_FULL_PASS = NO`, `TYPECHECK_NO_NEW_ERRORS = YES`.

## Z — Tests

37 tests nuevos:

- `create-invalidation-event.service.runtime-write.test.ts` (8): routing a `db`,
  documento no encontrado (cross-tenant/location), documento no ACCEPTED, evento
  activo duplicado, emisor no encontrado, ambiente inconsistente, tipo DTE no
  invalidable, sin `db` explícito (legacy).
- `sign-invalidation-event.service.runtime-write.test.ts` (8): routing a `db`, firma
  exitosa/fallida, evento no encontrado, evento no DRAFT, DTE no ACCEPTED, ambiente
  inconsistente, credencial no resuelta, sin `db` explícito.
- `transmit-invalidation-event.service.runtime-write.test.ts` (12): routing a `db`,
  `MhAuthAdapter({ credentialClient: db })`, MH PROCESADO/RECHAZADO/error técnico,
  evento no encontrado, evento no SIGNED, DTE ya invalidado, DTE sin
  reception_stamp, metering nunca tocado, sin `db` explícito, 2 tests de aislamiento
  cross-tenant/cross-location.
- `create-sign-transmit-invalidation.action.test.ts` (9, nuevo — el orquestador no
  tenía test dedicado antes): guard admin, MODULE_DISABLED, READ_ONLY/Support
  bloqueado antes de cualquier paso, sin location activa, input inválido, mismo
  `context.client` en los 3 pasos, corte en cada paso fallido, MH RECHAZADO revierte
  `dteStatus` a ACCEPTED.

Suite completa: `npx vitest run` → 826/826 tests, 130 archivos, 0 fallos (antes 789).

## AB — Schema / migraciones

`SCHEMA_CHANGE = NO`, `MIGRATION_REQUIRED = NO`. No se tocó `prisma/schema.prisma`.

## Impacto en bases de datos y sincronización local/remota

- **Qué base se tocó**: ninguna estructuralmente — cero cambios de schema, cero
  migraciones. El cambio es 100% de código de aplicación (parámetros `db`/`client`
  inyectables en servicios TypeScript existentes).
- **Qué base no se tocó**: tanto `DATABASE_URL` (runtime local) como `DIRECT_URL`
  (remoto/CLI) permanecen exactamente con la misma estructura de tablas/columnas que
  antes de esta fase.
- **Qué quedó alineado**: nada que alinear — no hay drift de schema introducido por
  VI-E6B.
- **Qué quedó pendiente**: nada relacionado a Prisma/schema. Las fases pendientes
  (VI-E6C contingencia, VI-E7 MariaDB) tampoco requieren cambios de schema
  conocidos hasta ahora.
- **Qué debe ejecutar el usuario después**: nada — no hace falta `npx prisma migrate
  dev`, `npx prisma generate` (más allá del flujo normal de desarrollo) ni ninguna
  sincronización local/remoto adicional para esta fase.

## Flags finales

- `DTE_INVALIDATION_RUNTIME_READY = YES`
- `DTE_INVALIDATION_CREATE_RUNTIME_READY = YES`
- `DTE_INVALIDATION_SIGN_RUNTIME_READY = YES`
- `DTE_INVALIDATION_TRANSMIT_RUNTIME_READY = YES`
- `DTE_INVALIDATION_SAME_RUNTIME_DB = YES`
- `DTE_INVALIDATION_ORIGINAL_SAME_RUNTIME_DB = YES`
- `DTE_INVALIDATION_ENVIRONMENT_CONSISTENT = YES`
- `DTE_INVALIDATION_CROSS_TENANT_BLOCKED = YES`
- `DTE_INVALIDATION_CROSS_LOCATION_BLOCKED = YES`
- `DTE_SUPPORT_INVALIDATION_BLOCKED = YES`
- `DTE_INVALIDATION_EFFECTIVE_ROLE_LIVE = YES`
- `RUNTIME_CLIENT_DTE_INVALIDATION_CREATE_CAN_HIT_GLOBAL_PRISMA = NO`
- `RUNTIME_CLIENT_DTE_INVALIDATION_SIGN_CAN_HIT_GLOBAL_PRISMA = NO`
- `RUNTIME_CLIENT_DTE_INVALIDATION_TRANSMIT_CAN_HIT_GLOBAL_PRISMA = NO`
- `DTE_INVALIDATION_METERING_REMAINS_CONSUMED = YES`
- `INVALIDATION_PENDING_CRASH_RECOVERY_SAFE = NO` (deuda documentada, ver L)
- `DTE_REAL_INVALIDATION_MH_CALLS_PERFORMED = NO`
- `DTE_REAL_INVALIDATION_SIGNER_CALLS_PERFORMED = NO`
- `DTE_MARIADB_DELIVERY_RUNTIME_READY = PARTIAL`
- `DTE_CONTINGENCY_RUNTIME_READY = NO`
- `DTE_CONTINGENCY_TRANSMISSION_RUNTIME_READY = NO`
- `DTE_NORMAL_TRANSMISSION_RUNTIME_READY = YES`
- `DTE_RECONCILIATION_RUNTIME_READY = YES`
- `TSC_FULL_PASS = NO` (deuda preexistente ajena a esta fase)
- `TYPECHECK_NO_NEW_ERRORS = YES`
- `SCHEMA_CHANGE = NO`
- `MIGRATION_REQUIRED = NO`
- `ALL_TESTS_PASS = YES` (826/826)
- `BUILD_PASS = YES`
- `READY_FOR_VI_E6C = YES`
