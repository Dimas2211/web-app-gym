# FASE VI-E4B — NC05 runtime creation pipeline

Cerrado. HEAD anterior: `25fe27d` (VI-E4A, FSE14+FEX11). Commit de esta fase: `fix(dte): route credit note creation through runtime database`.

## Objetivo

Migrar el pipeline de creación/generación/validación de **NC 05** (Nota de
Crédito, emitida sobre un CCFE 03 ACCEPTED) para que un `RUNTIME_CLIENT`
opere completamente en su propia runtime DB, desde la referencia al DTE
original hasta `PENDING_GENERATION → GENERATED → SCHEMA_VALIDATED`. Mismo
criterio ya cerrado en VI-E3 (FE01/CCFE03) y VI-E4A (FSE14/FEX11). Con esta
fase, **NC05 es el último documento DTE productivo pendiente** — el bloque
de creación queda completo.

Explícitamente fuera de alcance: firma, transmisión, MH, reconciliación,
invalidación, contingencia, MariaDB, metering de transmisión.

## Inventario y estado antes de esta fase

NC05 estaba 100% en Prisma global, confirmado por el propio commit `6057381`
(VI-E3): *"NC05 y FEX11 son deliberadamente NO tocados — pendiente VI-E4"*, y
reconfirmado por VI-E4A: *"NC 05 (Nota de Crédito) — depende del DTE original
y requiere checks de ownership/estado referencial propios, no tocado"*. La
infraestructura compartida que consume ya era runtime-safe desde VI-E3:
`validateDteJsonSchema` (`SCHEMA_MAP["05"]` ya definido, acepta `db` desde su
firma original), `validateDteAddressCodes` (resolver territorial único),
`reserveDteControlNumber` (siempre recibe `tx` explícito, nunca importa
Prisma en su lógica core).

No existían tests para NC05 (`create-credit-note-dte.service.ts`,
`generate-nc-json.service.ts` y sus 3 actions no tenían ningún archivo
`*.test.ts`) — esta fase los introduce desde cero.

## Archivos migrados

| Archivo | Función | Cambio |
|---|---|---|
| `src/modules/commerce/dte/services/create-credit-note-dte.service.ts` | `createCreditNoteDteFromAcceptedCcfe` | +parámetro `db: PrismaClient = prisma` (2º arg); `prisma.$transaction` → `db.$transaction`. Toda la lógica (lookup del CCFE original, bloqueo de duplicado, issuer config, `reserveDteControlNumber`, create del NC + `DteDocumentRelation`) ya vivía dentro de `tx` — sin cambios de reglas, solo el root client de la transacción. |
| `src/modules/commerce/dte/services/generate-nc-json.service.ts` | `generateNcJsonForDte` | +parámetro `db: PrismaClient = prisma` (2º arg); los 4 reads (`DteOutgoingDocument` del NC, `DteDocumentRelation`, `DteOutgoingDocument` del CCFE original, `DteIssuerConfig`) y el `update` final usan `db`; `validateDteAddressCodes` recibe `db` explícito (antes usaba el default global implícito). Ninguna fórmula fiscal (mapeo de `cuerpoDocumento`, cálculo de `resumen`/IVA) cambió. |
| `src/modules/commerce/dte/actions/create-credit-note-dte.action.ts` | action | `requireAdmin()` + `getEffectiveLocationId()` + `resolveCommercialEnforcementContext`/`assertOrganizationModule` manual → `requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true })`; pasa `context.client` al servicio. |
| `src/modules/commerce/dte/actions/generate-nc-json.action.ts` | action | mismo cambio de guard; pasa `context.client` al servicio. |
| `src/modules/commerce/dte/actions/create-and-transmit-credit-note.action.ts` | orquestador (crear→generar→validar→firmar→transmitir) | mismo cambio de guard — reemplaza el blindaje manual `isRuntimeReadOnlyActive()` + `resolveCommercialEnforcementContext` por `requireOperationalContext({ write: true })`. Los 3 primeros pasos (crear NC, generar JSON, validar schema) reciben `context.client`. `signDteDocument`/`transmitDteDocument` (fuera de alcance VI-E4B/pendientes VI-E5) quedan intactos — solo reciben `tenantId`/`locationId`/`userId` ya resueltos por el contexto, sin ningún `client` explícito (siguen operando sobre Prisma global internamente, mismo comportamiento previo a esta fase). |

## Original DTE same-runtime invariant

El CCFE 03 que la NC modifica se busca en dos puntos independientes, ambos
ahora contra `db` (runtime DB efectiva del tenant que emite la NC):

1. `create-credit-note-dte.service.ts` — dentro de `db.$transaction`:
   `tx.dteOutgoingDocument.findFirst({ where: { id: sourceDteDocumentId, tenant_id, location_id } })`.
