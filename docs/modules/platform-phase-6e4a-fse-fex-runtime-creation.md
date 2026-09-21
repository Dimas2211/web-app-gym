# FASE VI-E4A — FSE14 + FEX11 runtime creation pipelines

Cerrado. HEAD anterior: `6057381` (VI-E3, FE01+CCFE03). Commit de esta fase: `fix(dte): route fse and fex creation through runtime database`.

## Objetivo

Migrar los pipelines de creación/generación/validación de **FSE 14** (Factura
de Sujeto Excluido, emitida desde `Purchase`) y **FEX 11** (Factura de
Exportación, emitida desde `Sale`) para que un `RUNTIME_CLIENT` opere
completamente en su propia runtime DB, desde el documento comercial fuente
hasta `PENDING_GENERATION → GENERATED → SCHEMA_VALIDATED`. Mismo criterio ya
cerrado en VI-E3 para FE01/CCFE03.

Explícitamente fuera de alcance: firma, transmisión, MH, reconciliación,
invalidación, contingencia, MariaDB, NC05 (diferido a VI-E4B).

## Inventario y estado antes de esta fase

Ambos pipelines estaban 100% en Prisma global, confirmado por el propio
commit `6057381`: *"createPendingDteForPurchase (FSE14), NC05 y FEX11 son
deliberadamente NO tocados — pendiente VI-E4"*. La infraestructura
compartida que ambos consumen ya era runtime-safe desde VI-E3:
`validateDteJsonSchema` (soporta `"14"`/`"11"` en `SCHEMA_MAP`),
`validateDteAddressCodes`/`resolveDteMunicipality` (resolver territorial
único), `reserveDteControlNumber` (siempre recibe `tx` explícito, nunca
importa Prisma directamente en su lógica core), `sale.service.ts`
(`createSaleDraft`/`addSaleItemToDraft`/`confirmSale`, todas con
`db: PrismaClient = prisma` desde VI-D5).

## FSE 14 — archivos migrados

| Archivo | Función | Cambio |
|---|---|---|
| `src/modules/commerce/dte/services/dte-outgoing.service.ts` | `createPendingDteForPurchase` | +parámetro `db: PrismaClient = prisma`; `prisma.$transaction` → `db.$transaction`. `createPendingDteForSale` (FE/CCFE) no se tocó. |
| `src/modules/commerce/dte/actions/create-pending-dte-for-purchase.action.ts` | action | `requireAdmin()` + `resolveCommercialEnforcementContext` manual + `prisma.dteIssuerConfig.findMany` directo → `requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true })`; la resolución de issuer config activa ahora usa `context.client`. |
| `src/modules/commerce/dte/services/generate-fse-json.service.ts` | `generateFseJsonForPurchase` | +parámetro `db` (2º arg); los 3 reads (`DteOutgoingDocument`, `Purchase`, `DteIssuerConfig`) y las 2 llamadas a `validateDteAddressCodes` usan `db`. `buildFseJsonFromLoadedData` es función pura (sin Prisma) — sin cambios. |
| `src/modules/commerce/dte/services/generate-fse-json-pipeline.service.ts` | `generateAndPersistFseJsonForDte` | +parámetro `db` (2º arg); reads/update de `DteOutgoingDocument`, llamada a `generateFseJsonForPurchase` y a `validateDteJsonSchema` propagan `db`. |
| `src/modules/commerce/dte/actions/generate-fse-json-for-purchase.action.ts` | action | mismo cambio de guard que la action de creación; pasa `context.client` al pipeline. |

## FEX 11 — archivos migrados

