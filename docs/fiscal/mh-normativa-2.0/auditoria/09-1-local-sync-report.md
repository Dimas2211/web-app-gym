# MH 2.0 — Fase 9.1: sincronización de TrustmeDB local (M-COR-01)

- **Fecha:** 2026-11-25. **Rama:** `feat/mh-normativa-2.0`.
- **Destino:** `localhost:5432/TrustmeDB` (PostgreSQL 18.3). Única escritura persistente autorizada de la fase.
- **Resultado:** **70/70**, sin drift, sin P2022, datos documentales intactos.

## 1. Conexión (sin exponer secretos)

| Variable | Archivo | Apunta a |
|---|---|---|
| `DATABASE_URL` | `.env` | `localhost:5432/TrustmeDB` |
| `DIRECT_URL` | `.env` | `localhost:5432/TrustmeDB` |
| `DATABASE_URL` / `DIRECT_URL` | `.env.local` / shell | no definidas |

Ambas variables apuntan a la misma base: no hay desalineación local/CLI.

## 2. Precondiciones

| Control | Resultado |
|---|---|
| Migraciones aplicadas / fallidas | 69 / 0 |
| Pendientes (`migrate status`) | **exactamente 1**: `20261125000000_cor01_fiscal_year` |
| Migraciones no autorizadas | ninguna |
| Registros ambiguos COR-01 (consulta del expediente §3) | **0** |

## 3. Respaldo

| Elemento | Valor |
|---|---|
| Carpeta (fuera del repo) | `C:\Users\rodri\Documents\zolvi-backups\trustmedb-pre-fase9-1-20261125\` |
| Dump | `TrustmeDB-20261125-pre-fase9-1.dump` (`pg_dump 18.3 -Fc --no-owner --no-acl`), 903.043 bytes |
| SHA-256 | `5d1f86df90b4e219bb9e1679578ba3265add82f254a6b01ec00b42f1a230e88c` |
| TOC | 961 entradas: 102 TABLE, 355 INDEX, 188 FK, 102 CONSTRAINT, 67 TYPE, 26 TRIGGER, 18 FUNCTION |
| Instantáneas | migraciones (69), conteos exactos de 102 tablas, huella documental, esquema, `MANIFEST.txt` |

## 4. Restauración y ensayo (base desechable `zolvi_scratch_restore_9_1`)

| Control | Resultado |
|---|---|
| `pg_restore` | exit 0, 0 errores |
| Conteos de filas | idénticos en 102/102 tablas |
| Consulta de ambiguos | 0 |
| `migrate deploy` | 1/1 aplicada (M-COR-01) |
| `migrate diff` contra `schema.prisma` | vacío |
| `fiscal_year` | 72/72 = 2026, 0 NULL |
| Huella md5 (`id`, `control_number`, `generation_code`, `json_document`, `signed_jws`, `reception_stamp`, `dte_status`) | idéntica antes/después: `9a031a4b…ab40` |
| `dte_correlatives` (hash de fila completa) | idéntico: `cedefe63…d77d8f` (7 filas) |
| Conteos tras migrar | solo `_prisma_migrations` 69 → 70 |
| Índices nuevos | `…_tenant_id_environment_fiscal_year_co_key`, `…_legacy_control_number_key`, CHECK `…_fiscal_year_chk` |

Un primer intento del ensayo abortó en la validación de Prisma por `DIRECT_URL` vacío (error del export en el shell); no se ejecutó ninguna operación y TrustmeDB siguió en 69.

## 5. Aplicación en TrustmeDB

| Paso | Resultado |
|---|---|
| `npx prisma migrate deploy` | `20261125000000_cor01_fiscal_year` aplicada |
| `npx prisma migrate status` | 70 migraciones, *Database schema is up to date* |
| `npx prisma generate` | OK (v6.19.2) |
| Drift (`migrate diff --exit-code`) | 0 |
| Huella documental y correlativos | idénticos al respaldo |
| Conteos | solo `_prisma_migrations` 69 → 70 |
| Lectura Prisma de `dte_outgoing_documents` (`count`, `findMany` con `fiscal_year`, fila completa) | OK, **sin P2022** |

No se aplicaron seeds MH 2.0. No se activaron flags.

## 6. Bases desechables

Creadas: `zolvi_scratch_restore_9_1`, `zolvi_scratch_pg_9_1`, `zolvi_scratch_sql_9_1`. **Todas eliminadas** al cerrar.

## Impacto en bases de datos y sincronización local/remota

| Pregunta | Respuesta |
|---|---|
| Cambios en `schema.prisma` en esta fase | No (los de 9.0 ya incluían COR-01; ahora versionados) |
| Migración nueva | No |
| Base tocada | TrustmeDB local: M-COR-01 (#70) |
| Bases no tocadas | Control Plane, runtime compartido, Supabase, MariaDB |
| Alineado | TrustmeDB 70/70 = repo |
| Desalineado | CP y runtime: 65/70 + 1 migración de `main` (`20261119000000_gym_customer_links`) que esta rama no tiene. Ver `09-1-remote-readiness-inventory.md` |
| Rollback local | `dropdb TrustmeDB && createdb TrustmeDB && pg_restore --no-owner --no-acl -d TrustmeDB <dump>` (no fue necesario) |
