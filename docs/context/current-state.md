# Estado actual — Plataforma Multiindustria

## Estado global
- Plataforma base multiindustria reorganizada.
- Etapas 1–10 cerradas.
- commerce/products cerrado.
- commerce/inventory cerrado.
- commerce/purchases cerrado y operativo (UI + backend).
- commerce/suppliers cerrado y operativo.
- commerce/sales ciclo interno cerrado (Fase 4H-Z) — DRAFT, CONFIRMED, inventario, UI operativa.
- commerce/customers cerrado y operativo — módulo completo con catálogos fiscales (Fase 4I-3B-1 + ajustes).
- commerce/dte outgoing — V1 cerrado operativamente. FE 01, CCFE 03, NC 05 e Invalidación generados, validados, firmados, transmitidos a MH TEST con respuesta ACCEPTED y entregados a sistema externo MariaDB. Panel Fiscal DTE operativo en /dashboard/sales. Ver docs/modules/dte-v1-operational-close.md.
- commerce/dte — FSE 14 (origen Purchase) cerrado: firmador dual TEST/PRODUCTION por ambiente (FIRMADOR-SERVICE :8113 / FIRMADOR-TEST-SERVICE :8114), resolveDteSignerConfig(dte.environment) como única fuente de verdad, delivery MariaDB verificado sin depender de sale_id. Ver docs/modules/dte-signer-routing-runbook.md.
- commerce/dte — primer cierre FSE14 TEST sobre runtime multiindustria (cliente TrustMe, vía Runtime Database Router): CREATE→GENERATE→VALIDATE→SIGN→TRANSMIT→DELIVER→VERIFY completo, estado final ACCEPTED, delivery MariaDB confirmado. Solo TEST; SignerProfile por tenant/emisor/ambiente implementado (ver docs/modules/dte-signer-multitenant-block.md). Ver docs/modules/dte-trustme-fse14-test-closure.md.
- commerce/dte — delivery externo runtime-aware desde `/dashboard/dte/outgoing` implementado (allowlist `DELIVER_EXTERNAL`, solo super_admin, confirmación explícita, auditado en PlatformDeploymentLog). Resto de acciones DTE (generar/validar/firmar/transmitir/invalidar) siguen en Prisma global — fuera de la allowlist.
- commerce/dte — metering comercial `fiscal.dte.monthly_issued` (FASE IV-A a IV-D) **implementado, operable y certificado**: motor de reserva/consumo/liberación (PENDING/CONSUMED/RELEASED, transacción Serializable, timezone fail-closed, Unlimited mide sin bloquear, UNCONFIGURED fail-closed) en `dte-fiscal-metering.service.ts`; reconciliación MH real y certificada contra MH TEST (FASE IV-B, `reconcileDteWithMh`, runtime-aware); operación manual + inspector de metering en `/dashboard/dte/outgoing` y `/dashboard/dte/monitoring` (FASE IV-C); límites finitos certificados técnicamente contra PostgreSQL real, incluyendo concurrencia (FASE IV-D) — **pero ningún límite finito real está activado para ninguna organización todavía**; GYM/TrustMe siguen en Unlimited/UNCONFIGURED según su configuración actual. Ver `docs/modules/platform-phase-4-dte-monthly-metering.md`, `platform-phase-4b-dte-query-reconciliation.md`, `platform-phase-4c-dte-metering-operations.md`, `platform-phase-4d-dte-finite-limits-certification.md`.
- platform — FASE 7 cerrada: base operativa multi-cliente auditada y documentada (provisioning, TrustMe como único cliente runtime probado, matriz de automatización existente/faltante). Hueco principal: `SEED_TENANT_BASE` (crear tenant/location/admin en runtime) solo existe como script ad-hoc, no como runner controlado. Ver docs/modules/platform-phase-7-multiclient-provisioning.md.
- commerce/cash cerrado y operativo — apertura/cierre de sesión, movimientos manuales, corte de caja, historial, exportación PDF/Excel, asociación automática venta → sesión. Ver docs/modules/cash-summary.md.

## Identidad activa
- La identidad transversal oficial es tenant_id / location_id.
- No volver a usar gym_id / branch_id como contrato principal.
- El JWT bridge gym_id / branch_id ya fue eliminado.

## Platform — FASE VI-B: Runtime Identity Security Foundation (cerrada, no es cierre de FASE VI completa)

Introduce `AuthScope` (`src/core/auth/types.ts`) como concepto ORTOGONAL a `role`:
`role` sigue gobernando privilegios dentro del tenant/organización; `auth_scope`
gobierna el origen/alcance de la identidad. Valores: `PLATFORM` (identidad
autenticada por el flujo global actual — el único login activo hoy) y
`RUNTIME_CLIENT` (reservado para login runtime futuro, **NOT YET ENABLED**,
llegará en FASE VI-C). `role === "super_admin"` dejó de ser prueba suficiente
de identidad Platform Admin.

- **Frontera única**: `canAccessPlatformAdmin(user)` en
  `src/core/permissions/platform-access.ts` — exige `auth_scope === "PLATFORM"`
  **Y** `getCapabilities(role).isGlobal`. Usada por `requireSuperAdmin()`
  (`src/lib/permissions/guards.ts`, autoridad server-side real) y por
  `filterModuleGroupsByAccess()` (`src/lib/navigation/dashboard-nav.ts`, nuevo
  parámetro `canAccessPlatformAdmin`, defensa de UI únicamente).
- **Sesión/JWT**: `authorize()` en `src/lib/auth/auth.ts` emite
  `auth_scope: "PLATFORM"` explícito para todo login del flujo actual (Prisma
  global). `jwt()`/`session()` lo transportan; `auth.config.ts` (edge-safe,
  usado por middleware) también lo mapea, sin hacer DB query ni resolver
  hostname.
- **Validación fail-closed**: `isAuthScope()` (`src/core/auth/types.ts`) es el
  único type guard de frontera — un JWT sin `auth_scope` (sesión creada antes
  de este cambio) o con valor no reconocido se normaliza a `undefined`, NUNCA
  se asume `PLATFORM` por defecto. Aplicado en `getSessionOrRedirect()`
  (`lib/permissions/guards.ts`) y `toCoreSessionUser()` (`core/auth/types.ts`,
  usado por `getCoreSession()`). Sesiones existentes (ej. Carlos) requieren
  relogin tras el deploy para obtener `auth_scope` explícito — hasta entonces,
  Platform Admin queda bloqueado para esa sesión (fail closed, no fail open).
- **Herencia automática**: las 61 Server Actions de `src/modules/platform/actions/**`
  y las 20 páginas de `/dashboard/platform/*` ya usaban `requireSuperAdmin()` —
  heredan la nueva regla sin cambio de código en cada una (auditado por grep,
  cero archivos sin el guard). `enter-client-runtime.action.ts` /
  `exit-client-runtime.action.ts` (Support Session / "Operar como cliente")
  también heredan: un futuro `RUNTIME_CLIENT + super_admin` queda denegado.
- **No tocado deliberadamente**: `getCapabilities(role).isGlobal` conserva su
  semántica tenant-wide (ej. super_admin administrando todas las sucursales de
  su propio tenant) — VI-B no la elimina ni la redefine, solo agrega la
  segunda condición en la frontera Platform. `requireGlobalAccess()`
  (`src/core/permissions/guards.ts`) no se tocó: no tiene consumidores hoy y
  no es un boundary Platform Admin actual.
- Tests: `src/core/permissions/platform-access.test.ts` (8 casos),
  `src/core/auth/types.test.ts` (5 casos), 3 casos nuevos en
  `dashboard-nav.test.ts` — total suite 456/456 verde.
- **NO implementado en VI-B** (explícitamente fuera de alcance): hostname
  routing, login runtime real, runtime DB lookup en `authorize()`,
  `trustme.getzolvi.com`, custom domains, runtime writes, DTE runtime
  mutation. `RUNTIME_CLIENT` existe como tipo pero ningún flujo lo emite
  todavía.

## Platform — FASE VI-C: Hostname Resolution + Runtime Authentication Foundation (fundación, FASE VI NO cerrada)

Implementa la FUNDACIÓN técnica de login runtime por hostname. **Login
runtime productivo NO está habilitado** — `RUNTIME_HOST_AUTH_ENABLED`
default `false`, feature gate temporal hasta FASE VI-F.

- **Hostname resolution** (`src/lib/http/hostname.ts`):
  `normalizeRequestHostname()` (puro, edge-safe) y
  `resolveRequestHostname(request)` (lee `x-forwarded-host`/`host`, prioriza
  el primero como hace Vercel). Extraer un hostname NUNCA es, por sí solo,
  una decisión de autorización — el allowlist real es
  `PlatformOrganization.domain`.
- **Platform hosts** (`src/lib/platform/platform-hosts.ts`): `PLATFORM_HOSTS`
  (env, lista separada por comas) decide qué hostnames son plataforma.
  `localhost`/`127.0.0.1` son plataforma por defecto SOLO fuera de
  producción. Ningún `*.vercel.app` es plataforma automáticamente — cada
  deployment se lista explícitamente si corresponde.
- **Feature gate** (`src/lib/auth/runtime-host-auth-flag.ts`):
  `RUNTIME_HOST_AUTH_ENABLED` — default `false`; solo `"true"`/`"1"`
  habilita. Server-only, nunca `NEXT_PUBLIC_`.
- **Organization resolver** (`src/modules/platform/runtime/resolve-organization-by-hostname.ts`):
  `resolveOrganizationByHostname()` usa `findMany` + `take:2` (domain SIN
  unique constraint) — fail closed en 0 y en 2+ resultados (dominio
  duplicado), nunca elige "el primero". `canOrganizationAuthenticate()`
  deniega técnicamente solo `SUSPENDED`/`CANCELLED` — `PENDING` se permite
  (elegibilidad técnica; enforcement de licencia es otra capa, no
  implementada aquí).
