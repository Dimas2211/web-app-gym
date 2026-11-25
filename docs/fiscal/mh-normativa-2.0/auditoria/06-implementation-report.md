# MH 2.0 — Fase 6 — Informe de implementación

**Eventos fiscales e integraciones externas**

| Dato | Valor |
|---|---|
| Fecha | 2026-11-24 |
| Rama | `feat/mh-normativa-2.0` |
| HEAD | `b682b70` |
| Commit | Ninguno (sin autorización) |
| Interruptor `DTE_MH20_PROFILE_ENABLED` | **OFF** (sin cambios) |
| Veredicto | **FASE_6_PARTIAL** |

Se preservó el working tree de Fases 5 y 5.1. No se creó ninguna rama ni se usaron `reset`, `clean` o `stash`. El worktree temporal de la sección 13 se creó en el scratchpad y ya se eliminó.

## Resumen por bloque

| Bloque | Estado | Tareas |
|---|---|---|
| 6A Invalidación v3 | PASS | IMP20-018 IMPLEMENTED, IMP20-005 PARTIAL |
| 6B Contingencia v4 | PARTIAL (INC-005) | IMP20-019 PARTIAL |
| 6C Evento de Retorno | PARTIAL (MT-GAP-001) | IMP20-022 PARTIAL, IMP20-024 PARTIAL |
| 6D Operaciones Especiales | PARTIAL (autorización AT) | IMP20-023 PARTIAL |
| 6E Integración MH | PASS | IMP20-025 IMPLEMENTED |
| 6F Entrega al receptor | PARTIAL | IMP20-021 PARTIAL |
| 6G MariaDB | PASS (mocks) | IMP20-026 IMPLEMENTED |
| 6H Importación / FSE de compras | PASS | IMP20-027 IMPLEMENTED, IMP20-029 IMPLEMENTED |

Conteo consolidado de las 39 tareas:

| Estado | Fase 5.1 | Fase 6 |
|---|---|---|
| IMPLEMENTED | 14 | **19** |
| PARTIAL | 9 | 13 |
| DEFERRED | 9 | 2 |
| NOT_STARTED | 7 | 5 |

El detalle y el historial están en `06-task-status.json`.

## 6A — Invalidación v3

- `services/build-invalidation-event-json.v3.ts`:
  - `identificacion` con versión 3, `fecEmi`/`horEmi` y `fusion` null;
  - `emisor` sin `tipoEstablecimiento` y con `codEstableMH`/`codPuntoVentaMH` obligatorios con estructura AT (MH20-006);
  - `documento` sin `montoIva`;
  - eventos 17/18 con `numeroControl` null y solo `tipoAnulacion` 2 (MH20-046).
- AJV contra el schema v3 oficial.
- `build-invalidation-event-json.service.ts` despacha por `params.profile`. **La rama v2 no se tocó.**
- `create-invalidation-event.service.ts`, en el paso 6c:
  - resuelve el perfil (`INV`);
  - para MH_2_0 comprueba invalidabilidad por tipo y plazo, avisa MH20-094 si el DTE es 1.2 y bloquea con MH20-049 si hay Retornos vigentes;
  - persiste `mh_spec_profile`.
- `spec/dte-invalidation-deadlines.ts` documenta las fuentes en conflicto. `production: "UNSET"` hace que PRODUCTION falle cerrado: **no se inventan plazos**. TEST solo advierte (PROVISIONAL).
- Registro: INV MH_2_0 pasa de `blocked` a `pendingConfirmation` (INC-004/006 siguen abiertas).

## 6B — Contingencia v4

- `build-contingency-event-json.v4.ts`:
  - `codPuntoVentaMH` se toma siempre de `cod_punto_venta_mh`;
  - `detalleDTE` admite el tipo 18;
  - conserva las reglas retiradas del schema (D8).
