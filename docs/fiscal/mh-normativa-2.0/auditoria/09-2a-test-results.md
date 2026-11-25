# MH 2.0 — Fase 9.2A: resultados de pruebas

- **Fecha:** 2026-11-25. Árbol consolidado: merge `9f8e363` + M5.
- **Resultado:** **0 fallos y 0 regresiones del merge.** CAT-022 sigue fallando igual (preexistente, no tocado).

## 1. Resumen

| Bloque | Resultado | Base 9.1 |
|---|---|---|
| Suite amplia (`commerce`, `platform`, `app/api`) | 2765 pruebas: **2679 pasan, 0 fallan**, 86 omitidas | 2609 / 0 / 79 |
| Suite completa del repo (`vitest run`) | 4382 pruebas: **3707 pasan, 0 fallan**, 675 omitidas (integración Gym y PG sin URL desechable) | — |
| PostgreSQL fiscal desechable | **70/70**: M4+M5 35, COR-01 9, `mh-test-runs.pg` 6, spec-profile-admin 11, catalog-version 9 | 63/63 |
| · M5 nuevas | **7/7** | — |
| Casos SQL de backfill COR-01 | **PASS** (`COR01_ASSERT_PASS`; 8 casos: 4 asignados, 3 ambiguos y 1 sin número) | PASS |
| COR-01 unitarias (characterization + lifecycle) | 53/53 | 53/53 |
| Golden MH 1.2 | 8/8 | 8/8 |
| Goldens MH 2.0 | 134/134 | — |
| Certificación interna | 77/77 | 77/77 |
| Exclusión MariaDB | 8/8 | 8/8 |
| Onboarding MH 2.0 (5 suites) | 90/90 | 90/90 |
| Gym customer links (main: 5 suites) | 50/50; SQL: FK compuestas por tenant y RLS activo, cruce rechazado | — |
| Otros cambios de main (membresías, fechas, códigos maestros, import DTE, booking) | 86/86 | — |
| `npx tsc --noEmit` | **0 errores** | 0 |
| `npm run lint` | **0 errores**, 155 warnings preexistentes | 0 / 155 |
| `npm run build` | **OK** | OK |

**Cuadre de la suite amplia:**

- pasan: 2679 = 2609 + 70 pruebas incorporadas desde main en `commerce` y `app/api`;
- omitidas: 86 = 79 + 7 de M5, que se omiten sin URL desechable y pasan en su propia ejecución.

## 2. Pruebas nuevas de M5 (`mh20-m4-run-profiles.pg.test.ts`)

| Caso | Resultado |
|---|---|
| SQL: perfil de la organización B sobre una corrida de A | rechazado (`…_run_id_organization_id_fkey`) |
| Prisma (create no comprobado) con el mismo cruce | rechazado |
| `UPDATE` del `organization_id` del perfil hacia otra organización | rechazado |
| `UPDATE` del `organization_id` de una corrida con perfil | rechazado (ON UPDATE RESTRICT); ambas filas intactas |
| Corrida histórica sin perfil | no afectada |
| Catálogo | FK compuesta y UNIQUE `(id, organization_id)` presentes; FK simple `run_id`, UNIQUE de segmento y CHECK de perfil y cadena conservados |
| Fila incoherente preexistente | M5 no se puede aplicar: la FK valida filas existentes, la transacción se revierte |

Las 28 pruebas de M4 siguen pasando sin cambios.

## 3. Bases desechables

| Base | Uso |
|---|---|
| `zolvi_scratch_tpl_9_2a` | Plantilla: 72/72 migraciones, sin drift, más el emisor `ISS-T` |
| `zolvi_scratch_pg{1..5}_9_2a` | Clon por suite PG |
| `zolvi_scratch_sql_9_2a` | Casos SQL COR-01 (70 migraciones previas, luego fixture, M-COR-01 y assert) |
| `zolvi_scratch_gcl_9_2a` | Comprobación SQL de `gym_customer_links` |
| `zolvi_scratch_restore_9_2a` | Ensayo TrustmeDB (§4) |
| `zolvi_scratch_m5_9_2a_shadow` | Shadow de `migrate diff` |

**Todas eliminadas** (consulta final de `pg_database`: 0 bases `scratch`). Ninguna prueba usó TrustmeDB ni bases remotas.

## 4. Ensayo de TrustmeDB local

| Control | Resultado |
|---|---|
| Respaldo nuevo | `C:\Users\rodri\Documents\zolvi-backups\trustmedb-pre-fase9-2a-20261125\TrustmeDB-20261125-pre-fase9-2a.dump`, 903.871 bytes, SHA-256 `e82aa52a86f7ea9d4382d2e0e49b16936dbee75830072082a96ad25e85a06d8e` (`pg_dump` en sesión de solo lectura) |
| Restauración | exit 0; huella restaurada **idéntica** a la base viva |
| Pendientes | exactamente `gym_customer_links` y M5 |
| `migrate deploy` | 2/2; `migrate status` up to date; `migrate diff` vacío |
| Documentos | 72; huella md5 de número, código, JSON, firma, sello, estado y `fiscal_year` **idéntica** (`b30799e5…`) |
| COR-01 | 72/72 `fiscal_year = 2026`, 0 NULL |
| `dte_correlatives` | 7 filas, hash idéntico (`9ce00558…`) |
| `customers` / `clients` | idénticos; 0 duplicados `(id, tenant_id)` |
| Conteos (103 tablas) | solo cambian `_prisma_migrations` (70 → 72) y `gym_customer_links`, nueva y vacía |
| Checksums registrados | `gym_customer_links` `f24e6a20…` (= CP y runtime); M5 `cf375e12…` |

**TrustmeDB no se modificó:** sigue en 70/72. Ambas migraciones quedan pendientes de autorización.

## 5. CAT-022 (preexistente)

`src/modules/commerce/shared/cat-022-identification-types.test.ts` falla al cargar: `Cannot find module …/node_modules/next/server` desde `next-auth/lib/env.js`. Es el mismo fallo de 9.0 y 9.1; no se modificó.

## 6. Archivos no versionados

La huella SHA-256 de los 310 archivos no versionados es idéntica antes y después del merge y de los commits.
