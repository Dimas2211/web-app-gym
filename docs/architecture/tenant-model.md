# Modelo de Tenant — Contrato de Abstracción Técnica

**Estado:** Diseño aprobado. Sin implementar todavía.  
**Demo actual:** Intacta y protegida en todas las fases.

---

## 1. Estado actual exacto

### Prisma

```
Gym (raíz de tenant)
 └── Branch (ubicación física)
      └── User / Client / Trainer / ... (entidades operativas)
```

Todo modelo operativo tiene `gym_id: String` (FK a `Gym`) y, cuando aplica, `branch_id: String?` (FK a `Branch`).

### SessionUser (guards.ts)

```typescript
type SessionUser = {
  id: string
  name?: string | null
  email?: string | null
  role: UserRole            // enum Prisma: super_admin | branch_admin | reception | trainer | client
  gym_id: string            // acoplado al nombre "gym"
  branch_id: string | null
}
```

### JWT (types.d.ts)

El token lleva: `id`, `role: UserRole`, `gym_id: string`, `branch_id: string | null`.

### Guards

- Importan `UserRole` directamente de `@prisma/client`
- Roles hardcodeados: `"super_admin"`, `"branch_admin"`, `"reception"`, `"trainer"`, `"client"`
- Arrays de roles hardcodeados: `ADMIN_ROLES`, `CLIENT_MANAGER_ROLES`, etc.
- Toda función `can*` compara `branch_id` de sesión con `branch_id` del recurso

---

## 2. Problema central

`gym_id` no es solo un nombre. Es un contrato:

```
JWT token shape
  → SessionUser type
    → guards.ts
      → modules/users/actions.ts
      → modules/branches/actions.ts
      → modules/clients/actions.ts
      → ... (todos los módulos)
```

Cambiar `gym_id` a `tenant_id` en cualquier punto rompe toda la cadena. No se puede hacer de forma aislada.

---

## 3. Decisión de arquitectura: ¿Gym reemplaza a Tenant o lo extiende?

### Opción A — Reemplazar: `Gym → Tenant` (renaming destructivo)

- Renombrar tabla `gyms` → `tenants`
- Renombrar FK `gym_id` → `tenant_id` en todos los modelos (15+)
- Crear tabla `gym_profiles` como extensión 1:1 de `tenants`
- **Riesgo:** Migración destructiva, invalida sesiones activas, requiere coordinación total del sistema

### Opción B — Extender: `Tenant + GymProfile` en paralelo (no destructivo inicial)

- Crear tabla `tenants` nueva con campos genéricos
- `Gym` pasa a ser `GymProfile` con FK `tenant_id`
- Los modelos operativos mantienen `gym_id` temporalmente (apunta a `Gym.id`)
- Gradualmente se agrega un campo `tenant_id` en paralelo
- **Riesgo:** Período de coexistencia con doble FK por tabla

### Opción C — Alias en TypeScript sin tocar DB (cero riesgo inmediato)

- No se toca Prisma ni JWT
- Se define `CoreSessionUser` en `src/core/` con campos genéricos (`tenant_id`, `location_id`)
- `SessionUser` actual se convierte en adaptador GYM-específico
- La demo sigue funcionando con `gym_id` en JWT/DB
- `tenant_id` existe solo como tipo conceptual mapeado
- **Riesgo:** Ninguno para la demo. Crea deuda técnica hasta que se migre DB

### **Recomendación: Opción B con entrada por Opción C**

Implementar C como paso inmediato (solo tipos TypeScript), luego B cuando se planifique la migración DB. Nunca hacer A directamente sobre producción.

---

## 4. Shape futuro de `SessionUser`

### Tipo base core (propuesto)

```typescript
// src/core/auth/types.ts — a crear en etapa futura
type CoreSessionUser = {
  id: string
  name?: string | null
  email?: string | null
  role: string              // string genérico, no enum Prisma
  tenant_id: string         // reemplaza gym_id
  location_id: string | null // reemplaza branch_id
}
```

### Adaptador GYM (mantiene compatibilidad)

```typescript
// src/lib/permissions/guards.ts — evolución futura
type SessionUser = CoreSessionUser & {
  role: UserRole            // narrows string → enum GYM
  gym_id: string            // alias de tenant_id para compatibilidad temporal
  branch_id: string | null  // alias de location_id para compatibilidad temporal
}
```

### Regla de transición

Mientras `gym_id` exista en el JWT, `SessionUser` mantiene ambos campos:
```typescript
tenant_id: session.gym_id  // getter temporal
location_id: session.branch_id
```

El JWT solo cambia cuando se migra DB y se despliega una versión coordinada.

---

## 5. Principios para abstraer guards

### Problema actual

Los guards usan rol como cadena exacta: `user.role === "super_admin"`. Si el nombre del rol cambia por industria, hay que reescribir todos los guards.

### Solución: niveles de capacidad de rol

Definir un mapa de capacidades en lugar de comparar nombres:

```typescript
// src/core/permissions/role-capabilities.ts — a crear
type RoleCapabilities = {
  isGlobal: boolean         // acceso sin restricción de ubicación
  canManageLocations: boolean
  canManageStaff: boolean
  canManageMembers: boolean
  canViewOperations: boolean
  scopeType: "global" | "location" | "own_data"
}
```