- **Runtime user auth** (`src/modules/platform/runtime/authenticate-runtime-user.ts`):
  reusa `withOrganizationRuntimePrisma` (runtime-database-router.ts) — nunca
  un router paralelo. Exige `user.gym_id === organization.tenant_id`
  (TENANT_MISMATCH si no). Same-email isolation certificada: el mismo email
  en dos organizaciones vive en dos bases físicas distintas, sin cruce.
- **authorize() multi-scope** (`src/lib/auth/authorize-credentials.ts`,
  conectado a NextAuth desde `auth.ts`): hostname de plataforma → rama
  PLATFORM sin cambios (Prisma global); hostname runtime + feature
  habilitada → rama RUNTIME_CLIENT (organización por hostname → elegibilidad
  → auth runtime). Cualquier fallo se traduce uniformemente a `null`
  (credenciales inválidas genéricas) — nunca se revela la causa específica
  al UI.
- **Sesión/JWT**: `organization_id?: string` agregado a `CoreSessionUser`,
  `SessionUser`, `Session.user`, `JWT` — obligatorio solo para
  `auth_scope==="RUNTIME_CLIENT"`. No se agregó `profile_id`, `vertical`,
  `plan` ni estado de licencia al JWT — se resuelven en vivo.
- **Runtime context helper** (`src/modules/platform/runtime/require-runtime-organization-context.ts`):
  contrato para fases futuras (VI-D+) — NINGÚN módulo operativo se migró
  todavía. Fail closed real: `organization_id` ausente, organización no
  encontrada/no elegible/sin tenant, tenant mismatch, o perfil runtime no
  disponible → siempre lanza, **nunca** degrada a datos globales/Control
  Plane (a diferencia de Support Session, que sí degrada porque la
  identidad real sigue siendo el super_admin).
- **Support Session preservada**: `resolveEffectiveTenantContext()` ahora
  ignora la cookie `platform_runtime_session` cuando `auth_scope==="RUNTIME_CLIENT"`
  — esa cookie es exclusiva de identidades PLATFORM. `resolveEffectiveApiContext()`
  (usado por route handlers de products/customers/suppliers/inventory) NO
  recibió el mismo guard — no toma `auth_scope` como parámetro hoy y
  cambiar su firma habría tocado módulos cerrados fuera de alcance de VI-C;
  **deuda documentada**, no oculta.
- **Domain validation** (`src/modules/platform/schemas/organization-domain.schema.ts`):
  aplicada a create/update de `PlatformOrganization` — exige hostname puro
  (sin protocolo/path/puerto), normaliza a minúsculas. NO se tocaron
  registros `domain` ya existentes; si alguno tiene protocolo/path/mayúsculas
  hoy, simplemente no hará match en `resolveOrganizationByHostname()`
  (gap documentado, fail-safe).
- Tests nuevos: 82 casos (hostname, platform-hosts, feature flag, resolver
  de organización, auth runtime, authorize multi-scope, runtime context
  helper, domain schema, guard de Support Session) — suite completa
  538/538 verde.
- **Deuda explícita no resuelta en VI-C**: revalidación por request de
  `role`/`status` del usuario runtime (permanece congelado en el JWT hasta
  su expiración de 8h); `resolveEffectiveApiContext()` sin guard de
  `auth_scope` (ver arriba); ningún módulo operativo (products, sales,
  DTE, etc.) usa todavía `requireRuntimeOrganizationContext()` — se
  migrarán en fases posteriores.
- **NO implementado en VI-C** (fuera de alcance deliberado): dominio
  TrustMe real, cambios DNS, `PlatformOrganization.domain` remoto sin
  tocar, login contra TrustMe PROD, escrituras runtime de cliente, DTE
  runtime.

## Platform — FASE VI-D: Runtime Operational Context (EN CURSO, FASE VI NO cerrada)

Migra módulos operativos NO-DTE al contrato `RUNTIME_CLIENT` definido en VI-C.
`RUNTIME_HOST_AUTH_ENABLED` sigue en `false` — nada de esto es alcanzable en
producción todavía; certificado solo con tests unitarios (mocks).

**VI-D1** (commit `47524fe`/`4d72bff`) — contrato runtime unificado
(`RuntimeMode`: `PLATFORM_NATIVE`/`SUPPORT_RUNTIME`/`RUNTIME_CLIENT`) en
`resolveEffectiveTenantContext`/`resolveEffectiveApiContext`; fix de la deuda
VI-C (`resolveEffectiveApiContext` ahora sí recibe `auth_scope` vía parámetro
`user` opcional y aditivo — callers no migrados no cambian de comportamiento).
Products migrado completo (reads/writes/route handlers/server actions).

**VI-D2** (commit `6f6b4ac`) — cierra la deuda de role live: `requireRuntimeOrganizationContext`
revalida `role` contra `runtimeDb` en cada resolución (antes solo `status`/tenant),
nuevos códigos `RUNTIME_USER_NOT_FOUND`/`INACTIVE`/`TENANT_MISMATCH`. Nuevo
helper común `requireOperationalContext()` (`src/modules/platform/runtime/require-operational-context.ts`)
extraído del patrón de Products — única fuente de verdad para selección de DB,
readOnly, fail-closed RUNTIME_CLIENT, module enforcement opcional y
`effectiveUser` (role LIVE para RUNTIME_CLIENT, JWT sin cambios para
PLATFORM_NATIVE/SUPPORT_RUNTIME). Customers y Suppliers (core) migrados.

**VI-D3** (este commit) — cierra la deuda de location live (mismo criterio que
role): `requireRuntimeOrganizationContext` revalida `location_id` contra
`runtimeDb.branch` cuando no es null (`RUNTIME_LOCATION_INVALID` si no existe,
es de otro tenant, o está inactiva); `location_id=null` sigue siendo identidad
tenant-wide legítima, nunca se resuelve con `findFirst(branch)` silencioso.
`requireOperationalContext` ahora expone `commercialContext` (el Commercial
Enforcement Context ya resuelto) para operaciones capacity-gated
(`core.locations.max`, etc.) que necesitan pasarlo a `withCapacityCheckedTransaction`.
Inventory (stock, movimientos, transacciones) y Locations/Branches (CRUD +
selector `active_location_id`) migrados completos. `getEffectiveLocationId()`
y las queries de `core/modules/locations` ahora aceptan `client`/`db`
opcional (default Prisma global solo para compatibilidad no-runtime).

**VI-D4** (este commit) — cierra Users + operaciones de password. Extiende el
mismo criterio de VI-D3 (rol/location live) al CRUD de Users:
`createUserAction`/`updateUserAction`/`deleteUserAction`/`toggleUserStatusAction`
migrados a `requireOperationalContext`; `core/modules/users/actions.ts`
(`createCoreUser`/`updateCoreUser`/`toggleCoreUserStatus`) acepta `db` opcional
— la unicidad de email se evalúa SOLO contra la DB efectiva (nunca un lookup
global entre runtimes: el mismo email puede existir independientemente en
runtime A y runtime B). `delete-authorization.ts` (`verifyAdminDeleteCredentials`/
`checkDeleteAuth`, compartido con Sales/Purchases/Memberships/Trainers/
WeeklyPlans/Clients — esos NO migrados, siguen con su default global sin
cambios) y `operational-codes.ts` (`suggestNextStaffCode`) aceptan `db` opcional.

- **Hallazgo de seguridad cerrado (no específico de runtime)**: `updateUserAction`
  no tenía la misma restricción anti-escalación que `createUserAction`
  (`BRANCH_ADMIN_ASSIGNABLE_ROLES`) — un `branch_admin` podía editar un
  usuario que sí puede gestionar (ej. `reception`) y escalarle el rol a
  `super_admin`/`branch_admin` vía el formulario de edición. Cerrado
  reusando la misma fuente de política, sin inventar una regla nueva.
- **Hallazgo de alcance corregido**: `updateUserOperationalCodeAction` y
  `updateUserAvatarAction` (gestión de identidad de staff, tenant-level)
  usaban `requireSuperAdmin()` — el gate de Platform Admin desde VI-B — lo
  que las habría dejado permanentemente inalcanzables para cualquier
  identidad RUNTIME_CLIENT. Migradas a `requireAdmin()` + chequeo explícito
  de rol `super_admin` LIVE. `requireSuperAdmin()` en sí y el resto de
  `settings/actions.ts` (gym/sports/goals — fuera de alcance de Users) no
  se tocaron.
- **Password**: hash siempre vía bcrypt (mismo costo/config existente),
  nunca texto plano persistido ni logueado. No existe flujo de
  forgot-password/reset-token por email (**NONE**, confirmado por
  auditoría — ningún caso a migrar). No existe flujo de invitación
  (**NONE**). El único camino de cambio de password (propio o admin) es el
  campo opcional del formulario de edición de usuario — comportamiento
  preexistente, no se diseñó uno nuevo.
- **Estado por módulo**: Products, Customers, Suppliers (core), Inventory,
  Locations y Users están runtime-ready (reads + writes + role live +
  location live + anti-escalación donde aplica). Sales, Purchases, Cash
  **no están migrados todavía**. `suppliers/[id]/purchase-history` sigue
  dependiendo del contexto de Purchases (no migrado) — se cerrará junto con
  esa fase.
