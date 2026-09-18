# FASE VI-E3 — FE01 + CCFE03 Runtime Creation Pipeline

## Objetivo

Migrar el pipeline de creación → generación → validación de schema de FE 01 y CCFE 03 (emitidos desde `Sale`) para que un RUNTIME_CLIENT lo ejecute enteramente contra su propia DB física, sin tocar Prisma global en ningún punto del camino. Alcance de estado: `PENDING_GENERATION → GENERATED → SCHEMA_VALIDATED`. NO firma, NO transmite, NO MH, NO MariaDB, NO reconciliación, NO invalidación, NO contingencia — igual que las fases anteriores del bloque VI-E.

## Inventario de superficie FE01/CCFE03

| Path | Función | FE/CCFE | R/W | DB antes | DB después |
|---|---|---|---|---|---|
| `services/dte-outgoing.service.ts` | `createPendingDteForSale` | Ambos | R/W (tx) | Prisma global | `db` inyectado (default `prisma`) |
| `services/dte-outgoing.service.ts` | `createPendingDteForPurchase` (FSE14) | — | R/W (tx) | Prisma global | **sin cambios** (fuera de alcance) |
| `services/dte-correlative.service.ts` | `reserveDteControlNumber` | Ambos | W (tx) | ya recibía `tx` | sin cambios (ya certificado en F3-C24) |
| `services/generate-fe-json.service.ts` | `generateFeJsonForDte` | FE 01 | R/W | Prisma global | `db` inyectado (default `prisma`) |
| `services/generate-ccfe-json.service.ts` | `generateCcfeJsonForDte` | CCFE 03 | R/W | Prisma global | `db` inyectado (default `prisma`) |
| `services/validate-dte-json-schema.service.ts` | `validateDteJsonSchema` | 01/03/05/11/14 (schema map) | R/W | Prisma global | `db` inyectado (default `prisma`) |
| `utils/dte-territory.resolver.ts` | `resolveDteMunicipality` / `validateDteAddressCodes` | Ambos (vía builders) | R | Prisma global | `db` inyectado (default `prisma`) |
| `actions/create-pending-dte-for-sale.action.ts` | Server Action | Ambos | W | `requireAdmin` + Prisma global | `requireOperationalContext(module:"fiscal.dte", write:true)` |
| `actions/create-pending-dte-simple.action.ts` | Server Action | Ambos | W | `requireAdmin` + Prisma global (lookups directos de Sale/DteIssuerConfig) | `requireOperationalContext` + lookups vía `context.client` |
| `actions/generate-fe-json-for-sale.action.ts` | Server Action | FE 01 | W | `requireAdmin` + Prisma global | `requireOperationalContext` |
| `actions/generate-ccfe-json-for-sale.action.ts` | Server Action | CCFE 03 | W | `requireAdmin` + Prisma global | `requireOperationalContext` |
| `actions/validate-dte-json-schema.action.ts` | Server Action | Ambos | W | `requireAdmin` + Prisma global | `requireOperationalContext` |
| `api/dte/outgoing/pending/route.ts` | `POST` | Ambos | W | `requireAdmin` + Prisma global | `getDteApiContext` (mismo patrón que `issuer-config/route.ts`) |

Fuera de alcance (no tocado, confirmado por censo): `create-and-transmit-credit-note.action.ts` (NC 05), `generate-fse-json-pipeline.service.ts` / `create-pending-dte-for-purchase.action.ts` (FSE 14), `generate-fex-json-pipeline.service.ts` (FEX 11), scripts `dev/verify-*.ts` (herramientas de desarrollo, no entry points productivos).

## Contexto operacional

Mismo patrón certificado en VI-E2B (`requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true })` para Server Actions, `getDteApiContext(req)` para el Route Handler) — no se creó ningún router/mecanismo de auth nuevo. `context.client`/`ctx.client` es la DB efectiva (runtime propia para RUNTIME_CLIENT, global para PLATFORM_NATIVE); `context.readOnly`/`ctx.readOnly` bloquea Support Session antes de tocar la DB; `context.effectiveRole` es el rol LIVE.

## createPendingDteForSale — transacción raíz

