# Platform — Bloque B: enforcement real de módulos y capacidades estáticas

Estado: **implementado con enforcement real y cobertura completa de boundaries externos instrumentables** (no solo modelo). Construye sobre el Bloque A (`platform-block-a-commercial-model.md`), que dejó el modelo comercial y los resolvers de precedencia sin ningún guard de runtime. Ver sección 7 para la matriz final por módulo (páginas + Server Actions + Route Handlers) y sección 13 para las excepciones documentadas (reporting transversal, catálogos globales, endpoints ya deshabilitados).

## 1. Objetivo

Convertir la configuración comercial del Bloque A en bloqueos reales: server-side (páginas, Server Actions, Route Handlers) y de navegación, para 4 capacidades estáticas (usuarios, sucursales, productos, cajas) y para el acceso a módulos completos. Fuera de alcance: `fiscal.dte.monthly_issued` (metering mensual DTE — bloque siguiente), pipeline fiscal, hostname/login SaaS de TrustMe.

## 2. Commercial Enforcement Context

Nuevo subárbol server-only: `src/modules/platform/runtime/commercial-enforcement/`.

```
types.ts                        # CommercialEnforcementContext, CommercialEnforcementError, CapacityStatus
resolve-commercial-context.ts   # resolveCommercialEnforcementContext(tenantId)
module-guard.ts                 # hasOrganizationModule / assertOrganizationModule / requireOrganizationModule
capacity-registry.ts            # CAPACITY_REGISTRY + helpers isXCountedForCapacity + capacityDelta
capacity-engine.ts              # getCapacityStatus / assertCapacityAvailable
with-capacity-checked-transaction.ts  # Serializable + retry acotado
index.ts                        # barrel público
```

### Flujo: tenant → organization → plan → modules → entitlements

`SessionUser`/tenantId base → (páginas "runtime-aware": `resolveEffectiveTenantContext`/`resolveEffectiveApiContext`, YA EXISTENTES del Bloque runtime — resuelven el tenant EFECTIVO considerando "operar como cliente") → `resolveCommercialEnforcementContext(tenantId)` (NUEVO, memoizado por request vía `React.cache()`) → busca `PlatformOrganization` por `tenant_id` en `controlPlanePrisma`:

- **Sin fila** → `mode: "LEGACY_UNMANAGED"`. Log `console.warn("[commercial-enforcement] LEGACY_UNMANAGED_BYPASS", { tenantId })`. Bypass explícito de módulos y capacidades, **nunca reportado como `isUnlimited: true`** — es compatibilidad temporal, no un plan comercial.
- **Con fila** → `mode: "MANAGED"`. Llama a `getEffectiveOrganizationModules`/`getEffectiveOrganizationEntitlements` (wrappers puros del Bloque A, **reutilizados tal cual, sin reimplementar precedencia**), arma `Map<code, EffectiveModule>` y `Map<code, EffectiveEntitlement>`.
- **Organización sin plan asignado** → no es un branch especial: los wrappers ya devuelven todo `UNCONFIGURED`, fail-closed natural.
- **Excepción real al consultar el Control Plane** → `CommercialEnforcementError("COMMERCIAL_CONTEXT_ERROR")`. Nunca degrada a legacy silenciosamente.

## 3. MANAGED vs LEGACY_UNMANAGED

| | MANAGED | LEGACY_UNMANAGED |
|---|---|---|
| Cuándo | Existe `PlatformOrganization.tenant_id` = tenant efectivo | No existe fila para ese tenant_id |
| Módulos | Resueltos por precedencia Org override → Plan → UNCONFIGURED | Todos permitidos (bypass) |
| Capacidad | Resuelta por entitlement efectivo; UNCONFIGURED bloquea | Siempre permitido, `status: "LEGACY_UNMANAGED_BYPASS"`, `isUnlimited: false` |
| Config incompleta (sin plan) | UNCONFIGURED en todo → fail-closed | N/A |
| Error de infraestructura | `COMMERCIAL_CONTEXT_ERROR`, nunca cae a legacy | N/A |

Es una compatibilidad **temporal**, documentada como tal: desaparecerá cuando el flujo SaaS/hostname de TrustMe esté completamente migrado y toda organización quede vinculada a `PlatformOrganization`.

## 4. Module guard

`hasOrganizationModule(ctx, code)`, `assertOrganizationModule(ctx, code)` (lanza `CommercialEnforcementError("MODULE_NOT_ENABLED")`, para Server Actions/Route Handlers), `requireOrganizationModule(tenantId, code)` (resuelve contexto + redirige a `/dashboard?commercial_error=module_not_enabled`, para `page.tsx`, simétrico a `requireAdmin()`).

