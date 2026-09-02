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
- platform — FASE 7 cerrada: base operativa multi-cliente auditada y documentada (provisioning, TrustMe como único cliente runtime probado, matriz de automatización existente/faltante). Hueco principal: `SEED_TENANT_BASE` (crear tenant/location/admin en runtime) solo existe como script ad-hoc, no como runner controlado. Ver docs/modules/platform-phase-7-multiclient-provisioning.md.
- commerce/cash cerrado y operativo — apertura/cierre de sesión, movimientos manuales, corte de caja, historial, exportación PDF/Excel, asociación automática venta → sesión. Ver docs/modules/cash-summary.md.

## Identidad activa
- La identidad transversal oficial es tenant_id / location_id.
- No volver a usar gym_id / branch_id como contrato principal.
- El JWT bridge gym_id / branch_id ya fue eliminado.

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

## Platform — Bloque A: modelo comercial y entitlements (implementado, sin enforcement de runtime)

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

**IMPORTANTE — todavía NO hay enforcement de runtime.** El resolver solo alimenta UI de administración (detalle de organización). Ningún flujo de creación de productos/DTE/etc. valida contra estos límites todavía. Eso pertenece a un bloque posterior.

### Semántica de `fiscal.dte.monthly_issued`
Representa cantidad mensual de DTE que consumen cupo comercial. Un DTE fiscal original emitido consume cupo. NO consumen cupo nuevo: invalidación del DTE, contingencia, reintento, consulta MH, firma, retransmisión técnica del mismo documento, delivery a MariaDB, ni otros eventos técnicos asociados al mismo DTE. Notas de crédito/débito y otros documentos derivados: política comercial pendiente de definir explícitamente (no se decidió en Bloque A). El contador/enforcement real no está implementado todavía.

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

## Próximos pasos
- Platform Bloque B (futuro): enforcement de runtime de módulos/entitlements (guards reales al crear productos, sucursales, cajas, al emitir DTE), contador mensual de `fiscal.dte.monthly_issued` con reseteo de período, y decisión de política comercial para notas de crédito/débito frente al cupo DTE.
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