| Archivo | Función(es) | Cambio |
|---|---|---|
| `src/modules/commerce/sales/export/services/export-sale.service.ts` | `createForeignCustomer`, `loadActiveTestIssuerConfigOrError`, `configureUnitMhCode`, `createPendingExportDte`, `regenerateRejectedExportDte`, `createExportSale` | +parámetro `db` en cada función pública/privada; `createPendingExportDte` usa `db.$transaction` (antes `prisma.$transaction`); `createExportSale` propaga `db` a `createSaleDraft`/`addSaleItemToDraft`/`confirmSale` (ya lo soportaban desde VI-D5, pero no se les pasaba). `listDteCatalogItems` (catálogos DTE) se deja sin cambios — ver clasificación abajo. |
| `src/modules/commerce/sales/export/queries/get-unit-mh-context.ts` | `getUnitMhContext` | +parámetro `db` (3er arg). |
| `src/modules/commerce/sales/export/queries/search-export-products.ts` | `searchExportProducts` | +parámetro `db` (5º arg). |
| `src/modules/commerce/sales/export/queries/search-foreign-customers.ts` | `searchForeignCustomers` | +parámetro `db` (4º arg). |
| `src/modules/commerce/dte/services/generate-fex-json.service.ts` | `generateFexJsonForSale` | +parámetro `db` (2º arg); reads de `DteOutgoingDocument`/`Sale`/`DteIssuerConfig` y la llamada a `validateDteAddressCodes` usan `db`. `buildFexJsonFromLoadedData` es pura — sin cambios. |
| `src/modules/commerce/dte/services/generate-fex-json-pipeline.service.ts` | `generateAndPersistFexJsonForDte` | +parámetro `db` (2º arg), mismo patrón que FSE. |
| `src/modules/commerce/dte/actions/generate-fex-json-for-sale.action.ts` | action | `requireAdmin()`+`getEffectiveLocationId()` → `requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true })`. |
| `src/modules/commerce/sales/export/actions/export-sale.actions.ts` | 6 actions (`searchForeignCustomersAction`, `searchExportProductsAction`, `getUnitMhContextAction`, `configureExportUnitMhCodeAction`, `createForeignCustomerAction`, `createExportSaleAction`) | guard único `requireExportSession()` reescrito sobre `requireOperationalContext(sessionUser, { module: "commerce.sales", write })` (antes `requireAdmin()`+`getEffectiveLocationId()`+`resolveCommercialEnforcementContext` manual); cada action propaga `context.client`. |
| `src/modules/commerce/sales/export/actions/export-sale-dte.actions.ts` | panel DTE del módulo | mismo guard reescrito; `loadExportDteState`/`loadExportDteStateOrError` reciben `db` explícito. Las actions que delega sin cambios (`signDteDocumentAction`, `transmitDteDocumentAction`, `deliverDteToExternalDbAction`) — fuera de alcance, mantienen su propio guard `fiscal.dte`. |

### `listDteCatalogItems` — no migrado, por diseño

`src/modules/commerce/dte/queries/list-dte-catalog-items.ts` lee
`DteCatalogItem`, un modelo **sin `tenant_id`** en `schema.prisma` — catálogo
de sistema (CAT-027, CAT-028, CAT-029, CAT-031, CAT-015, FEX-11-V1-CODPAIS),
igual para toda organización. Clasificación: `GLOBAL_REFERENCE`. A
diferencia de `UnitOfMeasure`/`Municipality` (`RUNTIME_REFERENCE` — mismo
concepto pero con `id` físico local por runtime DB, referenciado por FK),
`DteCatalogItem` no tiene ese problema: no hay ambigüedad de `id` entre
runtime DBs porque nunca se referencia por FK desde datos tenant-owned, solo
se consulta por `catalog_code`/`item_code`. No se tocó.

## Patrón de contexto operacional

Idéntico a VI-E3 — ninguna función/resolver nueva:

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

`export-sale.actions.ts`/`export-sale-dte.actions.ts` usan module
`commerce.sales` (mismo module code que su guard manual previo
`assertOrganizationModule(commercialCtx, "commerce.sales")`), no
`fiscal.dte` — el panel de exportación es comercial; las actions DTE que
delega llevan su propio guard `fiscal.dte` internamente (sin cambios).

## Transacciones

| $transaction | Root client | Reads/writes dentro | Same-runtime | Llamadas de red dentro |
|---|---|---|---|---|
| `createPendingDteForPurchase` (`dte-outgoing.service.ts`) | `db` (antes `prisma`) | Purchase, DteOutgoingDocument (findFirst dup-check + create), DteIssuerConfig, DteCorrelative (`reserveDteControlNumber`) | Sí | No |
| `createPendingExportDte` (`export-sale.service.ts`) | `db` (antes `prisma`) | DteOutgoingDocument (create), DteCorrelative (`reserveDteControlNumber`) | Sí | No |

Ningún otro `$transaction` nuevo — `createExportSale` sigue orquestando
`createSaleDraft`/`addSaleItemToDraft`/`confirmSale`/`createPendingExportDte`
como pasos secuenciales (no una única transacción envolvente), mismo diseño
previo a esta fase — solo cada paso ahora recibe `db` consistente.

## Idempotencia y cross-tenant

Sin cambios de reglas: duplicado activo de FSE14 por `purchase_id` +
`dte_type_code: "14"` y de FEX11 por `sale_id` + `dte_type_code: "11"` siguen
excluyendo `NOT_REQUIRED`/`INVALIDATED`/`REJECTED` del bloqueo (mismo
criterio F3-C24 que FE/CCFE). Todo lookup de `Purchase`/`Sale`/
`DteOutgoingDocument` filtra por `tenant_id`+`location_id` efectivos
(`context.tenantId`/`context.locationId`), nunca por valores del body —
fail closed ya probado por los tests de "otro tenant/location" en los
`*.runtime-write.test.ts` nuevos.

## Tests