**`is_core` no es un bypass.** Verificado en código: `is_core=true` (`core.users`, `core.roles`, `core.locations`) solo bloquea la administración del módulo en Platform Admin (no se puede crear override ni desactivar desde ahí — `deactivate-organization-module.action.ts`, `toggle-platform-module-status.action.ts`). El resolver `resolveEffectiveModules` no tiene ninguna rama especial para `is_core` — la precedencia es idéntica a cualquier otro módulo.

## 5. Capacity engine + registry

`CapacityUsageProvider.countUsage(tenantId, runtimeDb)` — `runtimeDb` es **obligatorio y explícito**, nunca un default a `prisma`.

**Separación de fuentes:**
- **Commercial configuration source = CONTROL PLANE** (`controlPlanePrisma`).
- **Usage source = TARGET RUNTIME DB** — la base donde vive el recurso y donde se ejecuta el write. En la arquitectura actual, los 4 recursos (users/locations/products/cash) escriben directo contra el `prisma` singleton normal (mismo tenant de sesión) — sin ambigüedad. El único flujo con runtime DB explícitamente distinta es el **import de Data Onboarding**, que usa el `PrismaClient` temporal del Runtime Database Router apuntando a la organización destino; ahí la config comercial se resuelve aparte contra `controlPlanePrisma` con el `tenant_id` de esa organización (no la sesión del super_admin).

`CAPACITY_REGISTRY`:

| Entitlement | Usage provider | Runtime client en entry points actuales |
|---|---|---|
| `core.users.max` | `User.count({ gym_id, status: "active" })` | `prisma` singleton (createUserAction/toggleUserStatusAction) |
| `core.locations.max` | `Branch.count({ gym_id, status: "active" })` | `prisma` singleton (createBranchAction/toggleBranchStatusAction) |
| `commerce.products.max` | `Product.count({ tenant_id, status: { not: "DISCONTINUED" } })` | `prisma` singleton (create/update-status + API) · `PrismaClient` temporal (import Data Onboarding) |
| `commerce.cash_registers.max` | `CashRegister.count({ tenant_id, is_active: true })` | N/A — sin entry point de escritura hoy (ver sección 8) |

### Semántica de capacidad — delta por transición de estado, no "toda alta = +1"

`commerce.products.max` cuenta **todo estado excepto `DISCONTINUED`**: `isProductCountedForCapacity(status) = status !== "DISCONTINUED"`. El delta real de cualquier transición es `(willBeCounted?1:0) - (wasCounted?1:0) ∈ {-1,0,+1}`; solo `delta>0` dispara `assertCapacityAvailable`. **No existe en el código ninguna rama `nextStatus === "ACTIVE"`** — confirmado en `update-product-status.action.ts` y `PATCH /api/products/[id]/status`. Ejemplos: `DISCONTINUED→cualquier otro` = `+1` (bloqueable); `ACTIVE↔INACTIVE↔BLOCKED_*` = `0` (nunca bloquea aunque esté al límite); `cualquiera→DISCONTINUED` = `-1` (libera, siempre permitido).

Mismo principio para Users (`isUserCountedForCapacity(status) = status === "active"`) y Locations (`isLocationCountedForCapacity(status) = status === "active"`): el alta hoy siempre crea en estado activo (delta de creación efectivamente `+1`), pero el cálculo usa el `status` real persistido, no una constante — queda correcto si en el futuro se agrega un flujo de alta inactiva. `toggleCoreUserStatus`/`toggleLocationStatus`: `inactive→active` = `+1` (verificado), `active→inactive` = `-1` (siempre permitido). Cash: `isCashRegisterCountedForCapacity(isActive) = isActive`, mismo criterio si se construye el CRUD en el futuro.

### `Unlimited` / `UNCONFIGURED` / `OVER_LIMIT`

- **Unlimited real** solo cuando el effective entitlement (PLAN u ORGANIZATION_OVERRIDE) trae `is_unlimited=true` — `status: "UNLIMITED"`.
- **UNCONFIGURED** (MANAGED sin definición efectiva) → `configured: false`, bloquea cualquier incremento, nunca se interpreta como ilimitado.
- **OVER_LIMIT** (`used > limit` ya de entrada, ej. tras reducir plan) → no destructivo: lectura, edición y desactivaciones siempre permitidas; cualquier incremento sigue bloqueado hasta que `used <= limit`.
- **LEGACY_UNMANAGED_BYPASS** — distinto de los tres anteriores, nunca se confunde con `UNLIMITED`.

## 6. Atomicidad — Serializable + retry acotado

`withCapacityCheckedTransaction(runtimeDb, entitlementCode, delta, ctx, write, { maxRetries=2 })`: ejecuta `runtimeDb.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })`, verificando capacidad fresca dentro de la misma transacción. Reintenta hasta 2 veces adicionales (3 intentos totales) **solo** ante conflicto de serialización (`Prisma.PrismaClientKnownRequestError` con `code === "P2034"` o `meta.code === "40001"`). Un `CommercialEnforcementError` (o cualquier otro error) **nunca se reintenta**, se propaga de inmediato.

