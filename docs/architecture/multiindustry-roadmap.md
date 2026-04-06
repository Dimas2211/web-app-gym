# Roadmap — Plataforma Multiindustria Modular

## Objetivo

Convertir el sistema GYM en una plataforma base que soporte múltiples industrias
(gym, retail, spa, clínica, etc.) sobre una sola base de código, con instancias
por cliente configuradas por tenant.

## Dominios planificados

| Dominio | Descripción | Estado |
|---|---|---|
| `core` | Primitivas reutilizables: auth, tenants, usuarios, permisos, locations | En construcción activa |
| `commerce` | Ventas, pagos, inventario, productos — reutilizable entre industrias | Pendiente de extracción |
| `gym` | Membresías, clases, entrenadores, planes semanales — industria GYM | Implementado y funcional |
| `platform` | Super-admin global, onboarding de tenants, billing, configuración | No existe todavía |

---

## Etapas completadas

### Etapa 0 — Protección de la vitrina ✅
- Demo local y publicada en Vercel identificadas como intocables durante todo el proceso
- Restricción activa: ningún cambio puede romper el sistema GYM funcional existente

### Etapa 1 — Auditoría técnica ✅
- Diagnóstico completo de estructura actual
- Clasificación de código existente en core / commerce / gym / platform
- Creación de carpetas destino vacías (`src/core/`, `src/commerce/`, `src/platform/`)
- Sin cambios funcionales

### Etapa 2 — Mapa de transición ✅
- Definición del contrato Gym→Tenant: `Gym.id` = `tenant_id`, `Branch.id` = `location_id`
- Documento técnico `tenant-model.md` con plan de migración en 4 fases
- Fase 1 (actual): `gym_id` en JWT y BD, aliases en TypeScript
- Fase 2: TS types con `tenant_id` explícito — **actualmente en ejecución**
- Fase 3: schema Prisma con columnas adicionales (no destructivo)
- Fase 4: migración completa de nombres en BD

### Etapa 3 — Estructura modular y primeros módulos core ✅
- Utilidades puras movidas a `src/core/` con re-exports en rutas antiguas (zero breaking changes)
- Contratos de identidad: `CoreSessionUser`, `GymSessionUser`, `toCoreSessionUser`
- Mapa de capacidades de rol: `getCapabilities`, `RoleCapabilities`, `registerIndustryCapabilities`
- Guards genéricos: `getCoreSession`, `requireGlobalAccess`, `requireMemberManager`, etc.
- Esqueleto de módulos core: `tenants/`, `locations/`, `users/`
- Primer módulo core funcional: `tenants/queries.ts` validando el patrón mapper

### Etapa 4 — Consolidación de módulos core ✅
- `src/core/modules/tenants/`: types ✓ queries ✓ schemas ✓
- `src/core/modules/locations/`: types ✓ queries ✓ schemas ✓
- `src/core/modules/users/`: types ✓ queries ✓ schemas ✓
- Todo read-only sobre tablas actuales (`gyms`, `branches`, `users`)
- Sin tocar Prisma, auth, JWT ni módulos GYM
- Patrón validado: tipo → mapper privado → SELECT explícito → query pública

### Etapa 5 — Abstracción de SessionUser y guards ✅
- `SessionUser` extendido con `tenant_id` / `location_id` como aliases de `gym_id` / `branch_id`
- `getSessionOrRedirect()` construye ambos alias a partir del objeto de sesión
- Todas las funciones `can*` y `require*` migradas a `getCapabilities()` — sin arrays de roles hardcodeados
- `requireClient` se mantiene GYM-específico deliberadamente (concepto de portal, no de RBAC genérico)
- `src/lib/permissions/guards.ts` sigue siendo el único punto de entrada de sesión para módulos GYM

### Etapa 6 — tenant_id y location_id nativos en JWT y sesión ✅

- `token.tenant_id = user.gym_id` agregado en `jwt()` callback (solo en login)
- `token.location_id = user.branch_id` agregado en `jwt()` callback (solo en login)
- `session.user.tenant_id` propagado con fallback: `token.tenant_id ?? token.gym_id`
- `session.user.location_id` propagado con fallback: `token.location_id !== undefined ? token.location_id : token.branch_id`
- `getSessionOrRedirect()` usa `u.tenant_id` y `u.location_id` directamente desde sesión
- `gym_id` y `branch_id` permanecen intactos en JWT, sesión y todos los módulos GYM
- `auth.config.ts` no fue tocado (middleware Edge solo requiere `role`)
- Prisma schema sin cambios — cero migraciones