2. `generate-nc-json.service.ts` — vía `DteDocumentRelation` (`relation_type: "CREDIT_NOTE_OF"`)
   creada en el paso 1: `db.dteOutgoingDocument.findFirst({ where: { id: related_dte_document_id, tenant_id, location_id } })`.

Ambos lookups siguen filtrando siempre por `tenant_id`+`location_id`
efectivos (nunca por lo que envíe el cliente). Un CCFE que solo existe en
otra runtime DB física (otro tenant) es indistinguible de "no existe" —
comportamiento fail-closed ya presente antes de esta fase, ahora certificado
explícitamente contra `db` con tests de "otro tenant/location" en los
`*.runtime-write.test.ts` nuevos. No hay comparación de IDs cross-runtime
posible: como el lookup usa el mismo `db` que abrió la transacción/request,
un ID de otro runtime simplemente no aparece en esa DB.

## Reglas de negocio preservadas (sin cambios)

- Origen: solo `dte_type_code === "03"` en `dte_status === "ACCEPTED"`, con
  `generation_code`/`control_number`/`reception_stamp`/`json_document`
  presentes (documento fiscalmente cerrado).
- Idempotencia: bloquea una segunda NC activa sobre el mismo CCFE vía
  `DteDocumentRelation` + `dte_status NOT IN (INVALIDATED, REJECTED)` — una
  NC rechazada por MH no bloquea un reintento (regla F3-C24).
- NC05 V1 es crédito **total** únicamente (sin selección parcial de ítems);
  `cuerpoDocumento` se espeja 1:1 del CCFE con montos en valor absoluto.
- `generateNcJsonForDte` solo opera sobre `dte_status === "PENDING_GENERATION"`
  y rechaza si `json_document` ya existe (idempotencia de generación).
- Correlativo tipo `"05"` reservado atómicamente dentro de la misma
  transacción vía `reserveDteControlNumber(tx, …)` — sin cambios de lógica,
  solo hereda el `tx` correcto (derivado de `db`).
- `sale_id` se copia del CCFE original por trazabilidad, sin validar
  `Sale.status` (NC05 no toca inventario ni caja, según diseño V1/V2).

## Patrón de contexto operacional

Idéntico a VI-E3/VI-E4A — ninguna función/resolver nueva:

```ts
const sessionUser = await requireAdmin();
let handle;
try {
  handle = await requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true });
} catch (err) {
  if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
  throw err;
}
const { context, dispose } = handle;
try {
  // usa context.client / context.tenantId / context.locationId / context.effectiveUser.id
} finally {
  await dispose();
}
```

## Transacciones

| $transaction | Root client | Reads/writes dentro | Same-runtime | Llamadas de red dentro |
|---|---|---|---|---|
| `createCreditNoteDteFromAcceptedCcfe` (`create-credit-note-dte.service.ts`) | `db` (antes `prisma`) | DteOutgoingDocument (findFirst original + create NC), DteDocumentRelation (findFirst dup-check + create), DteIssuerConfig, DteCorrelative (`reserveDteControlNumber`) | Sí | No |

`generateNcJsonForDte` no abre transacción propia (mismo diseño previo a
esta fase — reads secuenciales + un único `update` final), todos contra el
mismo `db` inyectado.

## Global Prisma census

`RUNTIME_CLIENT_NC05_CREATION_CAN_HIT_GLOBAL_PRISMA = NO` y
`RUNTIME_CLIENT_NC05_GENERATION_CAN_HIT_GLOBAL_PRISMA = NO` certificados por
los `*.runtime-write.test.ts` nuevos: mockean `@/lib/db/prisma` con un Proxy
que lanza si cualquier propiedad se lee, corren cada servicio con un `db`
fake y confirman que solo ese `db` se usó; un caso adicional sin `db`
explícito confirma que el default sigue siendo Prisma global (comportamiento
preservado para cualquier caller no migrado, hoy ninguno).
`RUNTIME_CLIENT_NC05_VALIDATION_CAN_HIT_GLOBAL_PRISMA = NO` — hereda de
`validateDteJsonSchema`, ya certificado en VI-E3, ahora invocado con
`context.client` desde los 3 entry points de NC05.

## Idempotencia y cross-tenant

Sin cambios de reglas — ver "Reglas de negocio preservadas" arriba. Todo
lookup de `DteOutgoingDocument`/`DteDocumentRelation`/`DteIssuerConfig`
filtra por `tenant_id`+`location_id` efectivos (`context.tenantId`/
`context.locationId`), nunca por valores del body — fail closed probado por
los tests de "otro tenant/location" en los `*.runtime-write.test.ts` nuevos.

## Support session y rol efectivo