Operaciones que usan el helper: `createCoreUser`, `toggleCoreUserStatus` (delta>0), `createLocation`, `toggleLocationStatus` (delta>0), `createProductAction`/`POST /api/products`, `updateProductStatusAction`/`PATCH /api/products/[id]/status` (delta>0), el runner de import de productos (Data Onboarding, EXECUTE). `delta<=0` (desactivar/liberar) nunca pasa por Serializable — no compite por el límite.

**Race residual:** ninguno conocido dentro del alcance implementado — todas las escrituras que incrementan capacidad quedan bajo Serializable+retry. Deuda documentada: si en producción el volumen de conflictos de serialización resultara significativo, el retry acotado (2) podría no ser suficiente bajo contención muy alta; no se ha observado ni probado ese escenario.

## 7. Module ↔ ruta/acción — mapping implementado (cobertura completa)

Criterio de cierre aplicado: para cada módulo, **todos** los Server Actions y Route Handlers exportados que ejecutan una operación externa (create/update/delete/toggle/bulk/import, y las consultas que exponen datos del módulo) llevan `assertOrganizationModule`/`requireOrganizationModule`, además de su guard de rol existente (nunca en reemplazo). Helpers internos no exportados, alcanzables solo desde un boundary ya protegido, no llevan guard redundante.

