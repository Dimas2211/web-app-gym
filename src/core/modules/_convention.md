# Convención de módulos core

Cada módulo en `src/core/modules/` representa un dominio cross-industry.
No debe contener lógica específica de ninguna vertical (GYM, spa, retail, etc.).

## Estructura por módulo

```
src/core/modules/<domain>/
  types.ts      — tipos, interfaces y contratos del dominio
  schemas.ts    — validaciones Zod reutilizables
  queries.ts    — acceso a datos (Prisma), sin lógica de negocio
  actions.ts    — funciones async puras; el caller gestiona sesión y revalidación
```

## Reglas

1. Importar solo desde `src/core/` — nunca desde `src/modules/` (GYM).
2. No usar tipos Prisma directos en `types.ts`; definir tipos propios del dominio.
3. Toda función que toque la DB debe recibir `tenant_id` como parámetro explícito.
4. Los guards a usar son los de `src/core/permissions/guards.ts`.
5. Si una función es solo de GYM, no pertenece aquí.

## Estado de implementación

| Módulo | queries | schemas | actions | Estado general |
|---|---|---|---|---|
| `tenants` | ✓ | ✓ | pendiente | Parcial — actions requieren tabla `tenants` en BD (Fase 4) |
| `locations` | ✓ | ✓ | ✓ | Implementado |
| `users` | ✓ | ✓ | ✓ | Implementado |

Las fuentes de datos actuales (`gyms`, `branches`, `users`) son temporales durante
el período de coexistencia. Cuando se complete la Fase 4 del roadmap (renombrado
de columnas en BD), los módulos core pasarán a operar directamente sobre
`tenant_id`/`location_id` como columnas primarias en las tablas.