- Validado contra v4 oficial.
- `persist-contingency-event-json.service.ts` resuelve el perfil: MH_2_0 queda bloqueado por el registro.
- `transmit-contingency-event.service.ts` rechaza cualquier evento v4.
- v3 intacta. R20-PEND-01 se mantiene.

## 6C — Evento de Retorno

- **M2:** 3 tablas aditivas (ver `06-migration-status.md`). Se eligió una tabla propia para la invalidación de Retorno en lugar de relajar la nulabilidad.
- **Builder** `build-return-event-json.service.ts` (fe-eret-v1), reglas R20-RET-01..09:
  - tipos elegibles 01/11/14 con sello;
  - un solo tipo por evento, ≤ 50 DTE sin repetir y ≤ 2000 ítems;
  - mismo emisor, receptor y tercero;
  - campos FEX iguales;
  - fecha ≥ `fecEmi`;
  - códigos AT;
  - exceso por línea;
  - bloqueo cuando hay retenciones, seguro o flete sin regla de prorrateo.
- **Saldo elegible** (`utils/dte-return-balance.ts` y `dte-return-event.guards.ts`):
  - acumula los Retornos vigentes, excluyendo los que tienen invalidación ACCEPTED;
  - `createReturnEvent` bloquea las filas de los DTE (`SELECT … FOR UPDATE` acotado a tenant/location) antes de calcular, para impedir retornos que superen el saldo en concurrencia.
- El **JSON firmado original nunca se modifica** y el Retorno **no es una invalidación**: el DTE sigue vigente.
- **Firma** (`sign-return-event.service.ts`): reutiliza el firmador existente y revalida AJV y el perfil.
- **Transmisión:** bloqueo explícito MT-GAP-001 (interfaz, adaptador bloqueado y ciclo de respuesta simulado). Ver `06-external-integration-contracts.md`.
- **Invalidación de Retorno** (`create-return-invalidation-event.service.ts`): DRAFT v3. La firma y la transmisión quedan pendientes.
- **Sin movimientos comerciales** (Fase 7).

## 6D — Operaciones Especiales

- `build-special-ops-event-json.service.ts` es un builder puro.
- Exige una autorización AT verificada y vigente, aportada por el llamador; si no, devuelve `OE_NOT_AUTHORIZED`.
- Validado contra fe-eop-v1 oficial.
- Sin modelo de autorización, **sin M3** y sin persistencia. El registro mantiene `blocked` + `transmissionBlocked`. Estado: PARTIAL.

## 6E — Integración MH

- `spec/mh-transmission-policy.ts` y `services/mh-retransmission-guard.ts` implementan:
  - la clasificación aceptado / rechazo / no enviado / incierto;
  - la consulta y conciliación antes de reenviar;
  - el máximo de 2 reenvíos y luego contingencia;
  - la reutilización del mismo código de generación y número de control.
- Se integró en `transmit-dte-document.service.ts` **solo para MH_2_0**.
- Timeout (8 s) y caché de token (50 min) verificados como conformes.

## 6F — Entrega al receptor

- Archivo DTE 2.0 (`firmaElectronica` + `selloRecibido`, `<codigoGeneracion>.json`) con validación de sello y firma, para documentos, invalidaciones v3 y Retornos.
- Nueva variante `archive` en la ruta JSON existente. La variante `fiscal` y la `external` no cambian.
- Se mantienen separadas las tres representaciones: fiscal, receptor y MariaDB.
- La representación gráfica queda pendiente porque no se localizó.

## 6G — MariaDB

- Se añadió la capacidad `acceptsMh20` por destino y el código `DELIVERY_BLOCKED_CONTRACT` en la entrega de DTE (ledger FAILED_RETRYABLE) y de invalidación.
- El contrato del proveedor no cambia.
- MH 1.2 queda idéntico.
- No hay cola paralela y un fallo nunca provoca retransmisión fiscal.

## 6H — Compras

