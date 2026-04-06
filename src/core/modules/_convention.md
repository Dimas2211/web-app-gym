# Convención de módulos core

Cada módulo en `src/core/modules/` representa un dominio cross-industry.
No debe contener lógica específica de ninguna vertical (GYM, spa, retail, etc.).

## Estructura por módulo

```
src/core/modules/<domain>/
  types.ts      — tipos, interfaces y contratos del dominio
  schemas.ts    — validaciones Zod reutilizables
  queries.ts    — acceso a datos (Prisma), sin lógica de negocio
  actions.ts    — server actions, usa queries + validators
```

## Reglas

1. Importar solo desde `src/core/` — nunca desde `src/modules/` (GYM).
2. No usar tipos Prisma directos en `types.ts`; definir tipos propios del dominio.
3. Toda función que toque la DB debe recibir `tenant_id` como parámetro explícito.
4. Los guards a usar son los de `src/core/permissions/guards.ts`.
5. Si una función es solo de GYM, no pertenece aquí.

## Estado actual

| Módulo | Estado |
|---|---|
| tenants | Esqueleto — sin implementar |
| locations | Esqueleto — sin implementar |
| users | Esqueleto — sin implementar |