| Module code | Páginas guardadas | Server Actions guardadas | Route Handlers guardados |
|---|---|---|---|
| `core.users` | `/dashboard/users`, `/users/new`, `/users/[id]/edit` | `createUserAction`, `updateUserAction`, `deleteUserAction`, `toggleUserStatusAction` (4/4) | — |
| `core.locations` | `/dashboard/branches`, `/branches/new`, `/branches/[id]/edit` | `createBranchAction`, `updateBranchAction`, `toggleBranchStatusAction` (3/3) | — |
| `core.customers` | `/dashboard/customers` | `createCustomerAction`, `updateCustomerAction`, `updateCustomerActivityAction`, `updateCustomerAddressAction`, `updateCustomerContactAction`, `updateCustomerIdentificationAction` (6/6) | `GET/POST /api/customers`, `GET/PATCH /api/customers/[id]`, `GET /api/customers/search` (guard central en `customer-api-context.ts`, usado por las 3 rutas) |
| `commerce.products` | `/dashboard/products` | `createProductAction`, `updateProductStatusAction`, `updateProductAction`, `verifyEditKeyAction` (4/4) | `GET/POST /api/products`, `GET/PATCH /api/products/[id]`, `PATCH /api/products/[id]/status`, import Data Onboarding |
| `commerce.inventory` | `/dashboard/inventory` | `createProductLocationAction`, `updateProductLocationAction`, `recordInventoryMovementAction` (3/3) | `GET/POST /api/inventory/movements`, `GET /api/inventory/movements/[id]`, `GET/POST /api/inventory/product-locations`, `GET /api/inventory/product-locations/[id]`, `PATCH /api/inventory/product-locations/[id]/status` (5/5) |
| `commerce.suppliers` | `/dashboard/suppliers` | `createSupplierAction`, `updateSupplierAction`, `toggleSupplierStatusAction`, `quickCreateSupplierAction`, `updateSupplierActivityAction`, `updateSupplierAddressAction` (6/6) | `GET/POST /api/suppliers`, `GET/PATCH /api/suppliers/[id]`, `PATCH /api/suppliers/[id]/status`, `GET /api/suppliers/lookup` (6/6; `from-dte` mapeado a `commerce.purchases`, ver sección funcional) |
| `commerce.purchases` | `/dashboard/purchases` | `createPurchaseAction`, `savePurchaseHeaderAction`, `updatePurchaseHeaderAction`, `confirmPurchaseAction`, `cancelPurchaseAction`, `cancelConfirmedPurchaseAction`, `editPurchaseAuthAction`, `addPurchaseItemAction`, `updatePurchaseItemAction`, `removePurchaseItemAction`, `updatePurchasePaymentNatureAction` (9 archivos, 11 exports) | `GET/POST /api/purchases`, `GET /api/purchases/[id]`, `POST /api/purchases/[id]/confirm`, `POST /api/purchases/[id]/cancel`, `POST/PATCH/DELETE /api/purchases/[id]/items[/[itemId]]`, `GET /api/purchases/suggest-code`, `GET /api/purchases/products`, `POST /api/purchases/dte-import`, `GET /api/purchases/dte-import/[id]`, `GET .../match`, `POST .../create-purchase`, `GET /api/suppliers/[id]/purchase-history` (todas) |
| `commerce.sales` | `/dashboard/sales` | `createSaleDraftAction`, `updateSaleDraftAction`, `addSaleItemAction`, `updateSaleItemAction`, `removeSaleItemAction`, `recalculateSaleTotalsAction`, `confirmSaleAction`, `cancelDraftSaleAction`, `discardDraftSaleAction`, `editSaleAuthAction`, `deleteDraftSaleWithAuthAction` (11/11) + `export-sale.actions.ts` (6 exports vía guard central `requireExportSession`) + `export-sale-dte.actions.ts` (6 exports vía guard central `requireExportDteSession`) | `GET/POST /api/sales`, `GET /api/sales/[id]`, `POST/PATCH/DELETE /api/sales/[id]/items[/[itemId]]`, `POST /api/sales/[id]/recalculate`, `GET /api/products/search-for-sale`, `GET /api/products/[id]/sales-history` (todas; `/api/sales/[id]/cancel-draft` ya deshabilitado — ver sección 13) |
| `commerce.cash` | `/dashboard/cash` (vía `getCashWorkspaceStateAction`) | las 10 Server Actions de `commerce/cash/actions/*` (list/get/open/close/movements/workspace/cut-report) (10/10) | — |
| `fiscal.dte` | `/dashboard/dte/outgoing`, `/dashboard/dte/correlatives` | las 27 Server Actions de `commerce/dte/actions/*` (create/generate/sign/transmit/invalidation/issuer-config/correlativos/credenciales — solo module guard, sin tocar firmador/pipeline) (27/27) | `GET/POST /api/dte/issuer-config`, `PATCH /api/dte/issuer-config/[id]`, `GET /api/dte/outgoing/[id]`, `GET /api/dte/outgoing/[id]/logs`, `GET /api/dte/outgoing/by-sale/[saleId]`, `POST /api/dte/outgoing/pending` (todas; `/api/dte/catalogs` es catálogo global, ver sección 13) |
| `gym.memberships` | `/dashboard/memberships/plans`, `/memberships/client-memberships` | `createPlanAction`, `updatePlanAction`, `togglePlanStatusAction`, `createClientMembershipAction`, `updateClientMembershipAction`, `deletePlanAction`, `deleteClientMembershipAction`, `toggleClientMembershipStatusAction` (8/8) | — |
| `gym.trainers` | `/dashboard/trainers` | `createTrainerAction`, `updateTrainerAction`, `deleteTrainerAction`, `toggleTrainerStatusAction`, `addAvailabilitySlotAction`, `removeAvailabilitySlotAction` (6/6) | — |
| `gym.classes` | `/dashboard/classes` | `createClassTypeAction`, `updateClassTypeAction`, `toggleClassTypeStatusAction`, `createScheduledClassAction`, `updateScheduledClassAction`, `toggleScheduledClassStatusAction`, `deleteScheduledClassAction`, `createBookingAction`, `cancelBookingAction`, `recordAttendanceAction` (10/10) | — |
| `gym.weekly_plans` | `/dashboard/weekly-plans/templates`, `/weekly-plans/client-plans` | `createTemplateAction`, `updateTemplateAction`, `toggleTemplateStatusAction`, `upsertTemplateDayAction`, `deleteTemplateDayAction`, `createClientPlanAction`, `updateClientPlanAction`, `toggleClientPlanStatusAction`, `updateClientPlanDayAction`, `markClientPlanDayAction`, `addClientPlanDayAction`, `assignTemplateSegmentedAction`, `deleteTemplateAction`, `deleteClientPlanAction` (14/14) | — |
| — (`Platform Admin`) | Exento — solo `requireSuperAdmin()`, sin module entitlement | — | — |

Ningún módulo GYM tiene Route Handlers propios (todo pasa por Server Actions) — confirmado por auditoría (`find src/app/api -iregex '.*(membership|trainer|class|weekly-plan).*'` solo devuelve endpoints de `reports/**`, de solo lectura, ver sección 13).

### Module code por capacidad funcional, no por carpeta física

Endpoints bajo `products/**` que en realidad sirven a otro módulo llevan el code de su consumidor real:

| Endpoint | Module code | Justificación |
|---|---|---|
| `GET /api/products/[id]/sales-history` | `commerce.sales` | consumidor funcional es Sales |
| `GET /api/products/[id]/purchase-history` | `commerce.purchases` | consumidor funcional es Purchases |
| `GET /api/products/[id]/inventory-summary` | `commerce.inventory` | consumidor funcional es Inventory |
| `GET /api/products/search-for-sale` | `commerce.sales` | usado exclusivamente por el flujo de Sales |
| `POST /api/suppliers/from-dte` | `commerce.purchases` | alta rápida de proveedor exclusiva del flujo de importación DTE de compras (`purchase-dte-create-supplier-dialog`) |
| `GET /api/suppliers/lookup` | `commerce.suppliers` | consumido tanto por el combobox propio de Suppliers como por Purchases (`purchase-dte-import-client`) — sin un consumidor exclusivo, se guarda con el módulo dueño de la entidad, igual que `/api/suppliers/[id]` |
| `GET /api/products/units-lookup`, `categories-lookup`, `GET /api/dte/catalogs` | — sin module guard propio | catálogos globales/de apoyo compartidos por varios módulos (unidades de medida, categorías, catálogos MH tipo CAT-016) — infraestructura transversal, no datos de un módulo comercial específico |

