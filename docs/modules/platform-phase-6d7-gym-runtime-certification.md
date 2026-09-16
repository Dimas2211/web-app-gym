# FASE VI-D7 — GYM Vertical + Remaining Non-DTE Runtime Closure

Estado: **cerrada**. Ver también `docs/context/current-state.md` (sección
"FASE VI-D7") para el resumen corto — este documento es el detalle completo.

> **Addendum VI-D8 (cierre documental/test, sin reabrir VI-D7
> funcionalmente)**: corrige clasificación de `units-lookup`
> (`GLOBAL_REFERENCE` → `RUNTIME_REFERENCE`, §P), corrige clasificación de
> Sport/Goal (`RUNTIME_LOCAL_CATALOG`, sección W/X), corrige
> `RUNTIME_CLIENT_NON_DTE_CAN_HIT_GLOBAL_PRISMA` de `YES` a `NO` para
> paths tenant-owned, documenta un blocker NUEVO no tenant-owned
> (`/api/products/units-lookup`, ver flags al final), corrige el conteo de
> transacciones GYM (4, no 3) y confirma por evidencia que el conteo de
> tests nuevos ya era correcto (13, no 14). Ningún código de VI-D7 se
> modificó; el único cambio de código de VI-D8 es un test nuevo para
> `categories-lookup`.

## Contexto

VI-D6 hizo una auditoría transversal real (no solo inspección de código) del
trabajo de VI-D1–VI-D5 y encontró/corrigió 6 gaps críticos en
Sales/Purchases/Reports/Cash. Pero VI-D6 **deliberadamente no declaró**
`NON_DTE_RUNTIME_OPERATIONAL_LAYER_CLOSED = YES`, porque descubrió que la
vertical GYM completa (`clients`, `memberships`, `trainers`, `classes`,
`weekly-plans`, `client-portal`) nunca había sido migrada — esas fases solo
listaron explícitamente los 9 módulos commerce/core.

VI-D7 cierra ese gap, más una re-auditoría transversal (sección X del plan
original) que encontró 2 huecos adicionales fuera de GYM.

## A — Preflight