- **Deuda explícita conocida, no bloqueante**: `get-customer-by-code.ts` y
  `core/modules/users/queries.ts` (`getCoreUserById` y hermanas) usan
  Prisma global pero tienen 0 callers (código muerto, documentado como "sin
  conectar a actions ni UI todavía"); catálogos globales de referencia
  (`/api/catalogs/**`, `get-countries`/`get-economic-activities`/
  `get-identification-types`/`get-municipalities` de Suppliers,
  `suggestNextClientCode`/`isStaffCodeAvailable` de Clients) siguen en
  Prisma global — auditoría transversal de catálogos pendiente para el
  cierre final de FASE VI-D; revalidación live de `role` para identidades
  PLATFORM (no RUNTIME_CLIENT) sigue sin implementar, deliberadamente fuera
  de alcance.
**VI-D5** (este commit) — cierra Sales + Purchases + Cash (superficie operativa
NO fiscal). Mismo patrón que VI-D3 (Inventory): cada función de servicio
mutable recibe `db: PrismaClient = prisma` como último parámetro (nunca
importa Prisma global dentro del cuerpo salvo el default de compatibilidad) y
toda `$transaction` nace de `db` — `sale.service.ts` (`createSaleDraft`,
`addSaleItemToDraft`, `updateSaleItemInDraft`, `removeSaleItemFromDraft`,
`recalculateSaleTotals`, `discardDraftSale`, `cancelDraftSale`, `confirmSale`),
`purchase.service.ts` (`createPurchase`, `addPurchaseItem`,
`updatePurchaseItem`, `removePurchaseItem`, `confirmPurchase`,
`updatePurchaseHeader`, `deleteDraftPurchase`, `cancelConfirmedPurchase`,
`updatePurchasePaymentNature`), `cash-session.service.ts` (`openCashSession`,
`closeCashSession`) y `cash-movement.service.ts` (`recordCashMovement`). Todas
las Server Actions y Route Handlers de escritura de los tres módulos migraron
de `requireAdmin()` + `getEffectiveLocationId()` manual a
`requireOperationalContext(sessionUser, { module: "<code>", write: true })`,
pasando `context.client` a cada llamada de servicio.

- **`confirmSale` — inventario y caja dentro de la misma transacción
  efectiva**: la función sigue inlineando el decremento de stock
  (`ProductLocation`/`InventoryMovement SALE_OUT`) en vez de llamar a
  `recordInventoryMovement` (decisión previa documentada en el código, no
  tocada) y sigue llamando a `applyCashPaymentToSession(tx, ...)` para pagos en
  efectivo — ese helper (`cash-session-payment.service.ts`) ya recibía
  `tx: Prisma.TransactionClient` explícito desde antes de esta fase (patrón ya
  correcto). El único cambio fue que el `$transaction` exterior ahora nace de
  `db` (cliente runtime efectivo) en vez de Prisma global, así que inventario
  y caja quedan en la MISMA base runtime que la venta, en una sola transacción
  atómica. `SALE_INVENTORY_SAME_RUNTIME_DB = YES`, `SALE_AND_CASH_SAME_RUNTIME_DB = YES`.
- **`confirmPurchase` — inventario en la misma transacción efectiva**: mismo
  criterio (`PURCHASE_IN` inlineado, no tocado). Se preservó tal cual el
  `ProductLocation.upsert` que ocurre FUERA de la transacción (riesgo
  preexistente ya documentado en el código — si la transacción falla después,
  puede quedar una fila `ProductLocation` vacía; no es una regresión de esta
  fase, no se corrigió porque no era el alcance pedido). `PURCHASE_INVENTORY_SAME_RUNTIME_DB = YES`.
  Purchases no tiene integración con Cash (pagos a proveedor se registran en
  campos de `Purchase`, no en `CashMovement`) — `PURCHASE_AND_CASH_SAME_RUNTIME_DB = NONE`.
- **Frontera fiscal — NO tocada**: la generación/firma/transmisión de DTE
  sigue siendo un paso separado, disparado por el usuario DESPUÉS de
  `confirmSale`/`confirmPurchase` (`createPendingDteSimpleAction`,
  `createPendingDteForPurchaseAction`, generación de JSON FE/CCFE/FSE-14),
  nunca dentro de la transacción de confirmación. `src/modules/commerce/dte/**`
  y `src/modules/commerce/sales/export/**` (FEX-11) quedan sin ningún cambio
  (confirmado con `git status` — diff vacío en ambos árboles).
  `SALE_DTE_BOUNDARY_RUNTIME_READY = NONE` (deliberadamente fuera de
  alcance — sigue en Prisma global, migración prevista para FASE VI-E),
  `PURCHASE_FISCAL_BOUNDARY_RUNTIME_READY = NONE` (ídem, FSE-14).
- **`suppliers/[id]/purchase-history`**: se auditó y NO era la deuda que se
  creía — ya usaba `getPurchaseApiContext(req)` (el helper de contexto
  pre-`requireOperationalContext` de Purchases), con cada query ya filtrada
  por `tenant_id`/`location_id` efectivos. No requirió cambios.
  `SUPPLIERS_PURCHASE_HISTORY_RUNTIME_READY = YES`.
- **Cash — registro de cajas**: la capacidad `commerce.cash_registers.max` ya
  estaba registrada en el capacity engine (VI-Bloque B), pero no existe ningún
  entry point (`action`/`route`) que haga `cashRegister.create` en todo el
  repositorio — confirmado por búsqueda exhaustiva. No se inventó uno en esta
  fase (fuera de alcance); las cajas existentes se gestionan por vía
  administrativa fuera de la UI operativa. `CASH_REGISTER_CAPACITY_RUNTIME_READY = YES`
  (el motor de capacidad es runtime-aware) aunque el CRUD que lo dispararía no exista.
- **Bug de alcance cerrado (no específico de runtime)**: `manage-purchase-items.action.ts`
  y el resto de actions/routes de Purchases ya tenían `assertOrganizationModule("commerce.purchases")`
  correctamente — no había ninguna omisión real en `confirm-purchase.action.ts`
  (se verificó explícitamente antes de migrar, el chequeo ya existía).
- **19 tests nuevos de aislamiento cross-tenant** (Sales 8, Purchases 4, Cash
  4 más regresión de transacción, y ajustes a `confirm-sale.action.test.ts`/
  `confirm-purchase.action.test.ts` para mockear `requireOperationalContext`).
  612/612 tests PASS (antes 593). `tsc --noEmit` limpio. `npm run lint` sin
  errores (solo warnings preexistentes en archivos no tocados por esta fase).
  `npm run build` PASS. Sin cambios de schema, sin migraciones nuevas.
- **Estado por módulo**: Products, Customers, Suppliers (core), Inventory,
  Locations, Users, Sales, Purchases y Cash (superficie operativa no fiscal)
  están runtime-ready. La frontera fiscal (DTE, incluida FSE-14 de Purchases
  y el ciclo FE/CCFE/FEX-11 de Sales) sigue en Prisma global — pendiente para
  FASE VI-E.
- **NO implementado en VI-D1/D2/D3/D4/D5** (fuera de alcance deliberado):
  ningún cambio al pipeline fiscal (firmador, transmisión, MariaDB,
  DteCredential); auditoría transversal de catálogos globales de referencia
  (`/api/catalogs/**`) pendiente; `get-customer-by-code.ts` y
  `core/modules/users/queries.ts` siguen como deuda muerta documentada;
  `RUNTIME_HOST_AUTH_ENABLED` sigue `false`; sin login runtime real en ningún
  ambiente; sin push, sin deploy.

**VI-D6** (este commit) — auditoría transversal + cierre de brechas
concretas de la capa operacional NO-DTE. Ver
`docs/modules/platform-phase-6d-non-dte-runtime-certification.md` para la
matriz de certificación completa. Resumen:

- **Hallazgo crítico cerrado**: `getSaleApiContext()`/`getPurchaseApiContext()`
  (`src/app/api/sales/sale-api-context.ts`,
  `src/app/api/purchases/purchase-api-context.ts`) nunca pasaban `user` a
  `resolveEffectiveApiContext(base, user?)` — por contrato documentado de esa
  función, omitir `user` hace que CUALQUIER identidad (incluida
  RUNTIME_CLIENT) caiga al branch PLATFORM_NATIVO (Prisma global +
  `tenant_id` de JWT sin revalidar) en vez de fallar cerrado. Esto contradice
  lo certificado en VI-D5: las lecturas API de Sales/Purchases **no eran
  realmente runtime-safe**. Cerrado pasando `user` en ambos archivos +
  rechequeo de capability con rol LIVE (`context.effectiveRole`) después de
  resolver contexto — mismo criterio de VI-D2. Mismo patrón cerrado en
  `resolveReportApiContext` (`reports-enforcement.ts`, +6 call sites GYM) y
  en `reports/clients/active/route.ts`.
- **Reports de Commerce migrados** (nunca estaban en el contrato runtime):
  los 8 Route Handlers de `src/app/api/reports/commerce/**` usaban
  `assertReportModule`/`resolveEnabledReportModules` (solo module-gate, sin
  resolución de tenant/DB efectivo) — migrados a
  `resolveReportApiContext`/`resolveEffectiveApiContext` + `context.client`,
  preservando exactamente la lógica de degradación por sección de los 3
  reportes compuestos (`dashboard`, `product-summary`, `filter-options` —
  nunca exigir TODOS los módulos, nunca ANY-habilita-TODO). Los 15 archivos
  de `src/modules/commerce/reports/queries/*.ts` reciben `client:
  PrismaClient = prisma`.
- **`confirmPurchase` — atomicidad cerrada**: el `productLocation.upsert`
  corría en `db` FUERA de la transacción de confirmación (podía dejar un
  ProductLocation huérfano si la tx posterior fallaba). Se fusionó dentro
  del mismo `db.$transaction` — Purchase + ProductLocation +
  InventoryMovement son ahora o-todo-o-nada. `confirmSale` re-auditado: ya
  era atómico; se cerró un missed-call-site (`getAnyOpenCashSessionForLocation`
  no aceptaba `client`, usaba Prisma global incondicionalmente dentro de
  `confirmSale`).
- **`categories-lookup`** (`ProductCategory`, tenant-owned) migrado a
  contexto efectivo — antes usaba Prisma global sin resolver runtime.
- **Deuda NUEVA documentada, no cerrada en esta fase** (requiere alcance de
  módulo completo, no un fix acotado): vertical GYM completa
  (`clients`/`memberships`/`trainers`/`classes`/`weekly-plans`/`client-portal`)
  tiene TODA su escritura en Prisma global, gateada solo por rol de sesión
  — nunca fue declarada cerrada en VI-D1-D5 (esas fases listaron
  explícitamente los 9 módulos commerce/core, nunca GYM). Junto con ella:
  `settings/actions.ts` (`updateClientOperationalCodeAction`/
  `updateClientAvatarAction`) y `suggestNextClientCode` (mismo modelo
  Client). `dte-api-context.ts` tiene el mismo patrón de `user` faltante
  pero gatea solo rutas fiscales — no tocado (fuera de alcance DTE de
  VI-D). `login/actions.ts` tiene un bug de comportamiento de bajo riesgo
  (redirect incorrecto para `role=client` en runtime) — no alcanzable hoy
  porque `RUNTIME_HOST_AUTH_ENABLED=false`. `units-lookup` tiene una
  ambigüedad de producto pendiente (¿unidades por tenant o globales?).
- **6 tests nuevos** (2 api-context de Sales/Purchases, 2 atomicidad de
  `confirmPurchase`, 2 ajustes de mocks en tests existentes de reports
  compuestos que ahora resuelven contexto efectivo). 618/618 tests PASS
  (antes 612/612). `tsc --noEmit` limpio. `npm run lint` sin errores nuevos.
  `npm run build` PASS. Sin cambios de schema, sin migraciones nuevas.
- **`NON_DTE_RUNTIME_OPERATIONAL_LAYER_CLOSED = NO`** — los 9 módulos
  commerce/core (Products, Customers, Suppliers, Inventory, Locations,
  Users, Sales, Purchases, Cash) y Reports quedan genuinamente cerrados y
  certificados, pero la vertical GYM completa queda con un subárbol de
  escritura 100% en Prisma global alcanzable por RUNTIME_CLIENT — declarar
  la capa "cerrada" mientras eso persiste no sería honesto.
  `READY_FOR_VI_E_DTE_RUNTIME = YES` de todas formas (la frontera fiscal es
  ortogonal a GYM).

## Platform — FASE VI-D7: cierre de la vertical GYM + cierre transversal non-DTE (cerrada)

VI-D6 descubrió el hueco (vertical GYM completa sin runtime routing). VI-D7
lo resolvió, más una re-auditoría transversal que encontró y cerró 2 huecos
adicionales fuera de GYM que VI-D6 no había detectado.

- **Vertical GYM migrada completa** — `clients`, `memberships`, `trainers`
  (+ `availability-validator.ts`), `classes`, `weekly-plans`: los 7 archivos
  `actions.ts` pasaron del patrón `isRuntimeReadOnlyActive()` +
  `assert<Modulo>Module(sessionUser.tenant_id)` + Prisma global +
  `sessionUser.role`/`.tenant_id`/`.location_id` (JWT, hasta 8h de
  antigüedad) al patrón ya validado en commerce:
  `requireOperationalContext(sessionUser, { module?, write: true })` →
  `context.client` / `context.tenantId` / `context.effectiveUser.role`
  (ROL LIVE) → `try/finally { await dispose() }`. `clients` no tiene module
  code propio (no se inventó `gym.clients`); memberships/trainers/classes/
  weekly-plans usan los códigos ya registrados
  (`gym.memberships`/`gym.trainers`/`gym.classes`/`gym.weekly_plans`).
  Las 4 (no 3 — corregido en VI-D8) llamadas `$transaction` de la
  vertical (borrado de trainer+disponibilidad, plantilla+días, plan+días,
  y creación de `User`+`Client.update` en `enablePortalAction`) migraron
  de `prisma.$transaction` a `context.client.$transaction`.
  `checkDeleteAuth(formData, sessionUser)` (7 call sites) se corrigió para
  pasar `{ role: context.effectiveUser.role, tenant_id: context.tenantId }`
  + `context.client` — antes evaluaba con el ROL/tenant del JWT y por
  default caía al Prisma global si no se pasaba `db`.
- **Client Portal (`/portal/*`) migrado completo** — era el hueco de mayor
  impacto: a diferencia del resto de GYM (cuyas *lecturas* dashboard-side ya
  estaban parametrizadas desde fases previas), aquí ni lecturas ni
  escrituras tenían wiring runtime. `client-portal/queries.ts` (12
  funciones) y `client-portal/actions.ts` (3 Server Actions:
  `bookClassAction`/`cancelBookingAction`/`submitPlanDayAction`) ahora
  aceptan/usan `client: PrismaClient = prisma` y `context.client`
  respectivamente. Los 6 `page.tsx` de `(portal)/portal/**` resuelven
  `resolveEffectiveTenantContext(sessionUser)` y pasan `context.client` a
  cada query — incluyendo `credencial/page.tsx`, que además tenía un
  `prisma.gym.findUnique` inline sin ningún wiring.
- **`settings/actions.ts` — fix del "half-migration"**:
  `updateClientOperationalCodeAction`/`updateClientAvatarAction` ya
  resolvían contexto operacional en una fase previa pero el write real de
  `Client` seguía en `prisma.client.update(...)` (Prisma global) en vez de
  `context.client.client.update(...)` — exactamente el patrón que parece
  "cerrado" en revisión superficial de código pero no lo está. Corregido
  con test dedicado (`update-client-operational-code.test.ts`) que hubiera
  fallado contra el código viejo. El resto del archivo (gym/sports/goals,
  antes con `isRuntimeReadOnlyActive()` + Prisma global) también migró a
  `requireOperationalContext({ write: true })` — son `PLATFORM_NATIVE_ONLY`
  (detrás de `requireSuperAdmin()`, inalcanzables por RUNTIME_CLIENT) pero
  se enrutaron igual por consistencia y para dejar cero `prisma.` directo
  reachable en el archivo.
- **`suggestNextClientCode`/`isStaffCodeAvailable`/`isClientCodeAvailable`**
  (`src/lib/utils/operational-codes.ts`) — les faltaba el parámetro
  `db: PrismaClient = prisma` que sus hermanas (`suggestNextStaffCode`) ya
  tenían desde VI-D4. Corregido.
- **Re-auditoría transversal non-DTE (fuera de GYM) — 2 huecos nuevos
  encontrados y cerrados**:
  1. `settings/queries.ts` — `getSports`/`getSportById`/`getGoals`/
     `getGoalById` no aceptaban `client` (a diferencia de `getGym`/
     `getGymSettings`, ya correctas). Los 5 `page.tsx` que los llaman
     (`settings`, `settings/sports`, `settings/sports/[id]/edit`,
     `settings/goals`, `settings/goals/[id]/edit`) ya resolvían
     `context`/`resolveEffectiveTenantContext` pero no lo propagaban.
  2. `dashboard/credential/page.tsx` — página de credencial propia de
     staff (cualquier rol: trainer/reception/branch_admin/super_admin), sin
     NINGÚN wiring de contexto runtime, `prisma.user.findUnique` directo.
     Corregido con `resolveEffectiveTenantContext`.
- **Hallazgo fuera de alcance, documentado y NO tocado (frontera DTE)**:
  `src/modules/commerce/sales/export/**` (flujo FEX-11 — factura de
  exportación) tiene el mismo patrón de Prisma global sin runtime routing
  en sus queries (`get-unit-mh-context.ts`, `search-export-products.ts`,
  `search-foreign-customers.ts`) y su guard `requireExportSession()`
  (`export-sale.actions.ts`) nunca resuelve contexto runtime. FEX-11 es un
  tipo de documento DTE (fiscal) — clasificación: **`DTE_PENDING_VI_E`**
  (el dominio funcional es fiscal/DTE independientemente de que el código
  viva bajo la carpeta `sales/export`; la ubicación de carpeta no
  redefine el dominio) — cae dentro de la exclusión explícita de DTE de
  esta fase, igual que `dte-api-context.ts`. Queda diferido a VI-E
  junto con el resto de DTE, no se tocó ningún archivo del subárbol.
- **`login/actions.ts` — bug de redirect, DIFERIDO a VI-F**: el preview de
  rol pre-login (`prisma.user.findUnique({where:{email}}, select:{role}})`,
  para decidir `/portal` vs `/dashboard`) consulta el `User` global ANTES
  de autenticar. Bajo un futuro login runtime por hostname, un usuario
  cuya cuenta vive solo en la DB runtime del tenant no existiría en el
  `User` global → `redirectTo` caería siempre a `/dashboard` aunque el rol
  real fuera `client`. No es un fix acotado: arreglarlo bien requiere
  resolver tenant/DB efectivo desde el hostname ANTES de autenticar — eso
  es exactamente el trabajo del cutover final de login (VI-F), no algo
  seguro de aislar hoy mientras `RUNTIME_HOST_AUTH_ENABLED=false`. Se deja
  documentado como blocker exacto para VI-F, sin tocar el archivo.
- **`units-lookup` — clasificado como `RUNTIME_REFERENCE` (corregido en
  VI-D8, antes decía `GLOBAL_REFERENCE`)**: `UnitOfMeasure`
  (`prisma/schema.prisma`) no tiene `tenant_id` y tiene
  `@@unique([symbol])`, pero su `id` es `@default(uuid())` **sin pinnear
  por seed** (el seed hace `upsert` por `symbol`, no por `id`) — cada
  runtime DB genera su propio UUID para la misma unidad conceptual.
  `Product.unit_id` referencia el `id` LOCAL de su propia base, no un `id`
  global compartido. Es un catálogo conceptual común, no tenant-editable,
  pero físicamente replicado y resuelto dentro de cada runtime DB
  (`RUNTIME_REFERENCE`) — distinto de `Country`/`EconomicActivity` en
  Suppliers, que sí son tablas verdaderamente globales sin ambigüedad de
  `id` por base. `Sport`/`Goal` (sin `tenant_id`, `@@unique([name])`) se
  clasifican igual: `RUNTIME_LOCAL_CATALOG`, administrados solo desde
  flujo PLATFORM. Sin cambio de schema, sin pinnear UUIDs, sin migrar
  datos, sin tocar el seed.
  **Hallazgo nuevo de VI-D8 (código, no cerrado)**:
  `src/app/api/products/units-lookup/route.ts` llama `getUnitsLookup()`
  SIN pasar `client` — cae al Prisma global incondicionalmente, a
  diferencia de `categories-lookup/route.ts` (mismo directorio,
  corregido en VI-D6) y de `dashboard/products/page.tsx` (sí pasa el
  `client` runtime). No es fuga tenant-owned, pero rompe el modelo
  `RUNTIME_REFERENCE`: una identidad `RUNTIME_CLIENT` recibiría `id` de
  la base PLATFORM en vez de los `id` de su propia runtime DB. Fuera de
  alcance de VI-D8 (`Products` no se toca salvo el test de
  `categories-lookup`) — documentado como blocker puntual para una
  microfase futura de Products/commerce, no es DTE (VI-E) ni login
  cutover (VI-F).
- **13 tests nuevos**: `reports-enforcement.test.ts` (2, cierra el gap de
  cobertura de `resolveReportApiContext` que VI-D6 dejó sin test dedicado),
  `client-portal/actions.test.ts` (2, primer test de ese archivo — no
  existía ninguno), `settings/update-client-operational-code.test.ts` (4,
  certifica el fix del half-migration), más ajustes de los 6 tests
  `actions.test.ts` de GYM (clients/memberships/trainers/classes/
  weekly-plans/settings) del patrón `isRuntimeReadOnlyActive` mock al
  patrón `requireOperationalContext` mock. **631/631 tests PASS** (antes
  618/618). `tsc --noEmit` limpio. `npm run lint` sin errores nuevos
  (mismos warnings preexistentes, ninguno introducido). `npm run build`
  PASS. Sin cambios de schema, sin migraciones nuevas.
- **`NON_DTE_RUNTIME_OPERATIONAL_LAYER_CLOSED = YES`** — con la excepción
  documentada y deliberada de `commerce/sales/export/**` (FEX-11,
  `DTE_PENDING_VI_E`, diferido a VI-E) y `login/actions.ts` (diferido a
  VI-F, no alcanzable hoy). Ningún path de escritura/lectura TENANT-OWNED
  alcanzable por `RUNTIME_CLIENT` en GYM, Client Portal o Settings queda
  en Prisma global. `RUNTIME_HOST_AUTH_ENABLED` sigue en `FALSE`. Sin
  push, sin deploy, sin login runtime real habilitado.

### VI-D8 — cierre documental/test (auditoría final de VI-D7, sin reabrir funcionalmente)

Corrige exclusivamente clasificaciones y conteos de VI-D7 detectados en su
auditoría read-only final; agrega la cobertura de test que faltaba. Ver
`docs/modules/platform-phase-6d7-gym-runtime-certification.md` (addendum al
inicio del documento) para el detalle completo.

- `units-lookup` reclasificado `GLOBAL_REFERENCE` → `RUNTIME_REFERENCE`;
  `sport`/`goal` reclasificados como `RUNTIME_LOCAL_CATALOG` — ver arriba.
- `RUNTIME_CLIENT_NON_DTE_CAN_HIT_GLOBAL_PRISMA` corregido `YES` → `NO`
  para todo path TENANT-OWNED (verificado, ninguno queda en Prisma
  global) — con un blocker NUEVO no tenant-owned documentado:
  `/api/products/units-lookup/route.ts` sigue en Prisma global (ver
  arriba), fuera de alcance porque `Products` no se toca en esta
  microfase.
- `commerce/sales/export/**` (FEX-11) reclasificado explícitamente
  `DTE_PENDING_VI_E` (el dominio es fiscal/DTE pese a vivir bajo
  `sales/export`).
- Test nuevo dedicado: `categories-lookup/route.test.ts` (2 casos) —
  certifica que `RUNTIME_CLIENT` pasa `user` a
  `resolveEffectiveApiContext`, usa `context.tenantId`/`context.client`
  efectivos (nunca el `tenant_id` crudo del JWT ni Prisma global), y que
  un rol no autorizado nunca llega a resolver contexto.
- Conteo de transacciones GYM corregido: **4** (no 3) — se omitía
  `enablePortalAction` (`clients/actions.ts`).
- Conteo de tests nuevos de VI-D7 **verificado por evidencia
  (`git show` + conteo de `it(` por archivo)**: se confirmó que **13**
  (no 14) es el número correcto — 631−618=13, desglose exacto documentado
  en el certification doc.
- **633/633 tests PASS** (631 de VI-D7 + 2 nuevos de esta microfase).
  `tsc --noEmit` limpio. `npm run lint` sin errores nuevos. `npm run
  build` PASS. Sin cambios de schema, sin migraciones, sin push, sin
  deploy.

### VI-D9 — fix puntual: units-lookup runtime routing (cierre definitivo non-DTE)

Corrige el único blocker NON-DTE que quedó abierto al cierre de VI-D8.
Alcance estrictamente acotado a un archivo — no reabre Products, no toca
DTE, no toca schema/migraciones, sin login cutover.

- **Causa raíz**: `src/app/api/products/units-lookup/route.ts` llamaba
  `getUnitsLookup()` sin pasar `client` — caía al parámetro default
  (`prisma` global) incondicionalmente. `UnitOfMeasure` es
  `RUNTIME_REFERENCE` (ver clasificación VI-D8 arriba): se siembra por
  runtime DB con `id = @default(uuid())` sin pinnear, así que
  `Product.unit_id` de una identidad `RUNTIME_CLIENT` solo tiene sentido
  resuelto contra la MISMA DB física — nunca contra la base PLATFORM.
- **Fix**: migrado al mismo patrón ya certificado de
  `categories-lookup/route.ts` — resuelve
  `resolveEffectiveApiContext({ tenantId: user.tenant_id }, user)`
  (pasando `user` siempre, nunca omitido) y llama
  `getUnitsLookup(context.client)`, con `try/finally { await dispose() }`.
  No se tocó `get-units-lookup.ts` (ya soportaba `client` opcional desde
  antes) ni `dashboard/products/page.tsx` (ya pasaba `client`
  correctamente).
- **Re-auditoría de callers de `getUnitsLookup`**: solo 2 call sites en
  todo el repo — `dashboard/products/page.tsx` (ya correcto) y
  `/api/products/units-lookup/route.ts` (corregido ahora). No se
  encontró un tercer caller.
- **Test nuevo dedicado**: `units-lookup/route.test.ts` (3 casos) —
  certifica que `RUNTIME_CLIENT` pasa `user` a
  `resolveEffectiveApiContext`, que `getUnitsLookup` recibe
  EXACTAMENTE `context.client` (nunca Prisma global), y que roles no
  autorizados / sesiones ausentes nunca llegan a resolver contexto ni
  tocar la DB.
- **636/636 tests PASS** (633 de VI-D8 + 3 nuevos de esta microfase, 96
  test files). `tsc --noEmit` limpio. `npm run lint` sin errores nuevos
  (mismos warnings preexistentes, ninguno introducido ni en este
  archivo). `npm run build` PASS. Sin cambios de schema, sin
  migraciones, sin push, sin deploy.
- **`NON_DTE_BLOCKERS = []`** — con este fix, `commerce/sales/export/**`
  (FEX-11, `DTE_PENDING_VI_E`) y `login/actions.ts` (VI-F) son las únicas
  exclusiones restantes, y ambas están fuera del perímetro NON-DTE por
  diseño (DTE real / login cutover), no son blockers non-DTE olvidados.
  `NON_DTE_RUNTIME_OPERATIONAL_LAYER_CLOSED = YES` sin excepciones
  pendientes de código. `READY_FOR_VI_E_DTE_RUNTIME = YES`.

## Platform — FASE VI-E2A: DTE runtime context + read boundary (cerrada — solo LECTURA)

Primer paso de la frontera fiscal DTE hacia el contrato `RUNTIME_CLIENT` de VI-C/D.
Alcance estrictamente acotado a LECTURA — creación/firma/transmisión/invalidación/
correlativos/credenciales/MariaDB DTE **no se tocaron**, siguen en Prisma global.

- **Causa raíz cerrada**: `getDteApiContext()` (`src/app/api/dte/dte-api-context.ts`)
  tenía el mismo hallazgo ya cerrado en VI-D6 para Sales/Purchases —
  `resolveEffectiveApiContext({ tenantId, locationId })` se llamaba SIN el
  segundo argumento `user`. Por contrato de esa función, omitir `user` hace
  que CUALQUIER identidad (incluida `RUNTIME_CLIENT`) caiga al branch
  `PLATFORM_NATIVE` (Prisma global + `tenant_id` de JWT sin revalidar) en vez
  de resolverse vía `requireRuntimeOrganizationContext` (fail closed). Fix:
  se pasa `user` (`session.user as SessionUser`) siempre, más rechequeo de
  capability con ROL LIVE (`context.effectiveRole`) después de resolver
  contexto — mismo patrón exacto de `purchase-api-context.ts`/
  `sale-api-context.ts`.
- **4 GET callers no requirieron cambios propios**: `issuer-config` GET,
  `outgoing/[id]` GET, `outgoing/[id]/logs` GET,
  `outgoing/by-sale/[saleId]` GET — los cuatro ya consumían `ctx.client`/
  `ctx.tenant_id`/`ctx.location_id` de forma genérica (nunca Prisma global
  directo), así que corrigiendo únicamente `dte-api-context.ts` los cuatro
  quedan runtime-safe sin tocar sus archivos.
- **Ownership ya correcto**: las queries usadas por esos 4 GETs
  (`get-dte-outgoing-document-by-id.ts`, `get-dte-outgoing-detail-by-id.ts`,
  `list-dte-outgoing-documents-by-sale.ts`, `list-dte-issuer-configs.ts`)
  ya filtraban por `id + tenant_id` (nunca solo `id`) — un documento de
  tenant B consultado desde runtime A resuelve `null`/404, sin fuga. `logs`
  además valida `doc.location_id === ctx.location_id` explícitamente antes
  de listar logs.
- **PLATFORM_NATIVE**: comportamiento preservado (Prisma global, sin cambios).
- **SUPPORT_RUNTIME**: preservado — sigue leyendo la DB runtime seleccionada,
  `readOnly=true`; la excepción `DELIVER_EXTERNAL` (fuera de esta fase) no se
  tocó; `require-runtime-dte-write-access.ts` no se tocó.
- **Fail closed**: `RUNTIME_CLIENT` con organización inválida, perfil runtime
  ausente, tenant mismatch o location inválida sigue lanzando vía
  `requireRuntimeOrganizationContext` — ningún `catch → prisma` ni
  `client ?? prisma` nuevo introducido.
- **8 tests nuevos**: `dte-api-context.test.ts` (7 casos — propagación de
  `user`, `client` runtime real vs Prisma global, tenant efectivo del
  runtime context y no del JWT crudo, rechequeo de rol LIVE, PLATFORM_NATIVE
  preservado, SUPPORT_RUNTIME readOnly, fail-closed sin location) y
  `get-dte-outgoing-document-by-id.test.ts` (2 casos — aislamiento
  cross-tenant a nivel de query). **645/645 tests PASS** (antes 636 —
  636+9=645). `tsc --noEmit`
  limpio. `npm run lint` sin errores nuevos (mismos warnings preexistentes).
  `npm run build` PASS. Sin cambios de schema, sin migraciones.
- **`DTE_API_CONTEXT_RUNTIME_READY = YES`**, `DTE_GET_READS_RUNTIME_READY = YES`.
  `DTE_CREATION_RUNTIME_READY`/`DTE_ISSUER_WRITES_RUNTIME_READY`/
  `DTE_CREDENTIAL_WRITES_RUNTIME_READY`/`DTE_CORRELATIVES_RUNTIME_READY`/
  `DTE_SIGNING_RUNTIME_READY`/`DTE_TRANSMISSION_RUNTIME_READY` siguen `NO` —
  toda la superficie de escritura fiscal queda diferida a fases posteriores
  de VI-E. Ver `docs/modules/platform-phase-6e2a-dte-runtime-read-context.md`.

## Arquitectura activa
- El proyecto funciona como monolito modular.
- Core contiene identidad, usuarios, permisos, clientes, locations y lógica compartida.
- Commerce contiene products, inventory, suppliers, purchases, sales y cash.
- Gym queda como vertical específica sobre la plataforma.

## Reglas cerradas

### Products
- products es catálogo maestro tenant-level.
- products no guarda stock real.
- products no guarda bodega, estante ni posición operativa.
- products no registra compras ni ventas.
- products no debe rediseñarse salvo instrucción explícita.

### Inventory
- inventory maneja stock real por location.
- Usa product_locations.
- Usa inventory_movements.
- current_stock solo cambia por movimientos.
- No se permite stock negativo.
- Los movimientos son auditables e inmutables.
- Inventory no debe mezclar compras ni ventas documentales.

### Purchases
- purchases trabaja con DRAFT.
- Una compra confirmada debe generar entradas de inventario para productos stockables.
- No mezclar purchases con sales.
- No tocar correlativo salvo que la tarea lo pida explícitamente.
- No rediseñar la UI si ya está funcionando.

### Suppliers
- suppliers es maestro documental y operativo de proveedores.
- purchases debe consumir proveedores del maestro suppliers.
- Si el proveedor no existe, purchases puede permitir alta rápida sin duplicar el módulo completo.
- Suppliers no registra compras.

### UI
- Grillas tipo ERP.
- Navegación por teclado cuando aplique.
- No edición inline libre.
- Acciones sensibles mediante botones o diálogos.
- No rediseñar pantallas cerradas sin justificación.

## Estado actual específico de purchases UI
- El DRAFT sí se crea.
- Ya se pueden agregar líneas.
- Las líneas aparecen en la grilla.
- Los totales recalculan.
- El botón "Limpiar compra" existe pero necesita corrección.
- La grilla principal de captura ya está funcionando.

## No tocar por defecto
- products
- inventory
- purchases (cerrado)
- suppliers (cerrado)
- cash (cerrado)
- correlativo de purchases
- consulta de compras
- grillas ya funcionales
- módulos cerrados

## Estado actual de sales (Fase 4H-Z cerrada)
- DRAFT, CONFIRMED, CANCELLED implementados.
- Edición, descarte y confirmación de ventas operativos.
- Inventario SALE_OUT al confirmar operativo (inventory_moved).
- UI: /dashboard/sales/new, /dashboard/sales, panel de detalle.
- Selector DTE compacto FE 01 / CCFE 03.
- CCFE exige cliente. Validación de stock antes de confirmar.
- Ver docs/modules/sales-summary.md para detalle completo.

## Módulos cerrados adicionales
- dte outgoing V1: FE 01, CCFE 03, NC 05, Invalidación, delivery externo MariaDB. Ver docs/modules/dte-v1-operational-close.md.
- customers: cerrado. Ver docs/modules/customers-summary.md

## Platform — Bloque A: modelo comercial y entitlements (implementado — enforcement de runtime en Bloque B, ver abajo)

Modelo administrativo de planes/módulos/límites, construido sobre lo existente sin romper consumidores. Ver también docs/modules/platform-phase-7-multiclient-provisioning.md para el contexto de provisioning previo.

- **PlatformPlanModule** — módulos incluidos por defecto en un plan (`plan_id`, `module_id`, `is_enabled`). Nuevo. `PlatformOrganizationModule` (ya existía) sigue representando el estado efectivo/override por organización — no se modificó su schema.
- **PlatformEntitlementDefinition** — catálogo extensible de capacidades/límites (`code`, `name`, `category`, `value_type` COUNT|BOOLEAN, `period_type` NONE|MONTHLY). Códigos iniciales sembrados (5, verificado por lectura directa en la base local): `core.users.max`, `core.locations.max`, `commerce.products.max`, `commerce.cash_registers.max`, `fiscal.dte.monthly_issued`. GYM no tiene entitlements propios todavía; el catálogo admite añadir códigos futuros (`gym.clients.max`, etc.) sin migración estructural.
- **PlatformPlanEntitlement** — valor por defecto de un entitlement en un plan (`numeric_value` nullable + `is_unlimited`). `is_unlimited=true` → `numeric_value` se ignora/guarda null. Nunca se usan números mágicos (999999, -1) para "ilimitado".
- **PlatformOrganizationEntitlementOverride** — excepción explícita por organización. La ausencia de fila significa "usar el valor del plan" — nunca se copia automáticamente del plan a la organización.

### Precedencia — MÓDULOS (determinista, sin ambigüedad)
1. Existe fila `PlatformOrganizationModule` para (org, module) → manda esa fila. `is_active=true` → fuente `ORGANIZATION_OVERRIDE_ADDED`; `is_active=false` → `ORGANIZATION_OVERRIDE_REMOVED`.
2. No existe fila → se hereda `PlatformPlanModule.is_enabled` del plan de la organización. Sin `PlatformPlanModule` para ese módulo (o sin plan) → `UNCONFIGURED`, enabled=false.

No fue necesario cambiar el schema de `PlatformOrganizationModule`: su semántica actual (una fila = decisión explícita de la organización, independiente de cualquier plan) ya encaja 1:1 con "override explícito".

**Corrección post-cierre**: el panel `platform-organization-modules-panel.tsx` sí necesitó actualizarse — ya no muestra el estado crudo de la fila (`isActive = orgModule?.is_active ?? false`, que mostraba "apagado" para cualquier módulo heredado del plan sin fila propia), sino el estado **efectivo** (`EffectiveModule`, vía `getEffectiveOrganizationModules`) con su fuente (`PLAN` / `ORGANIZATION_OVERRIDE_ADDED` / `ORGANIZATION_OVERRIDE_REMOVED` / `UNCONFIGURED`). La UI ofrece las tres operaciones deterministas:
- **Heredar** → `revertOrganizationModuleToInheritAction` (nuevo) elimina la fila `PlatformOrganizationModule` — el módulo vuelve a depender del plan (o de `UNCONFIGURED` si el plan tampoco lo incluye). Deshabilitado cuando no hay override activo (nada que revertir).
- **Habilitar** → `activateOrganizationModuleAction` (sin cambios).
- **Deshabilitar** → `deactivateOrganizationModuleAction` (corregido: antes usaba `update` y exigía una fila `is_active=true` preexistente, por lo que fallaba al intentar deshabilitar un módulo heredado del plan sin fila propia; ahora usa `upsert`).
Los módulos `is_core` siguen bloqueados (sin override posible), igual que antes.

### Precedencia — ENTITLEMENTS
`Organization override → Plan entitlement → UNCONFIGURED`. Implementado en `src/modules/platform/lib/entitlements-resolver.ts` (`resolveEffectiveEntitlements`, `resolveEffectiveModules`, funciones puras y testeadas) con wrappers server-side `getEffectiveOrganizationModules(organizationId)` / `getEffectiveOrganizationEntitlements(organizationId)`.

**Bloque B (implementado) ya construyó el enforcement de runtime sobre este resolver** — ver `docs/modules/platform-block-b-runtime-enforcement.md`. El resolver sigue siendo la única fuente de precedencia (reusado tal cual por `resolveCommercialEnforcementContext`); lo que Bloque B añadió es la capa que lo consume para bloquear páginas/Server Actions/Route Handlers reales, no un resolver nuevo.

### Semántica de `fiscal.dte.monthly_issued`
Representa cantidad mensual de DTE que consumen cupo comercial. Un DTE fiscal original emitido consume cupo. NO consumen cupo nuevo: invalidación del DTE, contingencia, reintento, consulta MH, firma, retransmisión técnica del mismo documento, delivery a MariaDB, ni otros eventos técnicos asociados al mismo DTE. Notas de crédito/débito y otros documentos derivados: política comercial pendiente de definir explícitamente (no se decidió en Bloque A). **Actualización (FASE IV-A a IV-D)**: el contador/enforcement real SÍ está implementado (`dte-fiscal-metering.service.ts`, ledger `DteFiscalMeteringReservation`) y certificado contra PostgreSQL real, incluyendo límites finitos y concurrencia — ver `docs/modules/platform-phase-4d-dte-finite-limits-certification.md`. Ningún límite finito real está activado todavía para ninguna organización.

### Legacy `max_locations` / `max_users` en PlatformPlan — estrategia de transición (ajustada tras revisión)
Las columnas **se conservan** (no se borran) por compatibilidad con sus consumidores reales, TODOS de solo lectura/visualización — no hay ningún enforcement real que las lea para bloquear algo:
- `max_users`: `list-platform-plans.ts` (query), `create/update-platform-plan.schema.ts` + `.action.ts` (form), `platform-plan-form-dialog.tsx` / `platform-plans-table.tsx` (UI), `get-deployment-bundle.ts` + `platform-deployment-bundle-viewer.tsx` (export/visor de deployment bundle).
- `max_locations`: los mismos 6 archivos, misma lista.

**Fuente comercial futura**: `core.users.max` y `core.locations.max` (entitlements) ya son parte oficial del contrato comercial nuevo — existen en el catálogo, en el form de Plan y en el resolver, igual que los demás.

**Transición implementada** (`src/modules/platform/lib/legacy-plan-limits.ts`, espejo unidireccional, sin números mágicos):
- Si el plan tiene configurado `core.users.max` / `core.locations.max` → ese valor **manda** y se escribe también en la columna legacy en cada guardado del plan (create/update). `is_unlimited=true` → legacy = `null` (semántica ya documentada en el schema — "null = sin límite" — no se inventa `999999`/`-1`).
- Si el entitlement NO está configurado en el plan → la columna legacy conserva el valor tecleado en el campo legacy del formulario (modo "solo legacy", compatibilidad con planes no migrados).
- UI: cuando el entitlement correspondiente está configurado en el form de Plan, el campo legacy se muestra bloqueado y sincronizado (nunca queda como fuente independiente/contradictoria).
- Qué pasaría si un consumidor legacy sigue leyendo solo la columna antigua mientras se configura el entitlement nuevo: no rompe nada — la columna antigua queda sincronizada automáticamente al guardar el plan (mismo valor, o `null` si es ilimitado), así que el consumidor legacy sigue viendo un valor correcto y consistente con el entitlement, sin cambios de código en ese consumidor.

## Platform — FASE V-B1: cierre Plan Manager dinámico (vertical safety + inactivos + uso + legacy UI)

Cierra 4 gaps puntuales sobre el modelo comercial ya READY (Bloque A/B) — sin reconstruir nada que ya funcionaba. El modelo comercial sigue siendo **100% dinámico**: códigos de plan arbitrarios, sin nombres/precios/límites hardcodeados (`Starter`/`Professional`/`Enterprise` son solo registros base sin composición — la composición real la define Zolvi desde Platform Admin), composición de plan **viva** (nunca snapshot — cambiar módulos/entitlements de un plan afecta de inmediato a toda organización que lo tenga asignado, salvo overrides explícitos por organización).

1. **Vertical safety** (`entitlements-resolver.ts`, `resolveEffectiveModules`) — nueva capa de seguridad que gana SIEMPRE sobre plan y override: si `module.vertical_id` no es null y no coincide con `organization.vertical_id` (incluida una organización sin vertical), el módulo resuelve `enabled=false` / `source="VERTICAL_MISMATCH"` sin excepción — ningún `PlatformOrganizationModule` override puede saltárselo. Módulos con `vertical_id=null` (Commerce/core transversal) siguen funcionando igual para cualquier organización. Basado exclusivamente en la relación `vertical_id`, nunca en el código del módulo (`gym.*`). `getEffectiveOrganizationModules` pasa `organization.vertical_id` al resolver puro reusando la misma query que ya traía `plan_id` (sin queries adicionales). UI: `platform-organization-modules-panel.tsx` bloquea los tres botones de override (como `is_core`) y muestra "Bloqueado: vertical distinta" cuando aplica.
2. **Planes inactivos en organizaciones** — `organizations/page.tsx` y `organizations/[id]/page.tsx` ya no permiten elegir un plan inactivo para una asignación NUEVA (filtran `is_active`). Si la organización ya tenía asignado un plan que luego se desactivó, ese plan se sigue mostrando en el selector de edición (marcado "(Inactivo)"), nunca desaparece ni se reactiva/quita automáticamente. `is_active=false` sigue significando exactamente lo mismo que antes: bloquea nuevas asignaciones, no afecta resolución efectiva de organizaciones ya asociadas.
3. **Impacto visible por plan** — `list-platform-plans.ts` agrega `_count.organizations` (Prisma), expuesto como `PlatformPlanItem.organizationsCount`. `platform-plans-table.tsx` muestra "N org." con link a `/dashboard/platform/organizations?plan=<id>` (el filtro existente de la tabla de organizaciones ahora lee `?plan=` como valor inicial). Antes de desactivar un plan en uso, se pide confirmación informativa (nunca bloquea).
4. **Limpieza legacy UI** (`platform-plan-form-dialog.tsx`) — los campos legacy "Máx. ubicaciones/usuarios" ahora se OCULTAN por completo cuando `core.locations.max` / `core.users.max` existen en el catálogo de entitlements disponible (sin importar si están configurados en ese plan puntual) — la fuente comercial visible pasa a ser exclusivamente el entitlement. Sin cambios de schema/backend: `deriveLegacyPlanLimits()` y la sincronización server-side (`legacy-plan-limits.ts`) siguen intactas.

Sin cambios de schema, sin migraciones. Tests: 8 casos nuevos de vertical safety en `entitlements-resolver.test.ts` (más el existente `resolve-commercial-context.test.ts`, sin cambios porque `getEffectiveOrganizationModules` ya encapsula la nueva query).

### Commerce sin vertical (FASE A11)
`vertical_id = null` es válido y NO es un error de provisioning. `provisioning-validator.ts` → `checkVertical` ahora pasa (`passed: true`) tanto si hay vertical asignada como si no (mensaje "No aplica — organización transversal (Commerce sin vertical)"). NO se usa la vertical `GENERAL` como fallback.

### Vertical `GENERAL` — retirada del seed fresco (hardening post-cierre)
`GENERAL` ya **no** se siembra para instalaciones nuevas — se inspeccionó exhaustivamente y no existe ninguna dependencia real de código, test, FK ni documentación que la requiera (Commerce transversal usa `vertical_id = null`, nunca `GENERAL`). El único otro match de la cadena "GENERAL" en el repo es un código de `ProductCategory` en `seed.base.ts` — dominio completamente distinto (catálogo de productos), no relacionado con `PlatformVertical`.
Una base que ya tenía `GENERAL` sembrada de un seed anterior (ej. la base local de este bloque) **no se ve afectada** — `seed.platform.ts` nunca hace `DELETE`, así que esa fila queda como registro legacy hasta una limpieza manual futura. No se borró en ningún entorno.

### UI
- `/dashboard/platform/plans`: el diálogo crear/editar plan ahora incluye checkboxes de módulos incluidos (agrupados por categoría, desde `PlatformModule` real) y edición de límites/capacidades (desde `PlatformEntitlementDefinition` real, con toggle "Ilimitado"). Los campos legacy `max_locations`/`max_users` se mantienen visibles con nota aclaratoria.
- `/dashboard/platform/organizations/[id]`: nuevo panel "Límites / capacidades efectivas" (`PlatformOrganizationEntitlementsPanel`) que muestra valor efectivo + origen (plan / override / sin configurar) y permite crear/editar/quitar el override por organización. El panel de módulos (`PlatformOrganizationModulesPanel`) se actualizó para mostrar estado efectivo + origen y ofrecer Heredar/Habilitar/Deshabilitar (ver detalle arriba).

### Seeds — hardening: sin composición comercial demo en el bootstrap normal
`seed.platform.ts` corre igual en los tres modos de `prisma/seed.ts` (`catalogs`/`base`/`demo`), **incluido `base`** (pensado para clientes reales). Por eso:

- **Sí siembra** (catálogo oficial, idempotente): las 5 `PlatformEntitlementDefinition` (`core.users.max`, `core.locations.max`, `commerce.products.max`, `commerce.cash_registers.max`, `fiscal.dte.monthly_issued`) y el catálogo técnico `PlatformModule` (sin cambios respecto a antes).
- **Ya NO siembra**: ninguna fila `PlatformPlanModule` ni `PlatformPlanEntitlement`. La versión anterior de este bloque sembraba una composición de desarrollo (`PLAN_MODULES_DEMO`/`PLAN_ENTITLEMENTS_DEMO`) para los planes `starter`/`professional`/`enterprise` — se retiró por completo porque correr en modo `base` la habría convertido en el bootstrap comercial real de cualquier control plane nuevo, sin que Zolvi haya aprobado esa composición (qué módulos trae cada plan, cuántos usuarios/sucursales/productos/cajas/DTE, qué es ilimitado, precios). Los tres planes quedan sembrados como registro base (código, nombre, ciclo de facturación) **sin módulos ni entitlements** — se configuran explícitamente desde Platform Admin cuando Zolvi apruebe la composición comercial oficial.
- Un plan con 0 `PlatformPlanModule` / 0 `PlatformPlanEntitlement` es un estado **válido**: el resolver ya lo resuelve como `UNCONFIGURED` (entitlements) / no heredado-disabled (módulos) — cubierto por tests existentes en `entitlements-resolver.test.ts` (caso 5 y el caso "módulo no incluido por plan y sin fila de organización").
- Verificado localmente: tras el hardening, re-ejecutar `seedPlatform()` mantiene `PlatformPlanEntitlement`/`PlatformPlanModule` sin crecer (15/36, artefactos demo previos a este cambio, no borrados por no ser necesario para aceptar el código) y el catálogo de entitlements sigue en exactamente 5 filas.

### Migración
`prisma/migrations/20260902182700_platform_entitlements_model` — puramente aditiva (2 enums nuevos + 4 tablas nuevas + FKs/índices). No borra ni modifica tablas/columnas existentes. Aplicada solo en LOCAL (`localhost:5432/TrustmeDB`, mismo host en `DATABASE_URL` y `DIRECT_URL`). No se ejecutó contra ningún entorno remoto/producción.

## Platform — Bloque B: enforcement real de módulos y capacidades estáticas (implementado — cobertura completa de boundaries externos instrumentables)

Convierte el modelo comercial del Bloque A en bloqueos reales. Ver `docs/modules/platform-block-b-runtime-enforcement.md` para el detalle completo (matriz módulo↔página↔Server Action↔Route Handler). Resumen:

- **Commercial Enforcement Context** (`src/modules/platform/runtime/commercial-enforcement/`): `resolveCommercialEnforcementContext(tenantId)` resuelve MANAGED (existe `PlatformOrganization` para el tenant) vs LEGACY_UNMANAGED (bypass temporal explícito por `ctx.mode`, nunca reportado como `isUnlimited:true`), reusando los wrappers puros del Bloque A tal cual.
- **Module guard**: `hasOrganizationModule`/`assertOrganizationModule`/`requireOrganizationModule`. `is_core` verificado en código — no es bypass automático (bloquea solo la administración del módulo en Platform Admin, la precedencia efectiva es idéntica a cualquier módulo).
- **Capacity engine + registry**: `getCapacityStatus`/`assertCapacityAvailable` para `core.users.max`, `core.locations.max`, `commerce.products.max`, `commerce.cash_registers.max`. Delta calculado por transición de estado real (`isXCountedForCapacity`), nunca por comparación literal contra un estado fijo (ej. Products NO compara `nextStatus === "ACTIVE"`, usa `status !== "DISCONTINUED"`). `commerce.cash_registers.max` implementado en el motor pero sin CRUD de `CashRegister` que instrumentar (confirmado: no existe ese entry point hoy — no se inventó uno).
- **Atomicidad**: `withCapacityCheckedTransaction` — Serializable + retry acotado (2 reintentos) solo ante conflicto de serialización (P2034); `CommercialEnforcementError` nunca se reintenta.
- **Cobertura instrumentada — 100% de Server Actions y Route Handlers en `core.users`, `core.locations`, `core.customers`, `commerce.products`, `commerce.inventory`, `commerce.suppliers`, `commerce.purchases`, `commerce.sales`, `commerce.cash`, `fiscal.dte` (27 actions DTE) y los 4 módulos GYM (`gym.memberships` 8/8, `gym.trainers` 6/6, `gym.classes` 10/10, `gym.weekly_plans` 14/14)** — confirmado por barrido estático (cero archivos de acciones sin referencia al guard). Guards centrales (`purchase-api-context.ts`, `sale-api-context.ts`, `customer-api-context.ts`, `dte-api-context.ts`, `requireExportSession`/`requireExportDteSession`) evitan duplicar la lógica MANAGED/LEGACY_UNMANAGED en cada Route Handler. Módulo determinado por función, no por carpeta (`search-for-sale`→`commerce.sales`, `purchase-history`→`commerce.purchases`, `from-dte`→`commerce.purchases`, etc.).
- **Reports API (`/api/reports/**`) — cerrado**: los 16 Route Handlers quedaron auditados y clasificados por el dato funcional real que exponen (nunca se inventó un module code "reports"), vía guard central `src/app/api/reports/reports-enforcement.ts` (reusa tal cual `resolveCommercialEnforcementContext`/`hasOrganizationModule`/`assertOrganizationModule`). 12 single-domain (`gym.memberships` ×3, `gym.classes` ×3, `commerce.sales` ×4, `commerce.purchases` ×2) bloquean el handler completo antes de ejecutar la query si el módulo está deshabilitado. 3 compuestos (`commerce/dashboard`, `commerce/filter-options`, `commerce/product-summary`) resuelven los módulos efectivos UNA vez y filtran por sección — nunca exigen TODOS los módulos ni ANY-habilita-TODO; secciones de un módulo deshabilitado van en `null`/`[]` y su query no se ejecuta cuando es técnicamente evitable (excepción: `product-summary`, cuyo `groupBy` fusiona ventas+compras por fila y no es separable sin restructurar la query — ahí se redactan a `null` los campos del lado deshabilitado tras ejecutar). 1 excepción documentada sin module code (`clients/active`, mismo criterio que "Clientes" en navegación). Ningún reporte de esta carpeta usa `requireSuperAdmin` (no hay reportes Platform-Admin-exclusivos aquí). Ver `docs/modules/platform-block-b-runtime-enforcement.md` sección 7b para la matriz completa endpoint↔module code↔estrategia.
- Catálogos globales (`units-lookup`, `categories-lookup`, `/api/dte/catalogs`, `/api/catalogs/**`) siguen sin guard por diseño (infraestructura compartida sin dueño único) — exención ya aprobada, sin cambios.
- **fiscal.dte**: module enforcement (páginas + Server Actions + Route Handlers) **más** metering real de `fiscal.dte.monthly_issued` (FASE IV-A a IV-D, ver arriba) — ya no "sin metering". No se tocó firmador/pipeline de transmisión/firma en sí (siguen en Prisma global, deuda registrada en FASE IV-C/IV-B.4 — runtime-aware credential propagation para SEND/firma pendiente antes de login cliente real).
- Sin migraciones nuevas — resuelto íntegramente con el schema del Bloque A.

## Próximos pasos
- Platform Bloque fiscal: contador mensual de `fiscal.dte.monthly_issued` **implementado y certificado** (FASE IV-A a IV-D) — pendiente aún: decisión de política comercial para notas de crédito/débito frente al cupo DTE, activación real de límites finitos para alguna organización, y runtime-aware credential propagation para SEND/firma antes de login cliente real (FASE VI).
- Base técnica de SignerProfile por tenant/emisor/ambiente implementada (resolveDteSignerConfigForIssuer, sin tabla nueva — reutiliza DteCredential). sign-dte-document.service.ts y el runner FSE14 TEST ya son issuer-aware con fallback a variables globales intacto. Pendiente: nivel intermedio tenant/organización, escritura runtime-aware de DteCredential para clientes runtime, registrar credenciales reales de TrustMe. Ver docs/modules/dte-signer-multitenant-block.md.
- Escrituras runtime-aware (generar/validar/firmar/transmitir DTE) con permisos propios — solo `DELIVER_EXTERNAL` está allowlisted hoy; el resto del ciclo solo corre vía runner de soporte, no desde UI operativa.
- Runner controlado `SEED_TENANT_BASE` (crear tenant/location/admin contra un PlatformDatabaseProfile, con D0 + dry-run + auditoría) — hoy ese paso solo existe como script ad-hoc (prisma/seed-trustmedb.ts). Ver docs/modules/platform-phase-7-multiclient-provisioning.md §12.
- Variantes runtime-aware de DteIssuerConfig/DteCredential (hoy solo operan sobre Prisma global) antes de dar de alta un segundo cliente runtime con DTE activo.
- Fase futura de operación editable completa desde plataforma (products, customers, suppliers, purchases, sales, inventory, cash, DTE) — solo mencionada como pendiente, no diseñada todavía.
- Vista global /dashboard/dte/outgoing (lista de DTEs emitidos).
- Vista de logs DTE completa.
- QR URL pública, PDF, entrega por email.
- Reintentos automáticos de delivery externo.
- Estrategia del firmador fuera de localhost para producción/Vercel.
- Anulación de ventas confirmadas (con reversión en caja y opción de nota de crédito).
- Acceso rol reception a operaciones de caja (si requerido operativamente).

## Deuda técnica
- tests automatizados
- cierre visual completo de purchases
- integración final suppliers → purchases

## Regla operativa para Claude
Usar este archivo como contexto principal.
No leer docs/_archive_heavy salvo instrucción explícita.
No usar todos los documentos del proyecto para tareas puntuales.
Trabajar siempre con máximo 2 o 3 fuentes activas.