**Cadena completa activa:**
```
gym_id    → token.tenant_id   → session.user.tenant_id   → SessionUser.tenant_id
branch_id → token.location_id → session.user.location_id → SessionUser.location_id
```

### Etapa 7 — Separación de actions en capas core y GYM ✅

- `src/core/modules/locations/actions.ts` creado: `createLocation`, `updateLocation`, `toggleLocationStatus`
- `src/modules/branches/actions.ts` reescrito como wrapper GYM — sin `prisma` directo, delega al core
- `src/core/modules/users/actions.ts` creado: `createCoreUser`, `updateCoreUser`, `toggleCoreUserStatus`
- `src/modules/users/actions.ts` reescrito como wrapper GYM para create/update/toggle — delega al core
- Patrón core/wrapper validado en dos módulos con distinto nivel de complejidad
- Corrección de sincronización User ↔ Trainer: sin duplicados, historial preservado, `user_id` nunca se nullea
- Filtros Active / Inactive / All en el listado de entrenadores consistentes entre UI y query
- `deleteUserAction` y `checkDeleteAuth` permanecen en el wrapper GYM deliberadamente (ver sección abajo)
- Demo local y publicada en Vercel intactas durante todo el proceso

**Contrato de retorno del core:**
```typescript
type LocationActionResult = { success: true; id: string } | { success: false; errors?:...; error?: string }
type UpdateCoreUserResult  = { success: true; id: string; previousRole: string; newRole: string } | ...
```

### Etapa 8 — Columnas tenant_id / location_id en Prisma schema (Fase 3 del tenant-model) ✅

- Columnas `tenant_id` y `location_id` agregadas a las tablas relevantes del schema Prisma de forma **no destructiva**
  - Columnas nullable, con relaciones opcionales (`@relation(fields: [tenant_id], ...)`) sobre los mismos modelos `Gym` y `Branch`
  - `gym_id` y `branch_id` permanecen intactos — cero breaking changes en código existente
