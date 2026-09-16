# FASE VI-D6 — Certificación de la capa operacional NO-DTE para RUNTIME_CLIENT

Estado: **auditoría + cierre de brechas concretas**, no un rediseño. FASE VI (login runtime real) **NO** se declara completa. `RUNTIME_HOST_AUTH_ENABLED` sigue `false`. Sin push, sin deploy, sin login de cliente en ningún ambiente.

## 1. Qué certificó esta fase

Un audit transversal (dos agentes de investigación en paralelo, sin tocar código) inventarió TODOS los entry points operacionales fuera de `src/modules/commerce/dte/**` y Platform Admin, y buscó cada uso de Prisma global fuera de ese perímetro. El audit encontró un hallazgo **crítico** que contradice lo certificado en VI-D5, y una lista de gaps menores. Todos los hallazgos accionables de alcance acotado se cerraron en esta misma fase; los de alcance amplio quedan documentados como deuda explícita (no se inventó una excepción para "aprobar" la fase).

## 2. HALLAZGO CRÍTICO — cerrado

**`getSaleApiContext()` y `getPurchaseApiContext()` nunca pasaban `user` a `resolveEffectiveApiContext()`.**

`resolveEffectiveApiContext(base, user?)` tiene un contrato explícito y documentado en su propio código: si `user` se omite, cualquier identidad — incluida RUNTIME_CLIENT — cae al branch `PLATFORM_NATIVO` (Prisma global + `tenant_id` de JWT sin revalidar), en vez de fallar cerrado vía `requireRuntimeOrganizationContext`. Los dos helpers de contexto de Sales y Purchases (`src/app/api/sales/sale-api-context.ts`, `src/app/api/purchases/purchase-api-context.ts`) — usados por TODOS los Route Handlers de lectura y por varios de escritura de ambos módulos — omitían ese segundo argumento. Esto significa que, contrario a lo reportado en VI-D5, **las lecturas de Sales y Purchases vía API (list/detail/items) NO eran realmente runtime-safe** hasta esta corrección.

**Fix aplicado:**
- Ambos archivos ahora pasan `user` (casteado a `SessionUser`, con `auth_scope`/`organization_id` ya tipados en el JWT desde FASE VI-B/VI-C) como segundo argumento.
- Se añadió un rechequeo de capability con **rol LIVE** (`context.effectiveRole`, no `user.role` de JWT) después de resolver el contexto — mismo criterio que VI-D2 estableció para el resto de módulos: la autorización decisiva nunca debe depender de un rol de JWT que puede tener hasta 8h de antigüedad.
- 4 tests nuevos (`sale-api-context.test.ts`, `purchase-api-context.test.ts`) certifican que `user` siempre se propaga y que un rol LIVE degradado deniega aunque el JWT todavía diga lo contrario.

**El mismo patrón se encontró y cerró en 3 lugares más:**
- `resolveReportApiContext()` (`src/app/api/reports/reports-enforcement.ts`) — usado por 6 reportes GYM (`attendance/by-period`, `memberships/*` ×3, `trainers/classes-taught`, `clients/low-adherence`) — no aceptaba `user` en absoluto. Se le agregó el parámetro opcional y se actualizaron los 6 call sites.
- `src/app/api/reports/clients/active/route.ts` — llamaba `resolveEffectiveApiContext` directo, sin `user`. Corregido; de paso se cambió `user.location_id` (JWT) por `context.locationId` (efectivo) en el filtro de sucursal.
- Los 8 Route Handlers de `src/app/api/reports/commerce/**` no usaban `resolveEffectiveApiContext`/`resolveReportApiContext` en absoluto — usaban `assertReportModule`/`resolveEnabledReportModules` (helpers que solo hacen module-gate, sin resolver tenant/DB efectivos). Se migraron los 9 directorios (`sales-list`, `purchase-lines`, `purchases-list`, `sales-lines`, `customer-summary`, `supplier-summary`, y los 3 compuestos `dashboard`, `product-summary`, `filter-options`) al patrón `resolveReportApiContext`/`resolveEffectiveApiContext` + `context.client`, preservando exactamente la lógica de degradación por sección de los reportes compuestos (nunca exigir TODOS los módulos, nunca ANY-habilita-TODO, redacción a `null` en `product-summary` tal como estaba documentada). Los 15 archivos de query bajo `src/modules/commerce/reports/queries/*.ts` recibieron el parámetro `client: PrismaClient = prisma` y ya no dependen del default cuando se llaman desde estos routes.
- `dte-api-context.ts` (`src/app/api/dte/dte-api-context.ts`) tiene el mismo patrón sin `user`, pero gatea exclusivamente rutas fiscales — **no se tocó**, por instrucción explícita de no migrar DTE en esta fase. Queda documentado como debt para VI-E.

