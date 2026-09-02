# Platform — Bloque A: Modelo comercial y entitlements

Estado: modelo administrativo implementado. **NO incluye enforcement de runtime todavía** (bloque posterior).

Ver resumen ejecutivo también en `docs/context/current-state.md` § "Platform — Bloque A".

## Modelos nuevos

| Modelo | Rol |
|---|---|
| `PlatformPlanModule` | Módulos incluidos por defecto en un plan (`plan_id`, `module_id`, `is_enabled`) |
| `PlatformEntitlementDefinition` | Catálogo extensible de capacidades/límites (`code`, `category`, `value_type`, `period_type`) |
| `PlatformPlanEntitlement` | Valor por defecto de un entitlement en un plan (`numeric_value` \| `is_unlimited`) |
| `PlatformOrganizationEntitlementOverride` | Excepción explícita por organización |

`PlatformOrganizationModule` (ya existía) **no cambió de schema** — sigue representando el estado efectivo/override por organización.

## Precedencia de módulos (determinista)

1. Fila `PlatformOrganizationModule` para (org, module) existe → manda. `is_active=true` → `ORGANIZATION_OVERRIDE_ADDED`; `is_active=false` → `ORGANIZATION_OVERRIDE_REMOVED`.
2. No existe fila → se hereda `PlatformPlanModule.is_enabled` del plan de la organización → fuente `PLAN`.
3. Ni fila de organización ni `PlatformPlanModule` → `UNCONFIGURED`, enabled=false.

Justificación de por qué no fue necesario tocar el schema de `PlatformOrganizationModule`: antes del Bloque A no existía ningún concepto de plan-módulo, así que toda fila existente ya era, por construcción, una decisión explícita e independiente de la organización — exactamente lo que un "override" necesita representar. Agregar la interpretación "ausencia de fila = heredar del plan" no reinterpreta ninguna fila existente.

**Corrección post-cierre** — aunque el schema no cambió, el panel de UI y una de las actions sí tuvieron que corregirse para que las tres operaciones (Heredar / Habilitar / Deshabilitar) fueran realmente posibles:
- `platform-organization-modules-panel.tsx` mostraba el estado crudo de la fila (`isActive = orgModule?.is_active ?? false`), lo que hacía ver como "apagado" cualquier módulo heredado del plan sin fila propia — engañoso una vez que el plan puede habilitar módulos por herencia. Se reescribió para consumir `EffectiveModule[]` (con `source`) y ofrecer tres botones: **Heredar** (elimina el override), **Habilitar**, **Deshabilitar**.
- `deactivateOrganizationModuleAction` usaba `update` y exigía una fila `is_active=true` preexistente — fallaba al intentar deshabilitar como override un módulo que estaba efectivamente habilitado solo por herencia del plan (sin fila propia). Se corrigió a `upsert`.
- Nueva action `revertOrganizationModuleToInheritAction` — hace `deleteMany` de la fila `PlatformOrganizationModule` (organization_id, module_id). Deshabilitada en la UI cuando no hay override vigente (nada que revertir).

Ejemplo verificado con test (`entitlements-resolver.test.ts`, describe "transición HEREDAR"):
- Plan incluye Inventory, override deshabilitado (`is_active=false`) → efectivo `disabled/ORGANIZATION_OVERRIDE_REMOVED`. Al "Heredar" (eliminar fila) → efectivo `enabled/PLAN`.
- Plan NO incluye DTE, override habilitado (`is_active=true`) → efectivo `enabled/ORGANIZATION_OVERRIDE_ADDED`. Al "Heredar" (eliminar fila) → efectivo `disabled/UNCONFIGURED`.

## Precedencia de entitlements

`Organization override → Plan entitlement → UNCONFIGURED`.

Implementado en `src/modules/platform/lib/entitlements-resolver.ts`:
- `resolveEffectiveModules(...)` / `resolveEffectiveEntitlements(...)` — funciones puras, testeadas en `entitlements-resolver.test.ts`.
- `getEffectiveOrganizationModules(organizationId)` / `getEffectiveOrganizationEntitlements(organizationId)` — wrappers server-side (fetch + resolve).