- **IMP20-027:** inspección 1.2/2.0 de los DTE recibidos, solo con advertencias.
- **IMP20-029:** guardia de retención del 1 % en FSE 2.0 antes del correlativo. El servicio FSE 2.0 se localizó en `generate-fse-json.service.ts` (bloqueo en el builder desde Fase 5) y en `dte-outgoing.service.ts` (`createPendingDteForPurchase`, Fase 6).

## Decisiones registradas

1. Tabla `dte_return_invalidation_events` en lugar de `dte_document_id` nullable.
2. La guardia de retransmisión se aplica solo a MH_2_0.
3. FSE 14 no es invalidable en 2.0 hasta una decisión de producto.
4. Un FEX v3 sin perfil persistido (AMBIGUOUS) se trata como 1.2 para el Archivo DTE y MariaDB.
5. Cambio de expectativa justificado: el test "INV/CONT/17/18 blocked" de `spec/mh20-spec.test.ts` se sustituyó por tres pruebas. INV y 18 pasan a `pendingConfirmation` (TEST con advertencia, PRODUCTION fail-closed). CONT y 17 siguen `blocked`. Se añadió la transmisión bloqueada.

## Qué no se tocó

- No se transmitió a MH.
- No se consultaron ni modificaron bases productivas o remotas.
- No hubo MariaDB real.
- No se tocaron certificados, credenciales, firmadores ni infraestructura.
- No se alteraron correlativos.
- No se regeneraron históricos.
- No se modificaron M1 ni M1b, ni la configuración de Vitest o las dependencias.
- No hubo commit, push ni deploy.
- No se implementaron cambios de Fase 7 (comercial) ni de Fase 8 (onboarding).

## Archivos

**Nuevos (20 de código):**

- `spec/`: `validate-mh-event-json.ts`, `dte-invalidation-deadlines.ts`, `mh-transmission-policy.ts`
- `services/`: `build-invalidation-event-json.v3.ts`, `build-contingency-event-json.v4.ts`, `build-return-event-json.service.ts`, `dte-return-event.guards.ts`, `create-return-event.service.ts`, `sign-return-event.service.ts`, `transmit-return-event.service.ts`, `create-return-invalidation-event.service.ts`, `mh-retransmission-guard.ts`, `build-dte-archive-file.service.ts`, `build-special-ops-event-json.service.ts`
- `adapters/dte-return-transmission.adapter.ts`
- `types/dte-return-event-json.types.ts`
- `utils/`: `dte-return-balance.ts`, `external-delivery-mh20-compat.ts`
- `outgoing/queries/get-dte-outgoing-archive-file.ts`
- `purchases/utils/inspect-received-dte-spec.ts`
- Migración `20261124020000_mh20_return_events`
- Pruebas: `__golden__/mh20-phase6.test.ts`, `mh20-phase6-services.test.ts`

**Modificados:**

- `prisma/schema.prisma`
- `spec/dte-spec-registry.ts`, `spec/mh20-spec.test.ts`
- Invalidación: `types/dte-invalidation-event-json.types.ts`, `build-invalidation-event-json.service.ts`, `create-invalidation-event.service.ts`
- Contingencia: `types/dte-contingency-event-json.types.ts`, `build-contingency-event-json.service.ts`, `persist-contingency-event-json.service.ts`, `transmit-contingency-event.service.ts`
- Transmisión y compras: `transmit-dte-document.service.ts`, `dte-outgoing.service.ts`
- Entrega externa: `types/external-dte-delivery.types.ts`, `deliver-dte-to-external-db.service.ts`, `deliver-invalidation-to-external-db.service.ts`
- Ruta: `app/api/dte/outgoing/[id]/json/route.ts`
- Importación: `purchases/services/purchase-dte-import.service.ts`

Las pruebas están en `06-test-results.md`. Las migraciones en `06-migration-status.md`. Los bloqueos en `06-pending-activation-blockers.md`.