## 3. Atomicidad de transacciones — auditado y un fix aplicado

- **`confirmPurchase`** (`purchase.service.ts`): el `productLocation.upsert` corría en `db` (fuera de la transacción de confirmación) — si la tx posterior fallaba, quedaba un `ProductLocation` huérfano (`current_stock=0`, sin movimientos). Se fusionó el upsert dentro del mismo `db.$transaction` que marca `CONFIRMED` y registra `PURCHASE_IN` — ahora todo el efecto de negocio (Purchase, ProductLocation, InventoryMovement) es o-todo-o-nada. 2 tests nuevos (`purchase.service.confirm-atomicity.test.ts`) certifican que el upsert nunca ocurre fuera de `tx` y que un fallo posterior revierte todo, incluido el ProductLocation.
- **`confirmSale`**: re-auditado — ya era completamente atómico (claim de venta, `SalePayment`, `applyCashPaymentToSession(tx, ...)`, decremento de stock e `InventoryMovement` todos dentro de un único `db.$transaction`). Sin cambios de lógica, solo se cerró un missed-call-site: `getAnyOpenCashSessionForLocation` (llamada de lectura dentro de `confirmSale`, antes de abrir la tx) no aceptaba `client` y usaba Prisma global incondicionalmente — se le agregó el parámetro y ahora recibe `db`.
- **`cancelConfirmedPurchase`**: re-auditado — solo hace lecturas (`findFirst`) fuera de la transacción (pre-validación), ninguna escritura; ya era atómico, sin cambios.
- **Cash** (`openCashSession`, `closeCashSession`, `recordCashMovement`): re-auditados — las 3 funciones ya envuelven TODAS sus lecturas y escrituras dentro de su propio `db.$transaction`; sin cambios.

## 4. Otros gaps encontrados y cerrados (acotados)

- **`categories-lookup`** (`src/app/api/products/categories-lookup/route.ts`): `ProductCategory` es dato tenant-owned pero el route llamaba `getCategoriesLookup(user.tenant_id)` sin cliente ni contexto — caía a Prisma global. Corregido: resuelve `resolveEffectiveApiContext` y pasa `context.client`.

## 5. Gaps encontrados y DEJADOS COMO DEUDA EXPLÍCITA (fuera de alcance de VI-D6)

Estos NO se tocaron porque cerrarlos exige un rediseño mayor (no "un defecto pequeño y acotado") o porque tocarlos cruzaría la frontera DTE explícitamente prohibida en esta fase:

