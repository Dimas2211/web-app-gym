# Fase 5 — Estado de la migración M1 (2026-11-24)

Migración: `prisma/migrations/20261124000000_mh20_spec_profile/migration.sql` (IMP20-012).

## Contenido (aditivo, sin backfill)

| Tabla | Columna | Tipo | Restricción |
|---|---|---|---|
| dte_issuer_configs | mh_spec_profile | TEXT NULL, sin default | CHECK IN ('MH_1_2','MH_2_0') |
| dte_issuer_configs | numbering_modality | TEXT NULL, sin default | CHECK IN ('CENTRALIZED','PER_ESTABLISHMENT') — declarativo, sin efecto |
| dte_outgoing_documents | mh_spec_profile | TEXT NULL | CHECK |
| dte_invalidation_events | mh_spec_profile | TEXT NULL | CHECK |
| dte_contingency_events | mh_spec_profile | TEXT NULL | CHECK |

No incluye M2–M5. No modifica índices/constraints de correlativos. NULL = MH_1_2.

## Prueba realizada (solo base desechable local)

1. `CREATE DATABASE zolvi_mh20_m1_scratch_<ts>` en localhost:5432 (PostgreSQL 18).
2. `prisma migrate deploy` contra esa base: 66/66 migraciones aplicadas.
3. Verificado: 5 columnas TEXT nullable sin default; 5 CHECK presentes; un valor `MH_9_9` es rechazado.
4. `prisma migrate status`: al día.
5. Drift: `prisma migrate diff --from-migrations --to-schema-datamodel --shadow-database-url <shadow desechable> --exit-code` → "No difference detected".
6. Base desechable y shadow eliminadas.
7. `npx prisma validate` y `npx prisma generate` OK.

## Despliegue seguro

Con `DTE_MH20_PROFILE_ENABLED` apagado (default) el código no lee ni escribe las columnas M1
(`mh20ProfileSelect()` / `mh20ProfileWriteData()` devuelven `{}`), por lo que puede desplegarse
antes de aplicar M1. Encender el interruptor exige M1 aplicada en **cada** base runtime.

## Impacto en bases de datos y sincronización local/remota

- **Base tocada:** solo bases desechables creadas y eliminadas en localhost (`zolvi_mh20_m1_scratch_*` y su shadow).
- **No tocadas:** `DATABASE_URL` / `DIRECT_URL` del `.env` (ambas localhost/TrustmeDB), Supabase, Control Plane, runtimes de clientes, MariaDB. No se ejecutaron seeds.
- **Cambios en `schema.prisma`:** sí (4 modelos, columnas nullable + comentarios CAT-005).
- **Migración nueva:** sí, generada a mano y validada sin drift; **no aplicada** en ninguna base persistente.
- **Desincronización:** TrustmeDB local y todas las remotas quedan SIN M1; el cliente Prisma generado ya conoce las columnas, lo cual es seguro mientras el interruptor siga apagado.
- **Pendiente para el usuario (cuando se autorice):** por cada base runtime/CP, en orden TEST → producción, tras backup:
  `npx prisma migrate deploy` (con `DIRECT_URL` apuntando a esa base) y `npx prisma migrate status`.
  No encender `DTE_MH20_PROFILE_ENABLED` en un entorno sin M1.
- **Scripts auxiliares:** no se crearon; se recomienda incluir M1 en el runbook IMP20-037.