Esto evita que `commerce.sales` habilitado + `commerce.products` deshabilitado bloquee vender con el catálogo existente, y que `commerce.purchases` habilitado + `commerce.suppliers` deshabilitado bloquee la importación DTE de compras.

## 7b. Reports API — cierre de cobertura (`/api/reports/**`)

Pasada final del Bloque B: los 16 Route Handlers de `src/app/api/reports/**` quedaron auditados y clasificados por el dato funcional real que exponen (nunca se inventó un module code "reports"). Guard central reutilizable en `src/app/api/reports/reports-enforcement.ts` — envuelve tal cual `resolveCommercialEnforcementContext`/`hasOrganizationModule`/`assertOrganizationModule`, sin reimplementar precedencia ni bypass:

- `assertReportModule(tenantId, moduleCode)` — reportes de un solo dominio: bloquea el handler completo (403) **antes** de ejecutar la query de negocio si el módulo no está habilitado.
- `resolveEnabledReportModules(tenantId)` — reportes compuestos: resuelve el contexto **una sola vez** y expone `isEnabled(code)` para que el propio handler decida, sección por sección, qué ejecutar/incluir.

| Endpoint | Dato expuesto | Module code(s) | Estrategia | Estado |
|---|---|---|---|---|
| `GET /api/reports/memberships/revenue-by-branch` | ingresos por sucursal desde `ClientMembership` | `gym.memberships` | single-domain, `assertReportModule` | ✅ |
| `GET /api/reports/memberships/expiring` | membresías por vencer | `gym.memberships` | single-domain | ✅ |
| `GET /api/reports/memberships/active-by-branch` | membresías activas por sucursal | `gym.memberships` | single-domain | ✅ |
| `GET /api/reports/clients/active` | `Client` (entidad GYM, `gym_id`/`branch_id`) filtrado por `status:"active"`, con joins de display (`branch`, `sport`, `goal`, `assigned_trainer`) y la membresía activa más reciente (`memberships` con `membership_plan.name`) — el recurso principal es el roster de clientes activos, la membresía es un dato decorativo (`hasActiveMembership`/`membershipPlanName`), no el filtro que determina qué filas aparecen | — sin module code aplicable | sin guard, verificado contra el código real: (1) NO es `core.customers` — ese code gobierna el modelo `Customer` de commerce (facturación/ventas), un modelo Prisma completamente distinto al `Client` de GYM que consulta este endpoint; (2) NO es `gym.memberships` — el filtro es `Client.status:"active"`, no requiere membresía, y de hecho el propio reporte existe para mostrar clientes CON y SIN membresía activa (bloquear todo el roster si `gym.memberships` estuviera deshabilitado ocultaría también los clientes sin membresía, que es exactamente el dato que el reporte busca resaltar); (3) el modelo `Client` es sustrato compartido de todo el vertical GYM (memberships, trainers, classes, weekly-plans lo referencian) sin dueño exclusivo entre los 15 module codes del catálogo Platform — confirmado en código: `src/modules/clients/actions.ts` (CRUD real de `Client`: create/update) tampoco lleva ningún guard de módulo hoy, mismo hallazgo aplicado consistentemente | ✅ (N/A justificado, no solo "mismo criterio de navegación") |
| `GET /api/reports/clients/low-adherence` | asistencia (`ClassAttendance`) por debajo de umbral | `gym.classes` | single-domain | ✅ |
| `GET /api/reports/trainers/classes-taught` | `ScheduledClass` + conteo de `attendance`; nombre de entrenador es join de display | `gym.classes` | single-domain (el recurso gestionado es la clase/asistencia, no el entrenador) | ✅ |
| `GET /api/reports/attendance/by-period` | `ScheduledClass` + `attendance` por periodo | `gym.classes` | single-domain | ✅ |
| `GET /api/reports/commerce/sales-lines` | líneas de venta CONFIRMED | `commerce.sales` | single-domain | ✅ |
| `GET /api/reports/commerce/purchase-lines` | líneas de compra CONFIRMED | `commerce.purchases` | single-domain | ✅ |
| `GET /api/reports/commerce/sales-list` | listado de ventas CONFIRMED (1 fila/documento) | `commerce.sales` | single-domain | ✅ |
| `GET /api/reports/commerce/purchases-list` | listado de compras CONFIRMED (1 fila/documento) | `commerce.purchases` | single-domain | ✅ |
| `GET /api/reports/commerce/customer-summary` | ventas agrupadas por cliente (`SaleItem`/`Sale`) | `commerce.sales` | single-domain (cliente es dimensión de agrupación, no dueño del dato) | ✅ |
| `GET /api/reports/commerce/supplier-summary` | compras agrupadas por proveedor | `commerce.purchases` | single-domain | ✅ |
| `GET /api/reports/commerce/filter-options` | 3 listas independientes: `customers`, `suppliers`, `products` | `core.customers` + `commerce.suppliers` + `commerce.products` | **compuesto**, `resolveEnabledReportModules` — cada lista se resuelve por su propio module code; módulo deshabilitado → esa lista vuelve `[]` (no ejecuta esa query), las demás listas siguen funcionando | ✅ |
| `GET /api/reports/commerce/dashboard` | 10 secciones: `summary`, `sales_by_period`, `purchases_by_period`, `top_products_by_amount/qty`, `top_services_by_amount/qty`, `service_distribution`, `product_vs_service`, `purchases_by_supplier` | `commerce.sales` (7 secciones) + `commerce.purchases` (2 secciones) + `summary` (requiere ambos) | **compuesto** — cada sección de un solo dominio se resuelve por su módulo (query del módulo deshabilitado NUNCA se ejecuta, sección va en `null`); `summary` mezcla `sale.aggregate`+`purchase.aggregate` en un único objeto no separable sin cambiar su forma (margen = ventas−compras) → solo se calcula si AMBOS módulos están habilitados, si no queda `null`. Respuesta incluye `_module_availability` | ✅ |
| `GET /api/reports/commerce/product-summary` | por producto: ventas + compras agrupadas (`ProductSummaryRow`, un `groupBy` fusionado por fila) | `commerce.sales` + `commerce.purchases` | **compuesto por fila** — la query interna fusiona ambos `groupBy` en paralelo y no es separable sin restructurar `get-product-summary-report.ts`; se ejecuta igual pero (1) se **redactan (null)** los campos del lado deshabilitado (`qty_sold`/`amount_sold`/`last_sale_date`/`margin_estimate` si `commerce.sales` está off; `qty_purchased`/`amount_purchased`/`last_purchase_date` si `commerce.purchases` está off), y (2) se **descarta la fila completa** cuando su única razón de estar en el resultado es el lado deshabilitado (ej. un producto solo comprado, nunca vendido, con `commerce.purchases` off desaparece por completo — dejarlo con montos en `null` igual filtraría el hecho de que hubo actividad de compra para ese producto). `total_rows` se calcula después del filtrado. Ambos módulos deshabilitados → `rows: []`. Respuesta incluye `_module_availability` | ✅ (verificado con test explícito de no-filtración, ver 13b) |