## Reglas de "ilimitado"

`is_unlimited=true` → `numeric_value` se ignora (se guarda `null`). Nunca se usan números mágicos (`999999`, `-1`, `999999999`) para representar ilimitado. La regla "unlimited ⟹ sin numeric_value, no-unlimited COUNT ⟹ numeric_value requerido" se valida en los schemas Zod (`create-platform-plan.schema.ts`, `update-platform-plan.schema.ts`, `set-organization-entitlement-override.schema.ts`) — Prisma no expresa ese CHECK condicional de forma portable.

## Catálogo inicial de entitlements

| Código | Categoría | Periodicidad |
|---|---|---|
| `core.users.max` | core | NONE |
| `core.locations.max` | core | NONE |
| `commerce.products.max` | commerce | NONE |
| `commerce.cash_registers.max` | commerce | NONE |
| `fiscal.dte.monthly_issued` | fiscal | MONTHLY |

Verificado por lectura directa contra la base local tras re-sembrar: existen exactamente estas 5 filas en `PlatformEntitlementDefinition`, todas `is_active=true`.

GYM no tiene entitlements propios en Bloque A. El catálogo es extensible: agregar `gym.clients.max` en el futuro no requiere migración estructural, solo una fila nueva en `PlatformEntitlementDefinition`.

## Semántica de `fiscal.dte.monthly_issued`

Representa el cupo mensual de DTE que consumen cuota comercial. Un DTE fiscal **original** emitido consume cupo.

**NO consumen cupo nuevo:**
- invalidación del DTE
- evento de contingencia
- reintento
- consulta MH
- firma
- retransmisión técnica del mismo documento
- delivery a MariaDB
- otros eventos técnicos asociados al mismo DTE

Ejemplo: 15 facturas emitidas + 15 invalidaciones de esas mismas facturas = 15 DTE consumidos, no 30.

Notas de crédito/débito y otros documentos fiscales derivados: **política comercial pendiente de definir explícitamente** — no se decidió en Bloque A porque no existe todavía una regla contractual en código/documentación que la determine.

El contador/enforcement real (reseteo mensual, bloqueo al superar cupo) **no está implementado** — pertenece a un bloque posterior.

## Legacy `max_locations` / `max_users` — transición implementada (corrección post-cierre)

### A. Consumidores reales de `max_users` (inspección exhaustiva, grep sobre todo `src/`)
1. `src/modules/platform/queries/list-platform-plans.ts` — select + mapeo (lectura).
2. `src/modules/platform/schemas/create-platform-plan.schema.ts` — validación de input del form.
3. `src/modules/platform/schemas/update-platform-plan.schema.ts` — ídem.
4. `src/modules/platform/actions/create-platform-plan.action.ts` — parseo de `formData`.
5. `src/modules/platform/actions/update-platform-plan.action.ts` — ídem.
6. `src/modules/platform/components/platform-plan-form-dialog.tsx` — input del formulario.
7. `src/modules/platform/components/platform-plans-table.tsx` — columna de la tabla (`fmtLimit`).
8. `src/modules/platform/queries/get-deployment-bundle.ts` — select + mapeo hacia `DeploymentBundlePlan`.
9. `src/modules/platform/components/platform-deployment-bundle-viewer.tsx` — fila "Máx. usuarios" del visor.

### B. Consumidores reales de `max_locations`
Exactamente los mismos 9 archivos de la lista A (mismo patrón, mismo par de campos leídos/escritos juntos en cada uno).

**Ningún consumidor de A o B compara, bloquea o hace enforcement con estos valores** — todos son lectura/formulario/visualización pura. No existe código en el repo (fuera de estos 9 archivos) que use `max_users`/`max_locations` para decidir algo en runtime.

### C. Qué pasaría si se configura `core.users.max`/`core.locations.max` pero el consumidor legacy sigue leyendo la columna antigua
Antes de esta corrección: nada — ambas columnas podían divergir silenciosamente sin ninguna sincronización, lo cual el usuario correctamente señaló como "dos fuentes comerciales contradictorias". Un admin podía ver `max_users=5` en la tabla de planes mientras `core.users.max` decía `20` en el panel de entitlements, sin relación entre ambos.