- Migración `20260402235334_add_tenant_location_ids` generada y aplicada correctamente
  - Migración no destructiva: solo `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  - Sin `DROP`, sin renombrado de columnas, sin pérdida de datos
- Backfill ejecutado: todos los registros existentes con `gym_id`/`branch_id` copiados a `tenant_id`/`location_id`
- Sincronización lograda entre base local (`DATABASE_URL`) y base remota Vercel (`DIRECT_URL`)
  - Migración aplicada primero en base local via `prisma migrate dev`
  - Migración propagada a base remota via `prisma migrate deploy`
- Vercel intacto tras la migración: build y runtime sin errores — deploy público continúa funcionando
- Cast `role as never` en `createCoreUser` sigue presente — pendiente de resolución en Etapa 9

**Estado de las nuevas columnas post-Etapa 8:**
```
users         → tenant_id, location_id (nullable, backfilled desde gym_id/branch_id)
clients       → tenant_id, location_id (nullable, backfilled)
trainers      → tenant_id, location_id (nullable, backfilled)
branches      → tenant_id (nullable, backfilled desde gym_id)
[tablas GYM]  → backfill aplicado donde aplica por operación
```

**Lo que quedó deliberadamente pendiente al cerrar Etapa 8:**
- Queries y writes en módulos GYM siguen usando `gym_id`/`branch_id` como campo operativo real
- Casts temporales (`as never`, mappers de transición) sin eliminar
- `deleteUserAction` sigue siendo 100% GYM-específico — sin abstracción core todavía
- Módulos `memberships`, `classes`, `weekly-plans`, `inventory`, `sales`, `payments` sin tocar
- Las columnas nuevas existen en BD pero no dirigen ninguna query de producción todavía

---

## Estado de seguridad actual

| Aspecto | Estado |
|---|---|
| Demo local | Funcionando — intacta post Etapa 9A |
| Demo Vercel publicada | Funcionando — intacta post Etapa 9A |
| Prisma schema | Actualizado con `tenant_id` / `location_id` (no destructivo) |
| Migraciones | `20260402235334_add_tenant_location_ids` aplicada en local y remoto |
| Sistema GYM (módulos, rutas, auth) | Intacto y funcional |
| Sesiones activas | Protegidas por fallback en session callback |
| `gym_id` / `branch_id` en BD | Existen — siguen siendo campo operativo en writes y módulos pendientes |
| `tenant_id` / `location_id` en BD | Backfill completo — usados en reads de 7 módulos operativos migrados |
| JWT bridge (`gym_id` ↔ `tenant_id`) | Activo — no se elimina hasta completar subfase 9D |

---

## Qué quedó deliberadamente fuera hasta ahora

- `auth.config.ts` — el middleware Edge solo necesita `role`; no requiere tenant/location
- `requireClient` en guards.ts — concepto GYM-específico (portal de cliente), sin equivalente genérico
- `deleteUserAction` — usa `checkDeleteAuth` (autorización destructiva con contraseña), bloquea por `trainer_profile` y `client_profile`; lógica 100% GYM-específica sin equivalente genérico todavía
- `modules/memberships/` y resto de módulos GYM — sin tocar
- Migración formal de queries a `tenant_id`/`location_id` (Fase 4 del tenant-model) — pendiente Etapa 9
- Cast `role as never` en `createCoreUser` — temporal hasta que el enum Prisma sea reemplazado por `string`

---

### Etapa 9 — Migración de queries operativas a tenant_id / location_id (en progreso)

Objetivo: hacer que `tenant_id` y `location_id` sean los campos reales usados en todas las queries
y writes del sistema, reemplazando progresivamente `gym_id` y `branch_id` como campo operativo.

Esta etapa no toca auth ni JWT — los aliases en sesión ya están activos desde Etapa 6.

#### Subfase 9A — Lecturas operativas ✅

Backfill verificado SQL antes de cada módulo: 0 filas con `tenant_id` NULL en todas las tablas afectadas.

| Módulo | Estado |
|---|---|
| `guards.ts` — lado sesión | `location_id` / `tenant_id` activos en todas las funciones `canManage*` |
| `trainers/queries.ts` | Reads migrados — writes intactos |
| `clients/queries.ts` | Reads migrados — writes intactos |
| `memberships/queries.ts` | Reads migrados via helpers `gymScope`/`branchScope` — writes intactos |
| `classes/queries.ts` | Reads migrados — `getLinkedTrainerId` excluido deliberadamente |
| `settings/queries.ts` | `getGym` migrado — `getGymSettings` excluido (parámetro externo) |
| `weekly-plans/queries.ts` | Reads migrados via helpers — `getLinkedTrainerId` excluido |

**Módulos excluidos de 9A deliberadamente:**

| Módulo | Razón |
|---|---|
| `getLinkedTrainerId` (classes y weekly-plans) | Firma pública con `gymId: string` externo — requiere rastrear llamadores |
| `getGymSettings(gymId)` | Mismo motivo — parámetro externo, no de sesión |
| `branches/queries.ts` | Gestiona la entidad `Branch` directamente — pendiente subfase 9A cierre |
| `users/queries.ts` | Módulo de staff con lógica de roles más sensible |
| `reports/queries.ts` | Parámetros `gymId`/`branchId` externos con aggregations complejas |
| `client-portal/queries.ts` | Lee desde campos del registro DB del cliente, no de sesión |
| Todos los `**/actions.ts` | Writes — subfase 9B |
| JWT bridge en `auth.ts` | No hasta que reads y writes estén completamente migrados |

#### Subfase 9A cierre — pendiente

- `branches/queries.ts` — último módulo de lectura operativa pendiente (patrón inline, ~5 cambios)

#### Subfase 9B — Writes operativos (pendiente)

Orden propuesto: `trainers` → `clients` → `memberships` → `classes` → `weekly-plans`

Cada módulo requiere verificación de que los reads del mismo módulo ya estén consolidados antes de migrar sus writes.

#### Subfase 9C — Funciones con parámetros externos (pendiente)

- `getLinkedTrainerId` + sus llamadores en classes y weekly-plans
- `getGymSettings(gymId)` + sus llamadores en settings
- `reports/queries.ts` — parámetros `gymId`/`branchId` externos

#### Subfase 9D — JWT bridge cleanup (pendiente)

- Remover aliases `gym_id`/`branch_id` del JWT en `auth.ts`
- Remover `GymSessionUser` y usar `CoreSessionUser` directamente
- Solo ejecutar cuando reads y writes estén 100% migrados

---

## Siguiente movimiento

**`branches/queries.ts`** — cerrar la subfase 9A de lecturas antes de abrir writes.

---

## Restricciones de diseño permanentes

- Una sola base de código, configuración por tenant
- No microservicios
- Prisma + PostgreSQL como única capa de datos
- Next.js App Router como único framework de routing
- La demo GYM publicada debe seguir funcionando en todo momento
- `gym_id` y `branch_id` permanecen en JWT y BD hasta la migración formal (Fase 3/4)
