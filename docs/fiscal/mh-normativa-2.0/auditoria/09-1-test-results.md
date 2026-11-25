# MH 2.0 — Fase 9.1: resultados de pruebas

- **Fecha:** 2026-11-25. Verificación consolidada sobre el árbol final, idéntico en código al HEAD de los commits de la fase.
- **Resultado:** 0 fallos nuevos. CAT-022 sigue fallando igual que antes (preexistente, no tocado).

## 1. Resumen

| Bloque | Resultado | Base 9.0 |
|---|---|---|
| Suite amplia (`src/modules/commerce`, `src/modules/platform`, `src/app/api`) | 252 archivos: 245 pasan, 6 omitidos, 1 falla (CAT-022). 2688 pruebas: **2609 pasan, 0 fallan**, 79 omitidas | 2575 / 0 / 51 |
| COR-01 ciclo de vida (nuevo, `dte-fiscal-year-lifecycle.test.ts`) | **34/34** | — |
| COR-01 unitarias (`cor01-characterization`) | 19/19 | 19/19 |
| PostgreSQL desechable, total | **63/63** | 35/35 |
| · M4 nuevas (`mh20-m4-run-profiles.pg`) | **28/28** | — |
| · COR-01 (`dte-correlative.cor01.pg`) | 9/9 | 9/9 |
| · `mh-test-runs.pg` | 6/6 | 6/6 |
| · `dte-spec-profile-admin.integration` | 11/11 | 11/11 |
| · `dte-catalog-version.integration` | 9/9 | 9/9 |
| Casos SQL de backfill COR-01 (fixture + migración + aserciones) | **PASS** (8 casos; 76 asignados, 3 ambiguos esperados) | 8/8 |
| Golden MH 1.2 | 8/8 | 8/8 |
| Certificación interna | 77/77 | 77/77 |
| Exclusión MariaDB | 8/8 | 8/8 |
| Onboarding MH 2.0 (5 suites) | 90/90 | 90/90 |
| `npx tsc --noEmit` | **0 errores** | 0 |
| `npm run lint` | **0 errores**, 155 warnings preexistentes fuera del alcance | 0 errores |
| `npm run build` | **OK** (exit 0) | OK |

Cuadre: 2609 = 2575 + 34 nuevas. Omitidas: 79 = 51 + 28 PG M4, que se omiten sin URL desechable y pasan en su propia ejecución.

## 2. Pruebas nuevas

### COR-01: distinción por etapa (34)

- Clasificación: borrador, generado, firmado pendiente, incierto (`SENT` o intento previo), aceptado y terminal.
- Política de cruce de año:
  - solo el borrador queda bloqueado por `DTE_FISCAL_YEAR_MISMATCH`;
  - generado y firmado continúan con su número, código, JSON y firma;
  - el incierto exige conciliación y nunca se cancela ni reemite;
  - el aceptado es inmutable.
- Estructurales:
  - firma, transmisión, conciliación, reapertura, retransmisión y entrega MariaDB **no** invocan la guarda;
  - FE/CCF/NC aplican la guarda después de exigir `PENDING_GENERATION`;
  - FEX/FSE la aplican antes de calcular `fecEmi`, y su pipeline nunca regenera `SIGNED`/`SENT`/`ACCEPTED`.
- Cancelaciones:
  - `cancelUnsignedMhTestDocument` excluye `SIGNED`/`SENT`/`ACCEPTED`;
  - la anulación de venta solo cancela `PENDING_GENERATION` intactos.

### M4 en PostgreSQL (28)

| Grupo | Casos |
|---|---|
| CHECK de perfil | acepta MH_1_2 y MH_2_0; rechaza `MH_3_0`, minúsculas, vacío y espacio final |
| Cadena incompleta | 4 combinaciones parciales de `chain_id`/`chain_index`/`chain_total` → `chain_chk` |
| Rangos | índice 0, índice mayor que total, total 0, total 51 e índice negativo rechazados; 1/1 y 50/50 aceptados |
| UNIQUE | segmento duplicado rechazado (el siguiente índice se acepta); un perfil por corrida (PK); varias corridas sin cadena conviven |
| Integridad referencial | `run_id` inexistente rechazado; `DELETE` de corrida con perfil bloqueado (RESTRICT); `issuer_snapshot` NOT NULL |
| Aislamiento | mismo segmento en dos organizaciones; `getRunProfile` por corrida; una corrida activa por organización no bloquea a otra; `createRun` escribe el mismo `organization_id` en corrida y perfil |
| Repositorio | duplicado → `CHAIN_SEGMENT_EXISTS` con rollback; cadena incompleta → error con rollback (sin corrida huérfana) |

**Residual documentado:** la base no exige que `profile.organization_id` coincida con `run.organization_id` (no hay FK compuesta). Lo garantiza `createRun`, que escribe el mismo valor en ambas filas. Endurecerlo en la base requiere una migración nueva con autorización.

## 3. Seguridad de las pruebas destructivas

| Suite | Guarda |
|---|---|
| `dte-correlative.cor01.pg`, `dte-spec-profile-admin.integration`, `dte-catalog-version.integration`, `mh20-m4-run-profiles.pg` | `MH20_SCRATCH_DATABASE_URL` en localhost y con `_scratch_` en el nombre de la base |
| `mh-test-runs.pg` | **Endurecida en 9.1**: antes bastaba con definir `MH_TEST_PG_URL`; ahora exige localhost y una base `_scratch_` o la histórica `mig_test` |
| SQL de backfill COR-01 | `RAISE EXCEPTION` si la base no es `_scratch_` |

- Ejecución: todas las suites PG corrieron sobre `zolvi_scratch_pg_9_1` (70 migraciones, emisor `ISS-T` sembrado a mano) y los casos SQL sobre `zolvi_scratch_sql_9_1`. Ambas bases se eliminaron al terminar.
- La suite amplia corrió **sin** URLs desechables.
- Ninguna prueba usó TrustmeDB ni una base remota.

## 4. CAT-022 (preexistente)

`src/modules/commerce/shared/cat-022-identification-types.test.ts` falla al cargar: `Cannot find module …/node_modules/next/server imported from …/next-auth/lib/env.js`. Es el mismo fallo que en 9.0. No se modificó.