- **GYM vertical — escritura completamente sin migrar**: `src/modules/{clients,memberships,trainers,classes,weekly-plans,client-portal}/actions.ts` — TODAS las mutaciones (create/update/delete/toggle, incluidos varios `prisma.$transaction` propios) usan Prisma global directamente, gateadas solo por rol de sesión (`requireAdmin`/`requireClientManager`/etc.), nunca por `requireOperationalContext`/`resolveEffectiveTenantContext`. El lado de LECTURA de estos mismos módulos (páginas, queries) SÍ está migrado correctamente — es una asimetría read/write real, no una duda teórica. Esto NUNCA fue declarado "cerrado" en VI-D1 a VI-D5 (esas fases listaron explícitamente Products/Customers/Suppliers/Inventory/Locations/Users/Sales/Purchases/Cash, nunca la vertical GYM) — se documenta aquí como blocker recién identificado, no como regresión de esta fase.
- **`settings/actions.ts` — `updateClientOperationalCodeAction`/`updateClientAvatarAction`**: mismo patrón (Prisma global, gate solo por rol), sobre el mismo modelo `Client` que la vertical GYM de arriba — se deja en el mismo bucket de deuda para migrarlos juntos y no fragmentar la migración del dominio Client.
- **`suggestNextClientCode`** (`src/lib/utils/operational-codes.ts`): sin parámetro `client` (a diferencia de `suggestNextStaffCode`, que sí lo tiene y está correctamente usado). Se deja sin tocar porque su único caller relevante (`clients/actions.ts`) está en el bucket de deuda de arriba — agregarle el parámetro sin migrar el caller no reduce riesgo real.
- **`login/actions.ts`** — `loginAction` consulta `prisma.user.findUnique` (global) para decidir el redirect (`/portal` vs `/dashboard`) ANTES de que `authorize()` determine si la sesión es PLATFORM o RUNTIME_CLIENT. Para un login RUNTIME_CLIENT real, esto significa que un usuario con `role="client"` en la DB runtime nunca sería reconocido en esta consulta previa (no existe en la DB global) y terminaría redirigido a `/dashboard` en vez de `/portal`. Es un bug de comportamiento, no una fuga de datos cross-tenant, y **no es alcanzable hoy** porque `RUNTIME_HOST_AUTH_ENABLED=false` bloquea todo login runtime real. Corregirlo bien requiere enganchar la resolución de organización por hostname ANTES del preview de rol — una pieza de infraestructura de login distinta a lo que esta fase migra. Queda documentado para cuando se diseñe el flujo real de login runtime (FASE VI-F).
- **`units-lookup`** (`get-units-lookup.ts`): el comentario del propio código dice que cada DB de cliente tiene su propia copia sembrada del catálogo de unidades — si eso es cierto, un RUNTIME_CLIENT debería ver SU copia (runtime DB), no la del control plane, a diferencia de countries/municipalities/economic-activities/identification-types que son genuinamente globales sin ambigüedad. Esto es una decisión de producto pendiente (¿las unidades divergen por tenant o no?), no un bug de código — se documenta para que Zolvi decida antes de tocarlo.
- **`dte-api-context.ts`** — mismo patrón de `user` faltante que Sales/Purchases, pero gatea únicamente rutas fiscales. No tocado (instrucción explícita: no migrar DTE en VI-D). Documentado como parte del scope de VI-E.
- **Dead code confirmado, no tocado** (no reduce riesgo real eliminarlo ahora): `get-customer-by-code.ts`, `core/modules/users/queries.ts`, `core/modules/tenants/queries.ts`, `isStaffCodeAvailable`, `isClientCodeAvailable` — cero callers, re-verificado en esta fase.

## 6. Matriz de certificación final

