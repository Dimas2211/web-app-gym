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