HEAD inicial: `afbfb99` ("fix(platform): close non-dte runtime isolation
gaps"). Working tree limpio excepto los dos archivos esperados
(`gym_system_db_before_dte_alignment.backup`,
`prisma/scripts/reset-user-password.ts`), nunca staged.

## B — Verificación de los 6 fixes de VI-D6

Certificados con tests existentes + 1 test nuevo:

| Item | Certificado por | Estado |
|---|---|---|
| `getSaleApiContext` pasa `user` | `sale-api-context.test.ts` | PASS (preexistente) |
| `getPurchaseApiContext` pasa `user` | `purchase-api-context.test.ts` | PASS (preexistente) |
| `resolveReportApiContext` pasa `user` | `reports-enforcement.test.ts` (**nuevo**) | PASS |
| `categories-lookup` usa contexto efectivo | inspección de código (`categories-lookup/route.ts`) + `getCategoriesLookup` acepta `client` | PASS |
| `confirmPurchase` — `ProductLocation.upsert` dentro de `$transaction` | `purchase.service.confirm-atomicity.test.ts` | PASS (preexistente) |
| `getAnyOpenCashSessionForLocation` siempre recibe `client` | único caller (`sale.service.ts:684`) ya lo pasa; cubierto por `sale-cross-tenant.test.ts` | PASS |

`resolveReportApiContext` era el único de los 6 sin test dedicado — el
único existente (`sales-list/route.test.ts`) mockeaba
`resolveEffectiveApiContext` por completo sin verificar el segundo
argumento. `reports-enforcement.test.ts` cierra esa cobertura.

## C — Inventario de la vertical GYM (matriz completa)

Ver el detalle completo en el historial de la sesión (auditoría vía agente
de exploración). Resumen: todas las **lecturas** dashboard-side de GYM ya
estaban parametrizadas (`client: PrismaClient = prisma`) desde fases
previas — solo faltaban las **escrituras** (7 archivos `actions.ts`) y **el
Client Portal completo** (lecturas y escrituras).

## F–K — Migración de escritura GYM (clients, memberships, trainers, classes, weekly-plans)

Patrón mecánico aplicado a los 7 archivos, idéntico al ya validado en
`commerce/customers`, `branches`, etc.:

```ts
const sessionUser = await requireXxx(); // gate de sesión/rol, sin cambios

let handle;
try {
  handle = await requireOperationalContext(sessionUser, {
    module: "gym.memberships", // omitido si el módulo no tiene code propio (clients)
    write: true,
  });
} catch (err) {
  if (err instanceof OperationalContextError) return { error: err.userMessage };
  throw err;
}
const { context, dispose } = handle;

try {
  // canManageX(effectiveSessionUser, target) con
  // effectiveSessionUser = { ...context.effectiveUser, role: context.effectiveUser.role as UserRole }
  // context.client.<model>.<method>(...) en vez de prisma.<model>.<method>(...)
  // context.tenantId en vez de sessionUser.tenant_id
  // context.locationId en vez de sessionUser.location_id
} finally {
  await dispose();
}
```

Module codes usados (del registro existente, ninguno inventado):
`gym.memberships`, `gym.trainers`, `gym.classes`, `gym.weekly_plans`.
`clients` no tiene module code propio — es base de la vertical GYM, no un
módulo activable/desactivable — se usa `requireOperationalContext(user, {
write: true })` sin `module`.

**Detalles no triviales:**
- `checkDeleteAuth(formData, sessionUser)` (7 call sites en
  clients/memberships/trainers/weekly-plans) evaluaba `canDeleteDirectly` y
  `verifyAdminDeleteCredentials` con el `role`/`tenant_id` del JWT crudo, y
  por default (`db: PrismaClient = prisma`) caía al Prisma global si no se
  le pasaba un cliente. Corregido a
  `checkDeleteAuth(formData, { role: context.effectiveUser.role as UserRole, tenant_id: context.tenantId }, context.client)`.
- `trainers/availability-validator.ts` —
  `validateClassWithinTrainerAvailability`/`checkAvailabilitySlotCanBeRemoved`
  no aceptaban `db`; usado desde `classes/actions.ts` (validación de
  disponibilidad al crear/editar clases programadas) y
  `trainers/actions.ts` (remover bloque de disponibilidad). Ambos ahora
  aceptan `db: PrismaClient = prisma`.
- `$transaction`: **corrección VI-D8 — son 4, no 3** (verificado por grep
  de `.$transaction(` en los archivos GYM migrados):
  `deleteTrainerAction` (disponibilidad + trainer, `trainers/actions.ts`),
  `deleteTemplateAction` (días + plantilla, `weekly-plans/actions.ts`),
  `deleteClientPlanAction` (días + plan, `weekly-plans/actions.ts`), y
  `enablePortalAction` (creación de `User` + `Client.update` al habilitar
  portal, `clients/actions.ts`) — omitida en la redacción original de esta
  sección por no ser una acción de borrado, pero migró al mismo patrón
  `context.client.$transaction`. Las 4 pasaron de `prisma.$transaction` a
  `context.client.$transaction`.
- Filtro de tenant: se usa `tenant_id: context.tenantId` (no `gym_id`),
  consistente con el resto de queries GYM ya migradas (`clients/queries.ts`,
  `trainers/queries.ts`, etc.) — aunque `tenant_id` es nullable en varios
  modelos GYM por legacy, es la convención ya establecida en el código
  existente, no algo introducido en esta fase.

## L — Client Portal (`/portal/*`) — el hueco de mayor impacto

A diferencia del resto de GYM, aquí **ni lecturas ni escrituras** tenían
wiring runtime — ningún `client`/`context` en absoluto.

- `client-portal/queries.ts` — las 12 funciones (`getClientByUserId`,
  `getMyActiveMembership`, `getLastExpiredMembership`, `getMyMemberships`,
  `getAvailableClasses`, `getMyBookingForClass`, `getMyBookings`,
  `getMyActivePlan`, `getMyPlans`, `hasActiveMembership`,
  `getMyGeneralTemplates`, `getMyAttendance`) ahora aceptan
  `client: PrismaClient = prisma` como último parámetro.
- `client-portal/actions.ts` — `bookClassAction`, `cancelBookingAction`,
  `submitPlanDayAction` migradas al mismo patrón
  `requireOperationalContext(sessionUser, { write: true })` (sin module
  code — el portal es un canal hacia módulos GYM ya gateados aguas arriba,
  no se inventó uno nuevo).
- Los 6 `page.tsx` de `(portal)/portal/**`
  (`page.tsx`/`clases`/`plan-semanal`/`credencial`/`historial`/`membresias`)
  ahora resuelven `resolveEffectiveTenantContext(sessionUser)` y pasan
  `context.client` a cada query, con `try { ... } finally { await dispose(); }`
  envolviendo el render. `credencial/page.tsx` además tenía un
  `prisma.gym.findUnique` inline sin wiring — corregido con fallback
  `context.client ?? prisma` (el tipo de `context.client` es opcional en
  `resolveEffectiveTenantContext`, a diferencia de `requireOperationalContext`
  que siempre lo resuelve).
- Primer test del archivo: `client-portal/actions.test.ts` (no existía
  ninguno antes) — certifica bloqueo bajo `READ_ONLY` y que
  `getClientByUserId` recibe `context.client`.

## O — Settings gap

`updateClientOperationalCodeAction`/`updateClientAvatarAction` en
`settings/actions.ts` ya resolvían `requireOperationalContext`/
`isRuntimeReadOnlyActive` en una fase previa (parecía "cerrado" en revisión
de código) pero el write real de `Client` seguía en
`prisma.client.update(...)` — un half-migration. Corregido a
`context.client.client.update(...)` de punta a punta, con test dedicado
(`update-client-operational-code.test.ts`) que hubiera fallado contra el
código anterior (asegura que el spy de `context.client` es el que se
invoca, no un Prisma global no mockeado).

El resto de `settings/actions.ts` (gym/sports/goals/gymSettings, antes con
`isRuntimeReadOnlyActive()` + Prisma global directo) también migró a
`requireOperationalContext({ write: true })`. Clasificación:
`requireSuperAdmin()` exige `auth_scope === "PLATFORM"` — estas acciones
son `PLATFORM_NATIVO_ONLY`, nunca alcanzables por `RUNTIME_CLIENT` — pero
se enrutaron igual por consistencia y para dejar cero `prisma.` directo
reachable en el archivo.

`settings/queries.ts` — `getSports`/`getSportById`/`getGoals`/
`getGoalById` no aceptaban `client` (a diferencia de `getGym`/
`getGymSettings`, correctas desde antes). Corregido; los 5 `page.tsx`
llamadores ya resolvían `context` pero no lo propagaban al query — solo
hacía falta el segundo argumento.

## P — Units lookup: clasificación

**Corrección VI-D8**: `UnitOfMeasure` (`prisma/schema.prisma`) no tiene
`tenant_id` y tiene `@@unique([symbol])`, pero su `id` es
`@default(uuid())` — **no está pinneado por seed**. El seed hace
`upsert` por `symbol`, no por `id`, así que cada runtime DB física genera
su propio UUID para "la misma" unidad conceptual (ej. "kg" puede tener un
`id` distinto en la DB de TrustMe que en la DB de GYM). `Product.unit_id`
referencia el `id` local de SU PROPIA base. Por lo tanto la clasificación
correcta no es `GLOBAL_REFERENCE` (que implicaría una única tabla física
compartida con IDs estables entre tenants, como asumía la redacción
original de esta sección) sino:

**`UNITS_LOOKUP_SOURCE = RUNTIME_REFERENCE`** — catálogo conceptual
común/de referencia, no tenant-editable, pero físicamente replicado y
resuelto dentro de cada runtime DB, con IDs locales a esa DB. No se
modifica el schema, no se pinnean UUIDs, no se migran datos ni se cambia
el seed — la corrección es puramente de clasificación documental.

**Callers verificados** (no solo afirmado — el código se auditó línea por
línea antes de certificar esto):

- `getUnitsLookup(client: PrismaClient = prisma)`
  (`get-units-lookup.ts`) ya recibe `client` correctamente y no requiere
  cambio.
- `src/app/(dashboard)/dashboard/products/page.tsx` — llama
  `getUnitsLookup(client)` con el `client` de
  `resolveEffectiveTenantContext(user)`. Correcto.
- **`src/app/api/products/units-lookup/route.ts` — llama
  `getUnitsLookup()` SIN argumento**, cayendo al default `prisma` (Prisma
  global) incondicionalmente. A diferencia de `categories-lookup/route.ts`
  (su vecino en el mismo directorio, corregido en VI-D6), esta ruta nunca
  resuelve `resolveEffectiveApiContext`/`resolveEffectiveTenantContext` —
  solo valida rol de sesión. `UnitOfMeasure` no es tenant-owned (no hay
  fuga de datos entre tenants: cualquier fila de `UnitOfMeasure` es
  "legítima" en el sentido de que no pertenece a otro tenant), pero bajo
  el modelo `RUNTIME_REFERENCE` una identidad `RUNTIME_CLIENT` que golpee
  esta ruta recibiría los `id` de la base PLATFORM/global en vez de los
  `id` de su propia runtime DB — inconsistentes con los `Product.unit_id`
  reales de esa base. **Esto es un hallazgo nuevo, no cerrado en esta
  fase**: `Products` está explícitamente fuera de alcance de VI-D8 (ver
  §6 de la instrucción de esta microfase — no tocar Products salvo el
  test de categories-lookup y documentación). Queda documentado como
  blocker puntual, ver sección de blockers al final.

## W/X — Re-auditoría global de Prisma (GYM + transversal non-DTE)

Grep de `prisma.<model>.<method>` directo (no como default param) en los 7
archivos GYM migrados: **cero** ocurrencias tras la migración.

Re-auditoría transversal completa (agente de exploración dedicado, todo
`src/` excluyendo rutas `dte`) encontró 2 huecos fuera de GYM, ambos
cerrados en esta misma fase:

1. `settings/queries.ts` (Sport/Goal) — ver sección O arriba. `Sport`/`Goal`
   (`prisma/schema.prisma`) no tienen `tenant_id`, con `@@unique([name])`
   por base — **corrección VI-D8**: clasificar como
   `RUNTIME_LOCAL_CATALOG` (no "GLOBAL_REFERENCE" en el sentido de tabla
   física global compartida): catálogo sin `tenant_id`, almacenado por
   base/runtime, administrado únicamente desde flujo PLATFORM
   (`requireSuperAdmin()`) en el diseño actual — mismo criterio de
   `id` local por DB que `UnitOfMeasure` (ver sección P), aunque aquí no
   hay ninguna ruta con el gap de wiring que sí tiene `units-lookup`.
2. `dashboard/credential/page.tsx` — página de credencial propia de staff
   (cualquier rol, no solo GYM), cero wiring de contexto runtime,
   `prisma.user.findUnique` directo. Corregido con
   `resolveEffectiveTenantContext`.

Un tercer hallazgo, **fuera de alcance deliberadamente**:
`commerce/sales/export/**` (flujo FEX-11 — factura de exportación) tiene el
mismo patrón sin runtime routing, pero FEX-11 es un tipo de documento DTE
(fiscal) y su guard `requireExportSession()` está acoplado a acciones DTE
(firma, transmisión). Cae en la exclusión explícita de DTE de esta fase —
no se tocó ningún archivo de ese subárbol. Clasificación:
**`DTE_PENDING_VI_E`** (dominio funcional fiscal/DTE, independientemente
de que resida físicamente bajo `sales/export` — la ubicación de carpeta no
redefine el dominio). Diferido a VI-E junto con `dte-api-context.ts`.

## Y — Login redirect bug: diferido a VI-F

`login/actions.ts` consulta `prisma.user.findUnique({where:{email}},
select:{role})` ANTES de autenticar, para decidir `/portal` vs
`/dashboard`. Bajo un futuro login runtime por hostname, un usuario cuya
cuenta vive solo en la DB runtime de su tenant no existiría en el `User`
global → `redirectTo` caería siempre a `/dashboard`. No es un fix acotado:
arreglarlo bien requiere resolver tenant/DB efectivo desde el hostname
ANTES de autenticar — eso es el trabajo del cutover final de login (VI-F),
no algo seguro de aislar hoy mientras `RUNTIME_HOST_AUTH_ENABLED=false`
(la ruta de código es literalmente inalcanzable en este estado). Documentado
como blocker exacto para VI-F; archivo no tocado.

## AD — Tests

**Verificado VI-D8** (recuento exacto por `git show`+`grep 'it('` archivo
por archivo, antes/después del commit `d72e818`, contra el delta real de
suite 618→631): **13 tests nuevos**, no 14 — el conteo original era
correcto. Desglose confirmado: `reports-enforcement.test.ts` (+2),
`client-portal/actions.test.ts` (+2, primer test del archivo),
`settings/update-client-operational-code.test.ts` (+4),
`classes/actions.test.ts` (+1), `memberships/actions.test.ts` (+1),
`settings/actions.test.ts` (+1), `trainers/actions.test.ts` (+1),
`weekly-plans/actions.test.ts` (+1), `clients/actions.test.ts` (+0 neto —
reescritura de mocks sin agregar casos). Suma: 2+2+4+1+1+1+1+1+0 = 13,
consistente con 631-618=13.

## Comandos de validación ejecutados

```
npx tsc --noEmit         → limpio
npx vitest run           → 631/631 PASS (94 test files)
npm run lint              → sin errores nuevos (mismos warnings preexistentes)
npm run build              → PASS
git diff --check          → sin errores de whitespace (solo warnings LF/CRLF de Windows)
```

## Impacto en bases de datos y sincronización local/remota

- **`schema.prisma`**: sin cambios. `SCHEMA_CHANGE = NO`.
- **Migraciones**: ninguna nueva. `MIGRATION_REQUIRED = NO`.
- Todo el trabajo de esta fase es enrutamiento de código (qué instancia de
  `PrismaClient` usa cada función) — no toca estructura de tablas, índices
  ni relaciones. `DATABASE_URL` y `DIRECT_URL` no requieren ninguna acción
  del usuario tras este cambio.

## Matriz final de certificación non-DTE

| Módulo | Reads runtime-safe | Writes runtime-safe | Cross-tenant safe | Location safe | Role LIVE safe | Support readonly | Global Prisma reachable |
|---|---|---|---|---|---|---|---|
| Products / Customers / Suppliers / Inventory / Locations / Users / Sales / Purchases / Cash | YES | YES | YES | YES | YES | YES | NO |
| Reports (commerce + GYM) | YES | n/a | YES | YES | YES | YES | NO |
| GYM Clients | YES | YES | YES | YES | YES | YES | NO |
| GYM Memberships / Membership Plans | YES | YES | YES | YES | YES | YES | NO |
| GYM Trainers | YES | YES | YES | YES | YES | YES | NO |
| GYM Classes | YES | YES | YES | YES | YES | YES | NO |
| GYM Weekly/Training Plans | YES | YES | YES | YES | YES | YES | NO |
| Client Portal | YES | YES | YES (vía `client.id` propio) | YES | YES | YES | NO |
| Settings (gym/sports/goals/codes/client+user code+avatar) | YES | YES | YES | n/a | YES | YES | NO |
| Lookups/Catálogos — `categories` (tenant-owned) | YES | n/a | YES | n/a | n/a | n/a | NO |
| Lookups/Catálogos — `units` (RUNTIME_REFERENCE) | YES vía page.tsx dashboard y vía `/api/products/units-lookup` (VI-D9 — corregido, usa `resolveEffectiveApiContext` igual que categories-lookup) | n/a | n/a | n/a | n/a | n/a | NO |
| Lookups/Catálogos — `sport`/`goal` (RUNTIME_LOCAL_CATALOG, PLATFORM-only) | YES | n/a | n/a | n/a | n/a | n/a | NO |
| `commerce/sales/export` (FEX-11) — `DTE_PENDING_VI_E` | **NO** — diferido a VI-E (frontera DTE) | **NO** | — | — | — | — | **SÍ (deliberado, fuera de alcance)** |
| `login/actions.ts` (redirect preview) | n/a | n/a | — | — | — | — | Inalcanzable hoy (`RUNTIME_HOST_AUTH_ENABLED=false`); diferido a VI-F |

## Flags finales

```
GYM_ENTRYPOINT_AUDIT_COMPLETE = YES

GYM_CLIENTS_RUNTIME_READY = YES
GYM_MEMBERSHIPS_RUNTIME_READY = YES
GYM_MEMBERSHIP_PLANS_RUNTIME_READY = YES
GYM_TRAINERS_RUNTIME_READY = YES
GYM_CLASSES_RUNTIME_READY = YES
GYM_WEEKLY_PLANS_RUNTIME_READY = YES
GYM_CLIENT_PORTAL_RUNTIME_READY = YES

GYM_REPORTS_RUNTIME_READY = YES
GYM_LOOKUPS_RUNTIME_READY = YES

SETTINGS_RUNTIME_READY = YES
UNITS_LOOKUP_CLASSIFIED = YES
UNITS_LOOKUP_SOURCE = RUNTIME_REFERENCE

GYM_RUNTIME_CLIENT_CAN_HIT_GLOBAL_PRISMA = NO

CROSS_TENANT_GYM_BLOCKED = YES
CLIENT_PORTAL_SELF_ISOLATION_SAFE = YES

GYM_RUNTIME_TRANSACTIONS = 4
GYM_RUNTIME_TRANSACTIONS_SAFE = YES

ROLE_LIVE_GYM_COMPLETE = YES
LOCATION_RUNTIME_GYM_COMPLETE = YES

SUPPORT_SESSION_GYM_WRITES_BLOCKED = YES

VI_D6_SALES_CONTEXT_FIX_CERTIFIED = YES
VI_D6_PURCHASE_CONTEXT_FIX_CERTIFIED = YES
VI_D6_REPORT_CONTEXT_FIX_CERTIFIED = YES
PURCHASE_PRODUCTLOCATION_ATOMIC = YES

LOGIN_REDIRECT_BUG_FIXED = DEFERRED (VI-F — requiere resolver tenant desde hostname antes de autenticar)

REFERENCE_CATALOGS_CLASSIFIED = YES

RUNTIME_CLIENT_NON_DTE_CAN_HIT_GLOBAL_PRISMA = NO
  (VI-D9 cierra la última excepción: `/api/products/units-lookup` ahora
  resuelve `resolveEffectiveApiContext` y pasa `context.client` a
  `getUnitsLookup()`, igual que categories-lookup. Ya no hay ningún path
  operacional NON-DTE — tenant-owned o RUNTIME_REFERENCE — que pueda
  llegar a Prisma global.)
RUNTIME_CLIENT_CAN_FALLBACK_GLOBAL = NO (para todo lo dentro de alcance de esta fase)

PRODUCT_UNIT_LOOKUP_SAME_RUNTIME_DB = YES
  (Product.unit_id y UnitOfMeasure.id se resuelven ambos contra
  context.client — la misma DB física efectiva — nunca se mapean IDs
  entre bases)
RUNTIME_CLIENT_UNITS_LOOKUP_CAN_HIT_GLOBAL_PRISMA = NO

DTE_EXPORT_FEX11_RUNTIME_READY = NO

COMMERCIAL_CONTROL_PLANE_SOURCE_PRESERVED = YES
NON_DTE_CAPACITY_RUNTIME_SAFE = YES

DTE_API_CONTEXT_RUNTIME_READY = NO
DTE_MUTATIONS_TOUCHED = NO

RUNTIME_HOST_AUTH_DEFAULT_ENABLED = NO
PRODUCTION_RUNTIME_LOGIN_ENABLED = NO

SCHEMA_CHANGE = NO
MIGRATION_REQUIRED = NO

ALL_TESTS_PASS = YES (636/636, 96 test files)
BUILD_PASS = YES

NON_DTE_RUNTIME_OPERATIONAL_LAYER_CLOSED = YES
  (VI-D9 cierra el último blocker conocido — units-lookup ahora usa
  contexto efectivo. Ya no quedan paths NON-DTE alcanzables con fuga a
  Prisma global.)

READY_FOR_VI_E_DTE_RUNTIME = YES

NON_DTE_BLOCKERS = []

VI_D8_BLOCKERS_RESUELTOS_EN_VI_D9 = [
  "/api/products/units-lookup/route.ts llamaba getUnitsLookup() SIN pasar `client` — caía al Prisma global incondicionalmente. Corregido en VI-D9: ahora resuelve resolveEffectiveApiContext(user) y pasa context.client, igual que categories-lookup/route.ts. Certificado por src/app/api/products/units-lookup/route.test.ts.",
]

VI_D7_BLOCKERS_HISTORICOS = [
  "commerce/sales/export/** (FEX-11) sigue en Prisma global — deliberadamente fuera de alcance, es frontera DTE (DTE_PENDING_VI_E), resolver en VI-E junto con dte-api-context.ts",
  "login/actions.ts redirect preview — bug de bajo riesgo, inalcanzable mientras RUNTIME_HOST_AUTH_ENABLED=false, resolver en VI-F (cutover de login)",
]
```

NO PUSH. NO DEPLOY. NO PROD LOGIN.