Las 3 actions (`create-credit-note-dte.action.ts`, `generate-nc-json.action.ts`,
`create-and-transmit-credit-note.action.ts`) usan `requireOperationalContext(
sessionUser, { module: "fiscal.dte", write: true })`, que bloquea
estructuralmente cualquier escritura bajo Support Session (`READ_ONLY` antes
de tocar la DB) — cierra el gap identificado en el inventario: antes de esta
fase, `create-credit-note-dte.action.ts` y `generate-nc-json.action.ts` no
tenían ningún guard de solo-lectura propio (solo el orquestador lo tenía, vía
`isRuntimeReadOnlyActive()` manual, ahora removido por redundante).
`context.effectiveUser.role` es el rol LIVE (no el JWT stale) — mismo criterio
que el resto de módulos migrados a `requireOperationalContext`.

## Tests

3 archivos nuevos de servicio/acción, 23 casos, mismo patrón que VI-E3/VI-E4A:

- `create-credit-note-dte.service.runtime-write.test.ts` (6)
- `generate-nc-json.service.runtime-write.test.ts` (4)
- `create-credit-note-dte.action.test.ts` (4)
- `generate-nc-json.action.test.ts` (4)
- `create-and-transmit-credit-note.action.test.ts` (5)

Suite completa: **741/741 PASS** (antes 718/718). `tsc --noEmit`, `npm run
lint` y `npm run build` verdes. Sin regresiones en FE01/CCFE03/FSE14/FEX11/
VI-E2A/VI-E2B (re-ejecutados como parte de la suite completa).

## Impacto en bases de datos y sincronización local/remota

- **`schema.prisma`**: sin cambios. `SCHEMA_CHANGE = NO`.
- **Migraciones**: ninguna generada ni aplicada. `MIGRATION_REQUIRED = NO`.
- **Qué se tocó**: solo código TypeScript (routing de `db`/`client` y guard
  de autorización). Ninguna tabla, columna, índice ni seed cambió.
- **Local vs remoto**: no aplica — no hay divergencia posible porque no se
  tocó el schema. `DATABASE_URL`/`DIRECT_URL` no requieren ninguna acción del
  usuario para esta fase.

## Flags finales

```
NC05_PENDING_CREATION_RUNTIME_READY = YES
NC05_JSON_GENERATION_RUNTIME_READY = YES
NC05_SCHEMA_VALIDATION_RUNTIME_READY = YES

NC05_ORIGINAL_DTE_SAME_RUNTIME_DB = YES
NC05_ORIGINAL_DTE_OWNERSHIP_SAFE = YES
NC05_ORIGINAL_DTE_STATE_RULES_PRESERVED = YES

NC05_CORRELATIVE_RUNTIME_SAFE = YES
NC05_UNIT_REFERENCE_RUNTIME_SAFE = YES
NC05_RELATED_DOCUMENT_RUNTIME_SAFE = YES

RUNTIME_CLIENT_NC05_CREATION_CAN_HIT_GLOBAL_PRISMA = NO
RUNTIME_CLIENT_NC05_GENERATION_CAN_HIT_GLOBAL_PRISMA = NO
RUNTIME_CLIENT_NC05_VALIDATION_CAN_HIT_GLOBAL_PRISMA = NO

NC05_CROSS_TENANT_BLOCKED = YES
NC05_CROSS_LOCATION_BLOCKED = YES
NC05_ENVIRONMENT_CONSISTENT = YES

DTE_SUPPORT_NC05_WRITES_BLOCKED = YES
DTE_NC05_EFFECTIVE_ROLE_LIVE = YES

FE01_RUNTIME_READY = PARTIAL
CCFE03_RUNTIME_READY = PARTIAL
FSE14_RUNTIME_READY = PARTIAL
FEX11_RUNTIME_READY = PARTIAL

NC05_RUNTIME_READY = PARTIAL   # pendiente firma/transmisión (VI-E5)

DTE_CREATION_RUNTIME_READY = YES   # FE01/CCFE03/FSE14/FEX11/NC05 cubiertos hasta SCHEMA_VALIDATED

DTE_SIGNING_RUNTIME_READY = NO
DTE_TRANSMISSION_RUNTIME_READY = NO

DTE_MUTATIVE_EXTERNAL_PIPELINE_TOUCHED = NO

SCHEMA_CHANGE = NO
MIGRATION_REQUIRED = NO

ALL_TESTS_PASS = YES   (741/741)
BUILD_PASS = YES

READY_FOR_VI_E5 = YES

BLOCKERS = []
```

## Fuera de alcance (confirmado, no tocado)

Firma (`sign-dte-document.*`), transmisión (`transmit-dte-document.*`),
adaptador MH, reconciliación, invalidación, contingencia, metering de
transmisión, delivery MariaDB. `create-and-transmit-credit-note.action.ts`
sigue orquestando hasta transmisión (comportamiento de producto existente,
sin cambios funcionales) — solo los 3 primeros pasos quedan runtime-aware;
los 2 últimos (firma/transmisión) siguen sobre Prisma global, deuda ya
registrada y explícitamente diferida a VI-E5 en las fases previas.