`db.$transaction(async (tx) => {...})` — TODO (Sale lookup, chequeo de DTE activo duplicado, DteIssuerConfig, `reserveDteControlNumber(tx, ...)`, `DteOutgoingDocument.create`) ocurre dentro de ese mismo `tx`, originado en `db` (runtime para RUNTIME_CLIENT). `createPendingDteForPurchase` (FSE14) sigue usando `prisma.$transaction` sin cambios — deliberadamente fuera de alcance, sin compartir código de transacción con la ruta de venta.

## Same-runtime invariant

`FE_CCFE_CREATION_SAME_RUNTIME_DB = YES` — Sale, Customer, SaleItems, DteIssuerConfig, DteCorrelative y DteOutgoingDocument se leen/escriben todos a través del mismo `db`/`context.client` pasado desde la action. No hay ningún punto donde el pipeline mezcle un read de Prisma global con un write runtime o viceversa.

## Sale ownership

`create-pending-dte-simple.action.ts` ya no hace `prisma.sale.findFirst` directo — usa `context.client.sale.findFirst({ where: { id: sale_id, tenant_id: context.tenantId, location_id: context.locationId } })`. Un `sale_id` cross-tenant/cross-location simplemente no aparece en esa query (fail closed, sin lookup global de respaldo).

## UnitOfMeasure y Municipality (referencia territorial)

- `uniMedida` en los builders FE/CCFE sigue hardcodeado a `59` (decisión MVP ya documentada, no toca DB) — `DTE_FE_CCFE_UNIT_REFERENCE_RUNTIME_SAFE = YES` (no hay lookup, nada que migrar).
- `Municipality` (usado por `validateDteAddressCodes`) se reclasifica como **RUNTIME_REFERENCE**: mismo criterio que `UnitOfMeasure` en VI-D9 — son códigos oficiales estables (CAT-012/municipios), pero cada runtime DB física tiene su propia copia seedeada; el id interno (`uuid()`) no es portable entre bases. El resolver ahora acepta `db: PrismaClient = prisma` y los builders FE/CCFE se lo pasan explícitamente.

## Validación de schema (AJV)

AJV/Zod son puros — no tocan DB. `validateDteJsonSchema` solo necesita `db` para el read (`DteOutgoingDocument.json_document`) y el write final (`GENERATED → SCHEMA_VALIDATED`), ambos ahora contra el `db` inyectado.

## Support Session

Los 6 entry points migrados usan `write: true` (Server Actions) o `ctx.readOnly` (Route Handler) — Support Session recibe `OperationalContextError("READ_ONLY", ...)` / 403 antes de ejecutar cualquier query, certificado por tests (`requireOperationalContext` rechazado → el service/builder correspondiente `not.toHaveBeenCalled()`).

## Environment consistency

Sin cambios de comportamiento: `createPendingDteForSale` sigue exigiendo `DteIssuerConfig.environment === input.environment` (`is_active: true`) antes de reservar correlativo; los builders leen `environment` desde el mismo `DteOutgoingDocument`/`DteIssuerConfig` ya persistidos — nunca se desalinean porque ambos provienen del mismo `db`.

## Idempotencia / duplicados

Sin cambios: el chequeo de DTE activo duplicado (`dte_status: { notIn: ["NOT_REQUIRED","INVALIDATED","REJECTED"] }`) sigue dentro de la misma transacción raíz, ahora simplemente sobre `tx` originado en `db`.

## Tests

35 tests nuevos (10 archivos):
- `create-pending-dte-for-sale.action.test.ts` (4), `create-pending-dte-simple.action.test.ts` (5), `generate-fe-json-for-sale.action.test.ts` (4), `generate-ccfe-json-for-sale.action.test.ts` (4), `validate-dte-json-schema.action.test.ts` (4) — Support Session bloqueada, forwarding de `context.client`/tenant/location, sin location activa, Sale cross-tenant rechazada.
- `dte-outgoing.service.create-pending-dte-for-sale.runtime-write.test.ts` (4), `generate-fe-json.service.runtime-write.test.ts` (3), `generate-ccfe-json.service.runtime-write.test.ts` (3), `validate-dte-json-schema.service.runtime-write.test.ts` (4) — Prisma global mockeado para **lanzar** si se toca (certifica `CAN_HIT_GLOBAL_PRISMA = NO`), y verifican que sin `db` explícito el default sigue siendo Prisma global (compatibilidad con callers no migrados).

