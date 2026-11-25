# MH 2.0, Fase 8: estado de migraciones

Fecha: 2026-11-25. Rama `feat/mh-normativa-2.0`, HEAD `b682b70`, sin commit.

## 1. Migraciones del proyecto MH 2.0

| Id | Carpeta | Estado | Uso |
|---|---|---|---|
| M1 | `20261124000000_mh20_spec_profile` | Sin cambios | runtime |
| M1b | `20261124010000_mh20_spec_profile_audit` | Sin cambios | runtime |
| M2 | `20261124020000_mh20_return_events` | Sin cambios | runtime |
| M3 | — | No creada (Fase 6) | — |
| **M4** | `20261124030000_mh20_mh_test_run_profiles` | **Nueva** | **solo Control Plane** |

## 2. Revisión previa de los modelos existentes

Antes de crear M4 se revisaron los modelos existentes:

- `PlatformDteMhTestRunItem.kind` y `.step` son `String`, así que los kinds nuevos (Retorno, OE) no requieren migración.
- `PlatformDteMhTestRun.plan` es `Json`, de modo que el perfil y la cadena ya viajan en el plan.

M4 se justifica por tres razones:

1. **Integridad.** El CHECK del perfil y la coherencia de la cadena no se pueden expresar en un JSON.
2. **Corridas duplicadas.** El UNIQUE `(organization_id, chain_id, chain_index)` impide crear dos veces el mismo segmento.
3. **Snapshot del emisor.** Se guarda separado del plan, como evidencia estable.

Se eligió una **tabla 1:1 aditiva**, `platform_dte_mh_test_run_profiles`, en lugar de columnas nuevas en `platform_dte_mh_test_runs`. Con columnas, todas las lecturas `findMany`/`include` actuales fallarían en un CP que todavía no tuviera M4. Con la tabla aparte, las lecturas existentes no cambian.

Las escrituras quedan detrás de `DTE_MH_TEST_RUNS_M4_APPLIED=true`. Con esa variable apagada, los planes v2 se rechazan y los v1 funcionan igual que hoy.

## 3. Contenido de M4

- Tabla `platform_dte_mh_test_run_profiles` con estas columnas:
  - PK `run_id`, con FK a `platform_dte_mh_test_runs` (RESTRICT);
  - `organization_id`, `mh_spec_profile`;
  - `chain_id`, `chain_index`, `chain_total`;
  - `issuer_snapshot` (JSONB NOT NULL);
  - `created_by`, `created_at`.
- Índice `(organization_id, mh_spec_profile)` y UNIQUE `(organization_id, chain_id, chain_index)`.
- CHECK `profile_chk`: `mh_spec_profile ∈ {MH_1_2, MH_2_0}`.
- CHECK `chain_chk`: o las tres columnas de cadena son NULL, o las tres tienen valor con `1 ≤ chain_index ≤ chain_total ≤ 50`. Las tres columnas se comparan con `IS NOT NULL` explícito, para que una comparación con NULL no evalúe como unknown y deje pasar la fila.

El schema es común a todas las bases, así que la tabla existirá vacía en los runtimes. Solo el Control Plane la escribe.

`schema.prisma` gana 1 modelo y 1 relación opcional en `PlatformDteMhTestRun`. Es un cambio aditivo, sin eliminaciones. Se ejecutaron `npx prisma validate` y `npx prisma generate`; no se ejecutó `prisma format`.

## 4. Verificación en base desechable

| Paso | Resultado |
|---|---|
| Bases | `zolvi_mh20_f8_scratch_20261124235158` y `…_shadow_scratch_…`, en `localhost`. Una guarda exige host local y `_scratch_` en el nombre |
| `prisma migrate deploy` | **69/69** aplicadas |
| `prisma migrate status` | "Database schema is up to date!" |
| `migrate diff --from-migrations … --to-schema-datamodel … --exit-code` | exit 0, sin deriva |
| `migrate diff --from-url <scratch> --to-schema-datamodel --exit-code` | exit 0 |
| Fila válida (perfil + cadena 1/2) | OK |
| Segmento de cadena duplicado | 23505 (UNIQUE) |
| Perfil `MH_9` | 23514 |
| `chain_index > chain_total` | 23514 |
| Cadena parcial (solo `chain_id`) | 23514 (ver §5) |
| `run_id` inexistente | 23503 (FK) |
| Limpieza | Ambas bases eliminadas; `pg_database LIKE '%scratch%'` → 0 |

## 5. Incidencia corregida durante la verificación

La primera versión de `chain_chk` aceptaba una cadena parcial: `chain_id` informado con `chain_index` y `chain_total` en NULL. La comparación `BETWEEN` con NULL evaluaba como unknown y el CHECK la dejaba pasar.

Se corrigió con `IS NOT NULL` explícitos. La base desechable se recreó desde cero, se repitieron deploy y diff, y todos los casos dieron el resultado esperado. La migración no se había aplicado en ninguna otra base.

## Impacto en bases de datos y sincronización local/remota

- **Base tocada:** solo las dos bases desechables locales, creadas y eliminadas en esta misma fase.
- **Base no tocada:** `TrustmeDB`, a la que apuntan `DATABASE_URL` y `DIRECT_URL`. No se le aplicó ninguna migración; solo se verificó que existe. Tampoco se consultaron ni modificaron el Control Plane, los runtimes ni MariaDB. No se aplicaron seeds.
- **Alineado:** las migraciones coinciden con `schema.prisma`, sin deriva.
- **Pendiente:**
  - M1, M1b y M2 siguen sin aplicar en las bases runtime.
  - M4 sigue sin aplicar en el Control Plane. Como el schema es común, también llegará vacía a los runtimes.
- **Acción del usuario, cuando lo autorice:**
  1. Aplicar `npx prisma migrate deploy` por base, en el orden M1 → M1b → M2 → M4, siguiendo `05-1-activation-runbook.md`.
  2. Verificar con `npx prisma migrate status`.
  3. Fijar `DTE_MH_TEST_RUNS_M4_APPLIED=true` **solo** en el Control Plane y solo después de aplicar M4 allí.
  4. En local: `npx prisma migrate deploy` sobre TrustmeDB.

  No hace falta un script de sincronización nuevo.