Los guards del core compararían capacidades, no nombres:

```typescript
// En lugar de: if (user.role === "super_admin")
// Se usaría:   if (getCapabilities(user.role).isGlobal)
```

### Mapa GYM → capacidades core

| Rol GYM | isGlobal | canManageLocations | canManageStaff | scopeType |
|---|---|---|---|---|
| super_admin | true | true | true | global |
| branch_admin | false | false (solo la propia) | true (limitado) | location |
| reception | false | false | false | location |
| trainer | false | false | false | location |
| client | false | false | false | own_data |

### Compatibilidad

El mapa de capacidades se puede construir sobre el `UserRole` existente sin cambiar el enum de Prisma. No requiere migraciones.

---

## 6. Coexistencia sin migración destructiva

### Diagrama de fases

```
[Hoy]
  Gym table ──── gym_id en 15+ modelos
  JWT: { gym_id, branch_id, role: UserRole }
  SessionUser: { gym_id, branch_id, role: UserRole }

[Fase 2 — solo tipos]
  Gym table ──── gym_id en 15+ modelos (sin cambio)
  JWT: { gym_id, branch_id, role: UserRole } (sin cambio)
  CoreSessionUser: { tenant_id, location_id, role: string } ← nuevo tipo solo
  SessionUser: CoreSessionUser + aliases gym_id/branch_id ← adaptador

[Fase 3 — schema extensión, no destructiva]
  Tenant table (nueva) ──── tenants.id
  Gym table ──── gym_id + tenant_id FK (columna adicional)
  JWT: { gym_id, tenant_id, branch_id, role } ← añade tenant_id al JWT

[Fase 4 — migración completa, destructiva controlada]
  Tenant table reemplaza Gym como raíz
  gym_id FKs migrados a tenant_id
  GymProfile 1:1 con Tenant
  JWT limpio: { tenant_id, location_id, role }
```

La demo actual vive en Fase 1. Se puede llegar a Fase 2 sin ningún riesgo.

---

## 7. Estrategia de transición por fases

### Fase 2 — Solo tipos TypeScript (cero riesgo)

**Autorizable en cualquier momento.**

- Crear `src/core/auth/types.ts` con `CoreSessionUser`
- Crear `src/core/permissions/role-capabilities.ts` con el mapa de capacidades
- No modificar `guards.ts`, `auth.ts` ni JWT
- No mover módulos funcionales

**Resultado:** El contrato core existe como tipo. Todo el código actual sigue compilando igual.

### Fase 3 — Migración de schema (riesgo medio, planificada)

**Requiere ventana de mantenimiento.**

- Agregar tabla `tenants` en Prisma (nuevo modelo, no reemplaza nada)
- Agregar campo `tenant_id` nullable en tabla `gyms` (no destructivo)
- Migración de datos: poblar `tenants` con datos de `gyms`
- Nueva JWT shape con `tenant_id` adicional (backward compatible: lleva ambos)
- `SessionUser` empieza a leer `tenant_id` de JWT
- Módulos nuevos usan `tenant_id`, módulos existentes siguen con `gym_id`

### Fase 4 — Consolidación (riesgo alto, producción planificada)

**Solo cuando no hay demo activa en riesgo.**

- Migrar todas las FKs de `gym_id` → `tenant_id`
- Convertir `Gym` en `GymProfile` (1:1 con `Tenant`)
- Limpiar JWT: eliminar `gym_id`, dejar solo `tenant_id`
- Todas las sesiones activas se invalidan (logout global)
- Actualizar todos los módulos a `tenant_id`

---

## 8. Riesgos concretos

| Riesgo | Fase | Impacto | Mitigación |
|---|---|---|---|
| Cambio de JWT invalida sesiones activas | 3→4 | Todos los usuarios salen del sistema | Despliegue coordinado + aviso previo |
| Enum `UserRole` de Prisma cambiado | Cualquiera | Rotura del cliente Prisma generado | Regenerar cliente + tests antes de deploy |
| `role === "client"` en `auth.config.ts` | Si renombramos roles | Routing de portal roto | Cambiar antes de renombrar roles |
| FK `gym_id` renombrada sin migración de datos | Fase 4 | Pérdida de relaciones en DB | Script de migración + validación previa |
| Doble FK por tabla durante Fase 3 | Fase 3 | Inconsistencia transitoria | Constraint temporal + script de sincronización |

---

## 9. Recomendación final

**Implementar solo Fase 2 en el corto plazo.**

Crear los tipos core sin tocar nada funcional. Eso:
- Establece el contrato técnico formal
- Permite que nuevos módulos se escriban contra `CoreSessionUser` desde el inicio
- No afecta la demo
- No requiere coordinar migraciones ni deploys
- Deja listo el camino para Fase 3 cuando haya una ventana planificada

**No hacer Fase 3 ni 4 hasta:**
1. Tener tests de integración mínimos sobre auth y guards
2. Tener una ventana de mantenimiento planificada
3. Tener el script de migración validado en una DB de prueba
4. Tener la nueva JWT shape testeada en staging