Ningún endpoint de `/api/reports/**` usa `requireSuperAdmin()` — no existe hoy ningún reporte exclusivo de Platform Admin en esta carpeta, por lo que la excepción de exención para reportes de plataforma no aplica (documentado, no un hallazgo pendiente).

No se tocó la exención ya aprobada de catálogos globales/transversales (`/api/catalogs/**`, `units-lookup`, `categories-lookup`, `/api/dte/catalogs`, países/municipios/actividades económicas) — siguen sin module guard por ser infraestructura compartida sin dueño único, mismo criterio de la sección 7.

Re-auditoría estática final (`grep -L "reports-enforcement" $(find src/app/api/reports -name route.ts)`): de 16 Route Handlers, 15 referencian el guard central (single-domain o compuesto), 1 (`clients/active`) queda documentado como excepción justificada por no tener module code aplicable. **Cero endpoints de reporting quedan capaces de devolver datos de un módulo deshabilitado sin marcarlo explícitamente como no disponible.**

## 8. `commerce.cash_registers.max` — sin CRUD nuevo

La auditoría confirmó que **no existe ningún entry point de aplicación** que cree o reactive `CashRegister` — el único `prisma.cashRegister.create` del repo es el script de seed (`seed.cash-registers.ts`), fuera de runtime. Por instrucción explícita, **no se crearon Server Actions nuevas** solo para tener dónde aplicar el guard. Se implementó igual el motor completo (`CAPACITY_REGISTRY`, `capacity-engine`, tests) — queda listo para usarse en cuanto esa funcionalidad de gestión de cajas se construya, en un bloque futuro. `create/reactivate enforcement = N/A` por esta razón exacta.

## 9. Data Onboarding (import de productos)

`import-data-onboarding-products.action.ts` resuelve el Commercial Enforcement Context contra `controlPlanePrisma` usando el `tenant_id` de la **organización destino** (no la sesión del super_admin), y exige `commerce.products` habilitado. El runner (`products-import-runner.ts`) calcula el delta total del lote (`toCreate.filter(isProductCountedForCapacity).length`), lo verifica dos veces:
1. **DRY_RUN**: `assertCapacityAvailable` informativo contra usage fresco de la runtime DB destino — bloquea el preview con el mismo mensaje que bloquearía el EXECUTE si excede.
2. **EXECUTE**: dentro de `withCapacityCheckedTransaction` (Serializable + retry), usage fresco verificado en la misma transacción antes de escribir — bloqueo all-or-nothing, sin import parcial.