**Corrección aplicada**: espejo unidireccional determinista, implementado en `src/modules/platform/lib/legacy-plan-limits.ts` (`deriveLegacyPlanLimits`, función pura, testeada en `legacy-plan-limits.test.ts`) e invocado desde `create-platform-plan.action.ts` / `update-platform-plan.action.ts` en cada guardado de plan:

- El entitlement (`core.users.max` / `core.locations.max`) es la **fuente comercial futura** — si está configurado en el plan, su valor manda.
- Al guardar el plan, ese valor se escribe también en la columna legacy: `is_unlimited=true` → legacy = `null` (semántica que el propio schema ya documenta: `// null = sin límite` — nunca `999999`/`-1`/número mágico); si no, legacy = el número exacto.
- Si el entitlement NO está configurado en ese plan (catálogo sin la definición, o plan sin fila `PlatformPlanEntitlement` para ese código) → la columna legacy conserva lo que el formulario envió para el campo legacy (modo "solo legacy", compatibilidad hacia atrás con planes no migrados).
- UI (`platform-plan-form-dialog.tsx`): cuando el entitlement correspondiente está configurado en el draft del formulario, el campo legacy se muestra bloqueado (`readOnly disabled`) y con el valor sincronizado — nunca se presenta como un campo editable independiente que pudiera contradecir al entitlement.

Con esto, los 9 consumidores de A/B **no necesitaron ningún cambio de código**: siguen leyendo la misma columna de siempre, pero esa columna ahora es un espejo fiel del entitlement una vez que este se configura — deja de ser una segunda fuente de verdad independiente.

`max_users` y `max_locations` no se eliminan en este bloque (columnas legacy conservadas). La decisión de eliminarlas definitivamente (Bloque C, según lo indicado) queda pendiente y explícita.

## Commerce sin vertical (FASE A11)

`vertical_id = null` en `PlatformOrganization` es válido y no es un error de provisioning. `checkVertical` en `provisioning-validator.ts` pasa (`passed: true`) en ambos casos:
- sin vertical → mensaje informativo "No aplica — organización transversal (Commerce sin vertical)".
- con vertical asignada → validado normalmente (GYM sigue funcionando igual que antes).

**NO se usa la vertical `GENERAL`** como fallback en ningún punto. Tras el hardening post-cierre, `seed.platform.ts` **ya no la siembra** en instalaciones nuevas — se inspeccionó exhaustivamente y no existe dependencia real de código/test/FK/documentación que la requiera (el único otro match de "GENERAL" en el repo es un código de `ProductCategory` en `seed.base.ts`, dominio no relacionado). Una base que ya la tenía sembrada de antes (ej. la base local usada para validar este bloque) no se ve afectada — el seed nunca hace `DELETE`, queda como registro legacy hasta limpieza manual futura.

No se agregó `commercial_modality` — se usó la interpretación más pequeña posible: `vertical == null` ⟹ organización transversal.

## UI

- `/dashboard/platform/plans` — el diálogo crear/editar plan incluye:
  - datos generales (igual que antes, + nota aclaratoria sobre legacy)
  - checkboxes de módulos incluidos, agrupados por categoría, generados desde `PlatformModule` real (no hardcodeado)
  - límites/capacidades editables generados desde `PlatformEntitlementDefinition` real, con toggle "Ilimitado" por fila — un futuro `gym.clients.max` aparecería automáticamente sin cambios de código.
- `/dashboard/platform/organizations/[id]` — nuevo panel **"Límites / capacidades efectivas"** (`PlatformOrganizationEntitlementsPanel`): valor efectivo + origen (plan / override / sin configurar) por entitlement, con edición/creación/eliminación de override. El panel de módulos existente (`PlatformOrganizationModulesPanel`) no se modificó.

## Seeds — hardening: sin composición comercial demo en el bootstrap normal

