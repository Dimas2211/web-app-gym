# MH 2.0, Fase 7: resultados de pruebas

Fecha: 2026-11-24. Vitest 3.2.4. Sin red, bases reales, MariaDB ni firmador.

## 1. Suites

| Suite | Resultado |
|---|---|
| Alcance fiscal (`commerce/dte`, `platform/dte-onboarding`, `commerce/purchases`, `commerce/sales`, `prisma`) | **1556 pruebas: 1530 pasan, 0 fallan, 26 omitidas** (las mismas 26 de Fase 6.1) |
| Alcance ampliado (fiscal + `inventory`, `cash`, `reports`, `customers`, `suppliers`) | 1705 pruebas: 1679 pasan, 0 fallan, 26 omitidas |
| Golden MH 1.2 | 8/8, sin cambios de fixture |
| Certificación interna | 77/77 |
| `npx tsc --noEmit` | exit 0 |

1556 = 1532 (Fase 6.1) + 20 (`mh20-phase7.test.ts`) + 4 (`dte-correlative.cor01-characterization.test.ts`). No se modificó ninguna expectativa existente.

## 2. Cobertura de Fase 7

| Ítem | Pruebas |
|---|---|
| Retorno no aceptado o sin sello → sin efectos | phase7 |
| Retorno con invalidación SENT → rechazo | phase7 |
| Scope tenant/location | phase7 |
| TEST sin efectos salvo opt-in | phase7 |
| Sin solicitud explícita → ni inventario ni caja | phase7 |
| Venta: `RETURN_IN` solo para stockables, `REFUND_OUT`; segunda ejecución sin duplicar | phase7 |
| FSE: `RETURN_OUT` + `MANUAL_IN`; línea por `dte_line_number` con fallback a idx+1 | phase7 |
| Reembolso > total → rechazo previo a cualquier efecto | phase7 |
| Fallo parcial → PARTIAL; la re-ejecución reconcilia solo lo faltante | phase7 |
| Sin ProductLocation → FAILED; CxC/CxP → NOT_SUPPORTED | phase7 |
| Vista previa territorial: vacía, incompleta, inexistente, Cabañas (cambio frente a 1.2), dirección ordinaria | phase7 |
| Advertencias de códigos AT | phase7 |
| Trazabilidad del Retorno: periodo fiscal desde `fecEmi` frente a timestamps; no ACCEPTED fuera de los acumulados; scope | phase7 |
| Guarda previa a la reserva: 1.2 nunca bloquea; 2.0 exige estructura AT; con el interruptor OFF no consulta la BD | phase7 |
| COR-01: la secuencia continúa al cambiar de año; año según la zona del proceso; año fiscal SV; backfill desde `fecEmi` | cor01-characterization |

## 3. Omitidas

Son las mismas 26 de la fase anterior:

- 20 de integración, que requieren `MH20_SCRATCH_DATABASE_URL`;
- 6 previas.

Fase 7 no añadió ninguna omisión.