El preview nunca es la fuente de verdad final; el write siempre revalida.

## 10. Fiscal DTE — solo module enforcement

Únicamente se agregó `assertOrganizationModule(ctx, "fiscal.dte")`/`requireOrganizationModule(tenantId, "fiscal.dte")` en `/dashboard/dte/outgoing`, `/dashboard/dte/correlatives` y `createPendingDteForSaleAction` (representativo). **No se tocó** firmador, pipeline de generación/firma/transmisión, ni `fiscal.dte.monthly_issued` (queda para el bloque de metering DTE siguiente). No se ejecutó ninguna prueba contra MH.

## 11. Navegación

`src/lib/navigation/dashboard-nav.ts`: `ModuleItem.moduleCode?: string` añadido; `filterModuleGroupsByAccess(groups, role, enabledModuleCodes)` filtra por rol **y** módulo (`roleAllowed && (sin moduleCode || moduleEnabled)`). Grupo `platform` siempre exento. Los 2 call sites (`dashboard-sidebar.tsx` vía prop `enabledModuleCodes` resuelta en `layout.tsx`; `dashboard/page.tsx`) resuelven `resolveCommercialEnforcementContext(user.tenant_id)` una vez y derivan el set de codes habilitados — en `LEGACY_UNMANAGED` se incluyen todos los codes referenciados en `MODULE_GROUPS` (bypass, nunca oculta nada bajo compatibilidad temporal).

Items sin `moduleCode` (no existe module code oficial para ellos, no se inventó uno): "Clientes" (gym), "Reportes" (gym), "Consultas y reportes" (commerce), "Configuración" (core admin).

## 12. Errores de dominio

`CommercialEnforcementError` con `code ∈ {MODULE_NOT_ENABLED(403), CAPACITY_LIMIT_REACHED(409), ENTITLEMENT_NOT_CONFIGURED(422), COMMERCIAL_CONTEXT_ERROR(500)}` y `userMessage` en español. Server Actions devuelven `{ error: e.userMessage }` (o para `toggleUserStatusAction`/`toggleBranchStatusAction`, que retornan `void`: redirect con `?commercial_error=...` + banner en la page). Route Handlers: `NextResponse.json({ error: e.userMessage }, { status: e.httpStatus })`.

## 13. Limitaciones y deuda técnica

- **Enforcement page-by-page/action-by-action** — no hay guardrail estructural (middleware o layout compartido) porque `middleware.ts` (edge) no tiene `tenant_id` disponible en la sesión edge-safe, y las rutas de negocio no comparten un layout físico por familia. Una página nueva futura puede olvidarse de instrumentar el guard; mitigación solo por checklist/code review — un barrido estático (`grep -L "commercial-enforcement"` sobre `*.action.ts`/`actions.ts` en `src/modules/**`) confirmó que, a cierre de esta pasada, cero archivos de acciones en `commerce/**` y en los 4 módulos GYM (`memberships`, `trainers`, `classes`, `weekly-plans`) quedan sin referencia al guard.
- **Endpoints de solo-lectura/reporting (`/api/reports/**`)**: ya instrumentados en esta pasada de cierre — ver sección 7b para el detalle completo (single-domain vs compuesto, guard central `reports-enforcement.ts`). Única excepción documentada: `clients/active` (sin module code aplicable).
- **Catálogos globales sin guard por diseño** (no por omisión): `GET /api/products/units-lookup`, `categories-lookup`, `GET /api/dte/catalogs`, `GET /api/catalogs/**` (países, municipios, actividades económicas, tipos de identificación) — infraestructura transversal compartida por varios módulos, sin dueño único, consistente con la regla "módulo por función, no por carpeta" (sección 7).
- **`GET /api/sales/[id]/cancel-draft`**: ya estaba deshabilitado antes de este bloque (responde 403 siempre, reemplazado por `deleteDraftSaleWithAuthAction`) — no requirió guard adicional, se dejó intacto.
- **`PlatformOrganization.tenant_id` sin FK formal** — no se detecta a nivel BD un tenant_id huérfano o duplicado accidental.
- **`controlPlanePrisma` comparte `DATABASE_URL`** con el runtime de la app hoy — funciona porque son la misma base física; es deuda arquitectónica de cara a una separación física futura (trustme.getzolvi.com).
- **`core.roles`**: sin entry point independiente actualmente (no existe `/dashboard/roles`) — el rol es un campo de `User` gestionado dentro de `core.users` (`createUserAction`/`updateUserAction`), ya cubierto por su guard; no se inventó una superficie nueva.
- **Guards centrales reutilizados** (evitan duplicar lógica MANAGED/LEGACY_UNMANAGED/plan/override en cada archivo): `purchase-api-context.ts` (`getPurchaseApiContext`) cubre `route.ts`, `[id]/route.ts` y `products/route.ts` de purchases; `sale-api-context.ts` (`getSaleApiContext`) cubre `route.ts` y `[id]/route.ts` de sales; `customer-api-context.ts` (`getCustomerApiContext`) cubre las 3 rutas de customers; `dte-api-context.ts` (`getDteApiContext`) cubre 4 rutas de DTE; `requireExportSession`/`requireExportDteSession` (dentro de `sales/export/actions/*`) cubren 12 exports del panel FEX 11 en 2 llamadas.