`seed.platform.ts` corre igual en los tres modos de `prisma/seed.ts` (`catalogs`/`base`/`demo`), **incluido `base`** — el modo pensado para provisionar clientes reales, no solo para desarrollo.

`seed.platform.ts` siembra hoy:
1. El catálogo de 5 `PlatformEntitlementDefinition` (oficial, según especificación) — sin cambios.
2. El catálogo técnico `PlatformModule` — sin cambios.
3. Los tres planes `starter`/`professional`/`enterprise` como **registro base únicamente** (código, nombre, descripción, ciclo de facturación, `max_locations`/`max_users` legacy) — **sin ninguna fila `PlatformPlanModule` ni `PlatformPlanEntitlement`**.

**Qué se retiró y por qué**: la versión anterior de este bloque sembraba `PLAN_MODULES_DEMO` y `PLAN_ENTITLEMENTS_DEMO` — una composición de desarrollo (qué módulos trae cada plan, límites numéricos por plan) para poder probar las relaciones nuevas. Como `seedPlatform()` corre también en modo `base`, esos valores demo se habrían convertido silenciosamente en el bootstrap comercial real de cualquier control plane nuevo (otro cliente, otro ambiente) sin que Zolvi hubiera aprobado esa composición todavía — exactamente el riesgo señalado en la revisión. Se eliminaron por completo las dos constantes y el bloque de siembra correspondiente; no se introdujo ningún mecanismo nuevo de seed "solo demo" porque no hacía falta — la solución mínima es simplemente no sembrar esos datos.

**Estado resultante**: los tres planes existen sin composición comercial. Deben configurarse explícitamente desde Platform Admin (`/dashboard/platform/plans`) cuando Zolvi apruebe qué módulos/límites trae cada uno. Un plan sin `PlatformPlanModule`/`PlatformPlanEntitlement` es un estado válido y ya está cubierto por el resolver (`UNCONFIGURED` / módulo no heredado-disabled), con tests existentes (`entitlements-resolver.test.ts`, caso 5 y el caso de módulo sin plan ni fila de organización).

**Validado localmente** (sin tocar remoto): tras el hardening, `seedPlatform()` se re-ejecutó contra `localhost/TrustmeDB` y `PlatformPlanEntitlement`/`PlatformPlanModule` se mantuvieron en 15/36 (los mismos artefactos demo creados por la versión anterior de este bloque, no borrados porque no era necesario para aceptar el código) — es decir, el código nuevo confirmadamente **no** vuelve a crear ni sumar composición comercial demo.

## Migración

`prisma/migrations/20260902182700_platform_entitlements_model`:
- 2 enums nuevos: `PlatformEntitlementValueType`, `PlatformEntitlementPeriodType`.
- 4 tablas nuevas: `platform_plan_modules`, `platform_entitlement_definitions`, `platform_plan_entitlements`, `platform_organization_entitlement_overrides`.
- Solo `CREATE TYPE` / `CREATE TABLE` / `CREATE INDEX` / `ADD CONSTRAINT` — ninguna tabla o columna existente se modificó o eliminó.
- Aplicada con `prisma migrate deploy` solo contra LOCAL (`localhost:5432/TrustmeDB`, mismo host en `DATABASE_URL` y `DIRECT_URL`). No se ejecutó contra ningún entorno remoto/producción.

## Pendiente explícito (fuera de alcance del Bloque A)

- Enforcement de runtime: bloquear creación de productos/sucursales/cajas o emisión de DTE al superar el límite efectivo.
- Contador real de `fiscal.dte.monthly_issued` con reseteo por periodo mensual.
- Política comercial explícita para notas de crédito/débito frente al cupo DTE.
- Decisión sobre migrar `max_locations` legacy hacia `core.locations.max` como única fuente de verdad.
- Planes comerciales oficiales definitivos: `starter`/`professional`/`enterprise` existen como registro base, sin ninguna composición de módulos/límites sembrada — deben configurarse desde Platform Admin cuando Zolvi apruebe la oferta comercial real. Ningún dato de desarrollo/demo representa una oferta comercial de Zolvi.
