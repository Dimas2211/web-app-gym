# MH 2.0 — Fase 8 — Resultados de pruebas (consolidado §24)

Fecha: 2026-11-25. Vitest 3.2.4. Las pruebas corrieron sin red, sin Hacienda, sin MariaDB real, sin firmador real y sin bases reales. Las únicas bases usadas fueron las desechables de M4.

## 1. Suites

| Suite | Resultado |
|---|---|
| Alcance fiscal: `commerce/dte`, `platform/dte-onboarding`, `commerce/purchases`, `commerce/sales`, `prisma` | **1580 pruebas: 1554 pasan, 0 fallan, 26 omitidas** |
| Alcance amplio: `commerce`, `platform`, `lib`, `prisma` | 2573 pruebas: 2531 pasan, 42 omitidas, 1 archivo fallido (ver §3) |
| Golden MH 1.2 (`mh12-golden.test.ts`) | **8/8**, sin cambios de fixture |
| Certificación interna | **77/77** |
| `npx tsc --noEmit` | exit 0 |
| ESLint, 132 archivos modificados o nuevos | **0 errores**, 89 advertencias (`no-explicit-any` en mocks de test) |
| `npm run build` | **PASS** (exit 0) |
| Migraciones en base desechable | 69/69, sin deriva, CHECK/UNIQUE/FK verificados (`08-migration-status.md`) |

Evolución del alcance fiscal:

| Corte | Pruebas |
|---|---|
| Línea base del prompt | 1510 |
| Fase 6.1 | 1532 |
| Fase 7 | 1556 (+20 phase7, +4 COR-01) |
| Fase 8 | **1580** (+24 `mh20-onboarding.test.ts`) |

Ninguna expectativa histórica se reemplazó para ocultar una regresión. Las 9 expectativas que cambiaron en 6.1 están justificadas en `06-1-test-results.md` §3. En las fases 7 y 8 no cambió ninguna.

## 2. Cobertura por punto de §24

| Punto | Pruebas | Resultado |
|---|---|---|
| Builders 2.0 / catálogos versionados | `mh20-phase6`, `mh20-fixtures`, `dte-catalog-version.integration` | PASS |
| Territorio / Cabañas | `dte-territory-ambiguity.mh20`, `mh20-fex-v3`, phase7 (vista previa) | PASS |
| Representaciones / entrega | `mh20-phase61` | PASS |
| Retorno y su invalidación | `mh20-phase6`, `mh20-phase61` (firma, transmisión con adaptador mock e idempotencia) | PASS |
| Inventario / caja / ventas / compras | phase7 (efectos del Retorno), suites de `inventory`, `cash`, `sales` y `purchases` | PASS |
| Reportes | phase7 (fecha y periodo fiscal frente a timestamps), `sales-report-history` | PASS |
| Idempotencia | phase7 (efectos), phase61 (transmisión de la invalidación del Retorno) | PASS |
| Onboarding | `mh20-onboarding`: readiness, preset, cadena, planner v2, dry-run 2.0 real | PASS |
| Aislamiento TEST/PROD | `mariadb-certification-exclusion`, `mh-test-runs.pg` (*), guarda MH_2_0 del motor | PASS |
| Corridas encadenadas | `mh20-onboarding`: totales, contigüidad, sin duplicados, NC con su CCF | PASS |
| Permisos / auditoría | `mh-test-run.runtime-port`, `engine` (existentes, intactos) | PASS |
| Mocks de MariaDB | `mariadb-certification-exclusion` | PASS |
| Migraciones desechables | ver `08-migration-status.md` | PASS |
| Correlativos (COR-01) | `dte-correlative.cor01-characterization` | PASS (caracterización) |

(*) Requiere base PostgreSQL desechable. Es una de las omisiones listadas en §3.

## 3. Omisiones y fallos registrados

- **26 omitidas en el alcance fiscal**, las mismas desde Fase 6:
  - 20 de integración que requieren `MH20_SCRATCH_DATABASE_URL`;
  - 6 previas, de integración PostgreSQL o MH real controladas por variables de entorno.
- **16 omitidas adicionales en el alcance amplio:** integración condicionada por entorno, previas a MH 2.0.
- **1 archivo fallido:** `src/modules/commerce/shared/cat-022-identification-types.test.ts`.
  - Error: `Cannot find module …/next/server imported from …/next-auth/lib/env.js`.
  - Es el **fallo CAT-022 preexistente** registrado en la línea base, por la resolución de módulos en Vitest.
  - No se corrigió porque está prohibido modificar Vitest de forma global o sus dependencias.

Ninguna guarda productiva se desactivó.