## 13b. Tests de boundaries secundarios (pasada de cobertura completa)

El motor central ya está exhaustivamente probado (58 tests, sección "Commercial Enforcement Context"). Esta pasada añadió tests representativos que demuestran que los boundaries **secundarios** (no solo `create`) también bloquean antes de escribir, sin necesidad de un test idéntico por cada uno de los ~90 archivos instrumentados:

- `confirm-sale.action.test.ts` — `commerce.sales` deshabilitado bloquea `confirmSaleAction` (no create); `confirmSale` (write) nunca se invoca.
- `confirm-purchase.action.test.ts` — `commerce.purchases` deshabilitado bloquea `confirmPurchaseAction`.
- `toggle-supplier-status.action.test.ts` — `commerce.suppliers` deshabilitado bloquea el toggle.
- `record-inventory-movement.action.test.ts` — `commerce.inventory` deshabilitado bloquea el movimiento.
- `update-customer.action.test.ts` — `core.customers` deshabilitado bloquea el update.
- `sign-dte-document.action.test.ts` — `fiscal.dte` deshabilitado bloquea la firma **antes** de consultar el documento o invocar el pipeline (`signDteDocument` y `prisma.dteOutgoingDocument.findFirst` mockeados como spies, ambos sin invocar — sin contactar signer/MH).
- `trainers/actions.test.ts` — `gym.trainers` deshabilitado bloquea `toggleTrainerStatusAction` antes de `prisma.trainer.update`.

Pasada de cierre de reporting (sección 7b) añadió 4 tests adicionales sobre `/api/reports/**`:

- `commerce/sales-list/route.test.ts` — **A)** `commerce.sales` deshabilitado → 403, `getSalesListReport` nunca se invoca; **B)** habilitado → 200, la query se invoca; **D)** `LEGACY_UNMANAGED` → bypass mantenido, la query se invoca igual que MANAGED-habilitado.
- `commerce/dashboard/route.test.ts` — **C)** reporte compuesto con `commerce.sales` habilitado + `commerce.purchases` deshabilitado: las secciones de ventas están presentes y sus queries se ejecutan; las secciones de compras (`purchases_by_period`, `purchases_by_supplier`) quedan en `null` y sus queries **nunca** se invocan; `summary` (mezcla ambos dominios) también queda `null` sin ejecutar `getCommerceReportSummary`; `_module_availability` refleja el estado real.

**Verificación pre-commit adicional** — `commerce/product-summary/route.test.ts` (3 tests de no-filtración, con fixture de 3 productos: uno solo-ventas, uno solo-compras, uno con ambos, y cifras/fechas deliberadamente no solapadas entre lados para que un match de substring en el JSON serializado sea inequívoco):
- **A)** `commerce.sales` habilitado + `commerce.purchases` deshabilitado: campos de ventas visibles, TODOS los campos de compras en `null`, el producto solo-compras desaparece por completo de `rows`, `total_rows` refleja solo las filas autorizadas, y se verifica por regex de límite de palabra sobre el JSON completo que ninguna cifra/fecha de compras es recuperable en ningún campo de la respuesta.
- **B)** inverso exacto (`commerce.sales` off + `commerce.purchases` on): mismo patrón, producto solo-ventas desaparece, cero cifras de ventas recuperables.
- **C)** ambos módulos deshabilitados: `rows: []`, `total_rows: 0`, ninguna cifra operativa de ningún lado presente — documentado como la semántica elegida (200 + estructura vacía, no 403, porque el endpoint es compuesto y no tiene un único module code dueño).

## 14. Qué NO se hizo en este bloque (confirmación explícita)

- NO se implementó `fiscal.dte.monthly_issued` (metering mensual).
- NO se tocó firmador ni pipeline de transmisión DTE.
- NO se ejecutó DTE real, ni se contactó MH.
- NO se creó ningún CRUD nuevo de `CashRegister`.
- NO se migró el schema (cero migraciones nuevas — Bloque B se resolvió íntegramente con el schema del Bloque A).
- NO se tocó remoto, no se hizo deploy, no se hizo provisioning real, no se hizo commit/push.
