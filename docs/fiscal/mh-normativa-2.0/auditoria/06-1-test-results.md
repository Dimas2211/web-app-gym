# MH 2.0 — Fase 6.1 — Resultados de pruebas

Fecha: 2026-11-24. Vitest 3.2.4. Sin red, sin bases reales, sin MariaDB real y sin firmador real.

## 1. Suites

| Suite | Resultado |
|---|---|
| Alcance fiscal (`commerce/dte`, `platform/dte-onboarding`, `commerce/purchases`, `commerce/sales`, `prisma`) | **1532 pruebas: 1506 pasan, 0 fallan, 26 omitidas** (las mismas 26 de Fase 6: 20 de integración que requieren `MH20_SCRATCH_DATABASE_URL` + 6 previas) |
| Golden MH 1.2 (`mh12-golden.test.ts`) | 8/8 (incluido en la suite, sin cambios de fixture) |
| Certificación interna | 77/77 (incluido en la suite) |
| Nuevas 6.1 (`__golden__/mh20-phase61.test.ts`) | 17/17 |
| `npx tsc --noEmit` | exit 0 |

1532 = 1510 (Fase 6) + 17 (6.1) + 5 netas en pruebas existentes:

| Archivo | Neto |
|---|---|
| `mh20-spec` | +1 |
| `dte-territory-ambiguity` | +1 |
| `mh20-fixtures` | +1 |
| `mh20-phase6` | +2 |

## 2. Cobertura 6.1

| Ítem | Prueba | Resultado |
|---|---|---|
| Cabañas 2.0: 9 distritos, Este → 10 y Oeste → 11, marca REVIEW; V1.2 intacta | `dte-territory-ambiguity.mh20.test.ts`, `mh20-spec.test.ts` | PASS |
| Jerarquía dep/mun/distrito en R20-TERR-01 (09/10/01 inválido; 09/10/06 y 09/11/01 válidos) | `mh20-fixtures.test.ts` | PASS |
| FEX con MH_2_0 usa CAT-013 2.0 (municipio 10) y MH_1_2 sigue con 11 | `mh20-fex-v3.test.ts` | PASS |
| Dry-run: Cabañas en REVIEW, 0 AMBIGUOUS sobre 262 filas | `mh20-territory-dry-run.test.ts` | PASS |
| CAT-033 `TA-1` (longitud ≤ 4); CAT-030 1–6 (rechaza 0, 7, "1" y 11) | `dte-catalog-items-mh20.data.test.ts`, `dte-territory-ambiguity.mh20.test.ts` | PASS |
| Fecha del evento de invalidación (misma fecha / ≤ 3 meses / anterior / fuera de ventana); builder CCF y FE | `mh20-phase6.test.ts` | PASS |
| FSE 14 invalidable solo con 2.0; v3 válida contra el schema oficial con el sujeto excluido | `mh20-phase6.test.ts` | PASS |
| Representación: FE v2 / FE v1 histórica / transitoria / sin firma / campos faltantes / CCF / NC / FSE / FEX / INV v3 / Retorno / PDF `%PDF-` sin JWS / URL QR | `mh20-phase61.test.ts` | PASS |
| Entrega: generado ≠ disponible ≠ entregado | `mh20-phase61.test.ts` | PASS |
| Reintentos frente a contingencia (`RETRIES_EXHAUSTED`, elegibilidad normativa) | `mh20-phase61.test.ts`, `mh20-phase6.test.ts` | PASS |
| Invalidación de Retorno: firma, scope, transmisión (NO_ADAPTER, PROD, idempotencia, reserva SENT, respuestas) | `mh20-phase61.test.ts` | PASS |

## 3. Cambios de expectativa justificados

Ninguno oculta una regresión. Cada uno aplica una aclaración documental verificada.

| Prueba | Antes | Ahora | Fuente |
|---|---|---|---|
| `dte-territory-ambiguity` "CAT-INC-001 Cabañas" | error con MH_2_0 | null y proyección 10/11 | consultas §13 |
| `mh20-spec` "solo Cabañas falla cerrado" | 09 falla | todas las filas proyectan; `blockCabanas` explícito sigue fallando | §13 |
| `mh20-fex-v3` Cabañas MH_2_0 | error | municipio 10 (1.2: 11) | §13 |
| `mh20-fixtures` Cabañas | R20-TERR-01 por disputa | R20-TERR-01 por jerarquía, más un caso válido | §13 |
| `mh20-territory-dry-run` (3 pruebas) | AMBIGUOUS | REVIEW | §13 |
| `dte-catalog-items-mh20.data` y `dte-territory-ambiguity` CAT-033 | `" TA-1"` | `"TA-1"` | §15 |
| `dte-catalog-version.integration` (omitida sin BD) | `" TA-1"` | `"TA-1"` | §15 |
| `mh20-phase6` plazos | advertencia INC-006 | advertencia INC-004, sin INC-006 | §8 |
| `mh20-phase6` invalidabilidad | 14 excluida | 14 con MH_2_0; MH_1_2 sin cambios | §7 / Cuadro 6 |
| `mh20-phase6` retransmisión | `CONTINGENCY` | `RETRIES_EXHAUSTED` | prompt §7 |
| `dte-spec-profile-admin.integration` (omitida sin BD) | `TERRITORY_INVALID` por `CAT_INC_001_CABANAS` | no se rechaza por territorio | §13 |

## 4. Pruebas omitidas

Siguen omitidas las mismas 26 de Fase 6.

`dte-spec-profile-admin.integration.test.ts` (solo corre con `MH20_SCRATCH_DATABASE_URL`) se actualizó: Cabañas ya no debe rechazarse con `TERRITORY_INVALID`. Su ejecución en base desechable queda registrada en `08-test-results.md`.