| Módulo | READS_RUNTIME_SAFE | WRITES_RUNTIME_SAFE | CROSS_TENANT_SAFE | SUPPORT_READONLY | GLOBAL_PRISMA_REACHABLE | Notas |
|---|---|---|---|---|---|---|
| Products | YES | YES | YES | YES | NO | Sin cambios en esta fase — ya cerrado en VI-D1, salvo `categories-lookup` (fix aplicado aquí). |
| Customers | YES | YES | YES | YES | NO | Sin cambios — cerrado en VI-D2. |
| Suppliers | YES | YES | YES | YES | NO | Core cerrado en VI-D2. Catálogos globales (countries/municipios/etc.) intencionalmente en Prisma global — GLOBAL_REFERENCE_CATALOG. |
| Inventory | YES | YES | YES | YES | NO | Sin cambios — cerrado en VI-D3. |
| Locations | YES | YES | YES | YES | NO | Sin cambios — cerrado en VI-D3. |
| Users | YES | YES | YES | YES | NO | Sin cambios — cerrado en VI-D4. |
| Sales | YES (corregido) | YES | YES | YES | NO | `getSaleApiContext` no pasaba `user` — CERRADO en esta fase (hallazgo crítico). Transacción de `confirmSale` re-certificada atómica. |
| Purchases | YES (corregido) | YES | YES | YES | NO | `getPurchaseApiContext` mismo hallazgo — CERRADO. `confirmPurchase` ahora 100% atómico (ProductLocation.upsert fusionado a la tx). |
| Cash | YES | YES | YES | YES | NO | Sin cambios — cerrado en VI-D5, re-auditado atómico. |
| Settings (operacional) | YES para módulos con `requireOperationalContext` ya migrado (Users) | **NO** para `updateClientOperationalCodeAction`/`updateClientAvatarAction` | N/A (gym/sports/goals no son alcanzables por RUNTIME_CLIENT — gate `requireSuperAdmin` = PLATFORM-only) | Parcial | **SÍ** (Client-adjacent actions) | Deuda documentada — bucket GYM/Client. |
| Reports | YES (corregido) | N/A (solo lectura) | YES | Parcial (GYM ya lo tenía; Commerce ahora también) | NO (tras el fix de esta fase) | Los 8 routes de `commerce/**` + `clients/active` migrados en esta fase. |
| Lookups/catálogos | YES para lookups tenant-owned migrados (`categories-lookup` corregido); GLOBAL_REFERENCE_CATALOG para countries/municipios/economic-activities/identification-types (correcto, sin acción) | N/A | YES | N/A | Ambiguo solo en `units-lookup` (decisión de producto pendiente) | Ver sección 5. |
| GYM vertical (clients/memberships/trainers/classes/weekly-plans/client-portal) | YES (reads ya migrados en fases previas de facto) | **NO** | N/A para reads; **NO garantizado** para writes | Parcial (solo lee `isRuntimeReadOnlyActive`, que no cubre RUNTIME_CLIENT) | **SÍ** | Blocker nuevo, documentado, no cerrado en esta fase. |

## 7. Flags finales