Suite completa del módulo DTE: 295/295. Suite completa del repo: 702/702. `tsc --noEmit`, `npm run lint` (solo warnings preexistentes no relacionados) y `npm run build` verdes.

## Impacto en bases de datos y sincronización local/remota

- `schema.prisma`: **sin cambios**.
- Migraciones: **ninguna nueva** (`MIGRATION_REQUIRED = NO`).
- Esta fase es puramente de código (threading de un parámetro `db` explícito + reenrutado de 6 entry points) — no requiere `npx prisma migrate` ni tocar `DATABASE_URL`/`DIRECT_URL`.
- Local y remoto no se desincronizan por este cambio — no hay nada que aplicar en ninguna base.

## Flags finales

```
DTE_API_CONTEXT_RUNTIME_READY = YES
DTE_GET_READS_RUNTIME_READY = YES

DTE_ISSUER_CONFIG_RUNTIME_READY = YES
DTE_CREDENTIAL_RUNTIME_READY = YES
DTE_CORRELATIVE_SERVICE_RUNTIME_CAPABLE = YES

FE01_PENDING_CREATION_RUNTIME_READY = YES
CCFE03_PENDING_CREATION_RUNTIME_READY = YES

FE01_JSON_GENERATION_RUNTIME_READY = YES
CCFE03_JSON_GENERATION_RUNTIME_READY = YES

FE01_SCHEMA_VALIDATION_RUNTIME_READY = YES
CCFE03_SCHEMA_VALIDATION_RUNTIME_READY = YES

FE_CCFE_CREATION_SAME_RUNTIME_DB = YES
DTE_FE_CCFE_UNIT_REFERENCE_RUNTIME_SAFE = YES

RUNTIME_CLIENT_FE01_CREATION_CAN_HIT_GLOBAL_PRISMA = NO
RUNTIME_CLIENT_CCFE03_CREATION_CAN_HIT_GLOBAL_PRISMA = NO
RUNTIME_CLIENT_FE01_GENERATION_CAN_HIT_GLOBAL_PRISMA = NO
RUNTIME_CLIENT_CCFE03_GENERATION_CAN_HIT_GLOBAL_PRISMA = NO

FE_CCFE_CROSS_TENANT_BLOCKED = YES
FE_CCFE_CROSS_LOCATION_BLOCKED = YES

FE_CCFE_ENVIRONMENT_CONSISTENT = YES

DTE_SUPPORT_FE_CCFE_WRITES_BLOCKED = YES
DTE_FE_CCFE_EFFECTIVE_ROLE_LIVE = YES

DTE_CREATION_RUNTIME_READY = PARTIAL   # solo FE01/CCFE03 en VI-E3
FE01_RUNTIME_READY = PARTIAL           # pendiente signing/transmission
CCFE03_RUNTIME_READY = PARTIAL

FEX11_RUNTIME_READY = NO   # pendiente VI-E4
FSE14_RUNTIME_READY = NO   # pendiente VI-E4
NC05_RUNTIME_READY = NO    # pendiente VI-E4

DTE_SIGNING_RUNTIME_READY = NO         # pendiente VI-E5
DTE_TRANSMISSION_RUNTIME_READY = NO    # pendiente VI-E5
MH_AUTH_RUNTIME_READY = NO             # heredado, no tocado en esta fase

DTE_MUTATIVE_EXTERNAL_PIPELINE_TOUCHED = NO

SCHEMA_CHANGE = NO
MIGRATION_REQUIRED = NO

ALL_TESTS_PASS = YES
BUILD_PASS = YES

READY_FOR_VI_E4 = YES
```

## Bloqueadores restantes

Ninguno detectado durante VI-E3. Pendiente explícito para VI-E4: FEX 11, FSE 14 (purchase), NC 05. Pendiente para VI-E5: firma y transmisión runtime-aware.