4 archivos nuevos, 16 casos, mismo patrón que VI-E3 (`vi.mock("@/lib/db/prisma")`
lanza si algo toca el Prisma global; se pasa un `db` fake y se certifica que
solo ese `db` se usa; caso adicional sin `db` explícito certifica que el
default sigue siendo Prisma global, comportamiento preservado):

- `dte-outgoing.service.create-pending-dte-for-purchase.runtime-write.test.ts` (4)
- `generate-fse-json.service.runtime-write.test.ts` (3)
- `generate-fex-json.service.runtime-write.test.ts` (3)
- `export-sale/queries/export-queries.runtime-write.test.ts` (6 — `getUnitMhContext`, `searchExportProducts`, `searchForeignCustomers`)

Suite completa: **718/718 PASS** (antes 702/702). `tsc --noEmit`, `npm run
lint` y `npm run build` verdes. Sin regresiones en FE01/CCFE03/VI-E2A/VI-E2B
(re-ejecutados como parte de la suite completa).

## Impacto en bases de datos y sincronización local/remota

- **`schema.prisma`**: sin cambios. `SCHEMA_CHANGE = NO`.
- **Migraciones**: ninguna generada ni aplicada. `MIGRATION_REQUIRED = NO`.
- **Qué se tocó**: solo código TypeScript (routing de `db`/`client` y guard
  de autorización). Ninguna tabla, columna, índice ni seed cambió.
- **Local vs remoto**: no aplica — no hay divergencia posible porque no se
  tocó el schema. `DATABASE_URL`/`DIRECT_URL` no requieren ninguna acción
  del usuario para esta fase.

## Flags finales

```
FSE14_PENDING_CREATION_RUNTIME_READY = YES
FSE14_JSON_GENERATION_RUNTIME_READY = YES
FSE14_SCHEMA_VALIDATION_RUNTIME_READY = YES
FSE14_CREATION_SAME_RUNTIME_DB = YES
FSE14_RETENTION_SOURCE_RUNTIME_SAFE = YES

FEX11_PENDING_CREATION_RUNTIME_READY = YES
FEX11_JSON_GENERATION_RUNTIME_READY = YES
FEX11_SCHEMA_VALIDATION_RUNTIME_READY = YES
FEX11_CREATION_SAME_RUNTIME_DB = YES
FEX11_UNIT_REFERENCE_RUNTIME_SAFE = YES
FEX11_FOREIGN_CUSTOMER_RUNTIME_SAFE = YES

RUNTIME_CLIENT_FSE14_CREATION_CAN_HIT_GLOBAL_PRISMA = NO
RUNTIME_CLIENT_FSE14_GENERATION_CAN_HIT_GLOBAL_PRISMA = NO
RUNTIME_CLIENT_FEX11_CREATION_CAN_HIT_GLOBAL_PRISMA = NO
RUNTIME_CLIENT_FEX11_GENERATION_CAN_HIT_GLOBAL_PRISMA = NO
RUNTIME_CLIENT_FEX11_LOOKUPS_CAN_HIT_GLOBAL_PRISMA = NO

FSE_FEX_CROSS_TENANT_BLOCKED = YES
FSE_FEX_CROSS_LOCATION_BLOCKED = YES
FSE_FEX_ENVIRONMENT_CONSISTENT = YES

DTE_SUPPORT_FSE_FEX_WRITES_BLOCKED = YES
DTE_FSE_FEX_EFFECTIVE_ROLE_LIVE = YES

FE01_RUNTIME_READY = PARTIAL
CCFE03_RUNTIME_READY = PARTIAL
FSE14_RUNTIME_READY = PARTIAL   # pendiente firma/transmisión (VI-E5)
FEX11_RUNTIME_READY = PARTIAL   # pendiente firma/transmisión (VI-E5)
NC05_RUNTIME_READY = NO

DTE_CREATION_RUNTIME_READY = PARTIAL   # FE01/CCFE03/FSE14/FEX11 cubiertos; NC05 pendiente
DTE_SIGNING_RUNTIME_READY = NO
DTE_TRANSMISSION_RUNTIME_READY = NO
DTE_MUTATIVE_EXTERNAL_PIPELINE_TOUCHED = NO

SCHEMA_CHANGE = NO
MIGRATION_REQUIRED = NO

ALL_TESTS_PASS = YES   (718/718)
BUILD_PASS = YES

READY_FOR_VI_E4B = YES

BLOCKERS = []
```

## Fuera de alcance (confirmado, no tocado)

NC05, firma (`sign-dte-document.*`), transmisión (`transmit-dte-document.*`),
adaptador MH, reconciliación, invalidación, contingencia, metering de
transmisión, delivery MariaDB. `commerce/sales/export/fex11-test/**`
(consola de pruebas dev-only) y `commerce/dte/dev/verify-fse14-*`/
`verify-fex11-*` (scripts dev-only con `PrismaClient` directo) no se
tocaron — no son entry points productivos.