```
NON_DTE_RUNTIME_ENTRYPOINT_AUDIT_COMPLETE = YES

PRODUCTS_RUNTIME_READY     = YES
CUSTOMERS_RUNTIME_READY    = YES
SUPPLIERS_RUNTIME_READY    = YES
INVENTORY_RUNTIME_READY    = YES
LOCATIONS_RUNTIME_READY    = YES
USERS_RUNTIME_READY        = YES
SALES_RUNTIME_READY        = YES   (corregido en esta fase — NO lo era realmente en VI-D5)
PURCHASES_RUNTIME_READY    = YES   (corregido en esta fase — NO lo era realmente en VI-D5)
CASH_RUNTIME_READY         = YES
SETTINGS_RUNTIME_READY     = NO    (Client-operational-code/avatar siguen en Prisma global — deuda documentada)
REPORTS_RUNTIME_READY      = YES   (Commerce reports migrados en esta fase; GYM reports ya lo estaban)
LOOKUPS_RUNTIME_READY      = YES   (con la ambigüedad de units-lookup documentada, no bloqueante)

REFERENCE_CATALOGS_CLASSIFIED = YES

RUNTIME_CLIENT_NON_DTE_CAN_HIT_GLOBAL_PRISMA = YES   (GYM vertical write actions + Client-operational-code/avatar siguen alcanzables — ver sección 5; NO en los 9 módulos commerce/core certificados arriba)

RUNTIME_CLIENT_CAN_FALLBACK_GLOBAL = NO   (para todo entry point migrado; el patrón de fallback documentado en resolveEffectiveApiContext solo se activa cuando el CALLER omite `user` — ya no ocurre en ningún caller de Sales/Purchases/Reports tras esta fase; persiste únicamente en dte-api-context.ts, fuera de alcance)

SUPPORT_SESSION_READONLY_PRESERVED = YES

RUNTIME_USER_LIVE_SECURITY_COMPLETE = YES   (para los 9 módulos certificados; Sales/Purchases ahora rechequean rol LIVE en el api-context, no solo en las Server Actions)

COMMERCIAL_CONTROL_PLANE_SOURCE_PRESERVED = YES

NON_DTE_CAPACITY_RUNTIME_SAFE = YES

PURCHASE_PRODUCTLOCATION_ATOMIC = YES   (corregido en esta fase)

SALES_OPERATION_ATOMIC    = YES
PURCHASE_OPERATION_ATOMIC = YES   (corregido en esta fase)
CASH_OPERATION_ATOMIC     = YES

SALE_DTE_BOUNDARY_RUNTIME_READY     = NO   (existe y no se tocó — correcto marcarlo NO, no NONE, porque el código fiscal sí existe)
PURCHASE_FISCAL_BOUNDARY_RUNTIME_READY = NO  (ídem, FSE-14)

DTE_MUTATIONS_TOUCHED = NO

RUNTIME_HOST_AUTH_DEFAULT_ENABLED = NO
PRODUCTION_RUNTIME_LOGIN_ENABLED  = NO

SCHEMA_CHANGE      = NO
MIGRATION_REQUIRED = NO

ALL_TESTS_PASS = YES   (618/618, antes 612/612 — 6 tests nuevos: 2 api-context, 2 atomicidad de compra, 2 ajustes de mocks existentes)
BUILD_PASS     = YES

NON_DTE_RUNTIME_OPERATIONAL_LAYER_CLOSED = NO
```

**Por qué `NON_DTE_RUNTIME_OPERATIONAL_LAYER_CLOSED = NO`, no YES:** los 9 módulos commerce/core (Products, Customers, Suppliers, Inventory, Locations, Users, Sales, Purchases, Cash) y Reports están genuinamente cerrados y certificados. Pero la vertical GYM completa (clients/memberships/trainers/classes/weekly-plans/client-portal) tiene sus escrituras 100% en Prisma global, alcanzables por cualquier identidad RUNTIME_CLIENT con rol capaz — eso es exactamente la clase de hallazgo RUNTIME_UNSAFE que esta fase existe para detectar. Declarar la capa "cerrada" mientras ese subárbol completo queda así no sería una certificación honesta. Esto NO bloquea `READY_FOR_VI_E_DTE_RUNTIME` (la frontera fiscal es ortogonal a la vertical GYM), pero sí queda como blocker abierto para una fase futura (candidata: VI-D7) antes de declarar login runtime productivo para clientes con la vertical GYM activa.

```
READY_FOR_VI_E_DTE_RUNTIME = YES   (la base commerce/core no-fiscal está cerrada; el trabajo de VI-E es puramente sobre el pipeline DTE, no depende de que GYM esté migrado)
```

## 8. Blockers explícitos para el siguiente cierre

1. GYM vertical (clients/memberships/trainers/classes/weekly-plans/client-portal) — escritura sin migrar, alcance de un módulo entero, candidato a fase dedicada.
2. `settings/actions.ts` — `updateClientOperationalCodeAction`/`updateClientAvatarAction` + `suggestNextClientCode` — migrar junto con el bucket de Clients de arriba.
3. `dte-api-context.ts` — mismo patrón de `user` faltante que se cerró en Sales/Purchases/Reports, pero gatea rutas fiscales — corregirlo es parte de VI-E, no de VI-D.
4. `login/actions.ts` — bug de comportamiento (redirect incorrecto para `role=client` en runtime) — no alcanzable hoy (`RUNTIME_HOST_AUTH_ENABLED=false`), corregir como parte del diseño real de login runtime (VI-F).
5. `units-lookup` — decisión de producto pendiente (¿unidades por tenant o globales?) antes de tocar el código.
