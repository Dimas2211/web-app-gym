# FASE IV-C — Operación manual + inspector de metering DTE

Hace operable y visible el sistema ya certificado en FASE IV-A/IV-B
(`fiscal.dte.monthly_issued` + `reconcileDteWithMh`). Sin scheduler,
sin cron, sin polling automático, sin cuotas finitas nuevas — todo
manual y read-only salvo la única acción mutativa explícita (ver abajo).

## 1. Propósito

- Botón manual "Consultar estado MH" sobre un DTE incierto (`dte_status=SIGNED`).
- Inspector read-only de consumo mensual, PENDING y historial de metering.
- Historial de consultas MH (`DteTransmissionLog` `operation_type=QUERY`) por documento.

## 2. Acción manual — `reconcileDteWithMhAction`

`src/modules/commerce/dte/actions/reconcile-dte-with-mh.action.ts`. Input
del navegador: **únicamente** `dteDocumentId`. tenantId, locationId,
issuerConfigId, environment, NIT y generationCode se resuelven siempre
server-side (los últimos tres, dentro de `reconcileDteWithMh` mismo).

Envuelve `reconcileDteWithMh` (FASE IV-B, certificado real contra MH
TEST). Es **mutativa** aunque el nombre visual sea "consultar": puede
llamar a MH, crear un `DteTransmissionLog(QUERY)`, actualizar
`dte_status` y resolver el ledger de metering.

Flujo: `requireAdmin` → `isRuntimeReadOnlyActive()` (bloqueo total,
ANTES de cualquier posible llamada MH o write) → `resolveCommercialEnforcementContext`
+ `assertOrganizationModule("fiscal.dte")` → `reconcileDteWithMh({ ..., runtimeDb: prisma })`.

**Decisión de diseño explícita**: a diferencia de otras acciones de la
misma superficie DTE outgoing (`deliver-dte-to-external-db.action.ts`,
que usa `requireRuntimeDteWriteAccess` y permite ciertos writes durante
Support Session con confirmación), esta acción usa el bloqueo *total*
(`isRuntimeReadOnlyActive`) — el mismo patrón que `switch-dte-environment.action.ts`
y `align-dte-correlative-session.action.ts`. Es una elección deliberada
de esta fase: Support Session nunca debe poder llamar a MH ni resolver
ledger, sin excepción.

### Mapping de resultados (sin secretos)

| `reconcileDteWithMh` | Copy UI |
|---|---|
| `RESOLVED / ACCEPTED` | "MH confirmó que el DTE fue procesado correctamente." |
| `RESOLVED / OBSERVED` | "MH confirmó el DTE con observaciones." |
| `REPAIRED_LOCAL` | Éxito — reconciliación completada con evidencia local, sin volver a consultar MH. |
| `NO_OP` | "El documento ya estaba resuelto." |
| `PENDING_UNCHANGED` | "MH no devolvió evidencia suficiente para resolver el estado. El documento permanece pendiente." — nunca "no existe"/"rechazado". |
| `INCONSISTENT_LOCAL_STATE` | Error operativo — requiere revisión manual. |
| `ABORTED_CONCURRENT_CHANGE` | Informa que el documento cambió durante la operación; sugiere recargar. |
| `BUSINESS_ERROR` | Mensaje seguro devuelto por el servicio. |

## 3. Botón UI

Vive en `/dashboard/dte/outgoing` (superficie de detalle ya existente,
no se crea una página nueva para esto): `dte-outgoing-action-bar.tsx`
(`ReconcileMhChip`), disponible cuando `action_availability.canReconcile`
(server-computed, `dte_status === "SIGNED"` — mismo predicado que
`canTransmit`, acción distinta: `consultadte`, nunca `recepciondte`).

Bajo Support Session (`runtimeWriteInfo !== null` en el panel), el chip
se muestra **deshabilitado** con tooltip "Modo soporte: solo lectura" —
nunca oculto del todo, para que quede visualmente claro que la acción
existe pero está bloqueada. El guard real está en el servidor
(`isRuntimeReadOnlyActive`); el botón deshabilitado es defensa en
profundidad, nunca el único control.

## 4. Inspector de metering — `/dashboard/dte/monitoring`

Página nueva (no existía una superficie natural para esto — se
descartó sobrecargar `/dashboard/settings/dte`, que es configuración,
no operación). Guard `requireAdmin` + `requireOrganizationModule("fiscal.dte")`,
runtime-aware idéntico a `/dashboard/dte/outgoing` y `/dashboard/settings/dte`
(`resolveEffectiveTenantContext` + `resolveRuntimeFirstLocationId`).

Reutiliza exclusivamente las funciones de metering ya certificadas en
`dte-fiscal-metering.service.ts` — `getDteMonthlyMeteringStatus`,
`listDteMonthlyMeteringEntries`, `listPendingDteMeteringReservations` —
vía el agregador `get-dte-monitoring-panel-data.ts`. Ningún cálculo se
reimplementa en la UI; el backend es la única fuente de verdad.

Muestra:
- **Consumo mensual** del periodo vigente: consumidos, pendientes,
  ocupados, límite ("Ilimitado" si `isUnlimited`), disponible.
- **PENDING** — reservas por reconciliar, ordenadas por antigüedad,
  scoped siempre por tenant efectivo.
- **Historial de metering** por periodo, con filtro `?period=YYYY-MM`
  validado estrictamente (`^\d{4}-\d{2}$` — `isValidPeriodKey`, nunca
  acepta strings arbitrarios/SQL-ish; un valor inválido cae
  silenciosamente al periodo vigente).

Componente 100% servidor (sin `"use client"`) — el filtro de periodo
usa un `<form method="GET">` nativo. No hay interactividad de cliente
en esta fase; no hace falta para una superficie solo-lectura sin
scheduler.

### TEST vs PRODUCTION

Las reservas de `DteFiscalMeteringReservation` corresponden
**únicamente** a DTE de producción — TEST nunca genera ledger (decisión
de FASE IV-A/IV-B). El inspector documenta esto explícitamente en la
sección PENDING. Un DTE TEST `SIGNED` incierto puede seguir teniendo su
propio botón manual desde `/dashboard/dte/outgoing`, pero nunca aparece
como PENDING comercial en este inspector.

## 5. Historial de consultas MH por documento

`listDteQueryHistory` (`src/modules/commerce/dte/queries/list-dte-query-history.ts`)
— lee `DteTransmissionLog` filtrado por `operation_type="QUERY"`,
extrae un **resumen seguro** (`result_kind`, `mh_estado`, `codigo_msg`,
`descripcion_msg`) desde `response_body` — nunca reenvía el objeto
completo (que puede incluir `rawResponse`, el JSON crudo de MH). Se
integra en `getDteOutgoingDetailById` como `mh_query_history` y se
renderiza en una nueva sección del panel de detalle
(`QueryHistorySection`, junto a la ya existente `LogsSection`).

Nunca expone: `Authorization`, `Bearer`, `token`, `password`,
`signerPrivateKeyPassword`, `signerApiKey`, `signed_jws`,
`json_document`, `encrypted_payload` — por construcción del adapter
(FASE IV-B) y verificado con tests dedicados.

## 6. Runtime awareness

Todas las lecturas nuevas siguen el patrón ya establecido:
`session user → resolveEffectiveTenantContext → runtimeDb/tenantId efectivos → metering/query history/DTE`.
Nunca se usa el prisma global "accidentalmente" para datos runtime de
un cliente en Support Session — las páginas siempre resuelven
`client ?? prisma` explícitamente (mismo patrón que
`/dashboard/dte/outgoing`), y el Control Plane sigue siendo la fuente
para `resolveCommercialEnforcementContext`/entitlements (nunca se
duplica su resolución).

La acción mutativa (`reconcileDteWithMhAction`) usa el prisma
singleton global como `runtimeDb`, consistente con el patrón de
*escritura* ya usado en el resto del módulo DTE (`switch-dte-environment.action.ts`,
`align-dte-correlative-session.action.ts`): las escrituras no leen del
tenant runtime — se bloquean por completo bajo Support Session.

## 7. Fail-closed / límites explícitos de esta fase

- `codigoMsg="999"` sigue siendo **exclusivamente empírico** — sin
  automatización, sin `QUERY_NOT_FOUND`, sin `RELEASED` automático. La
  UI puede mostrar "MH no confirmó el estado del documento." pero
  nunca "Documento no existe" sin evidencia real del servicio.
- Sin scheduler, cron, `setInterval`, colas ni polling periódico —
  toda reconciliación en esta fase es manual, disparada por un admin.
- Sin cambios a `schema.prisma` ni migraciones — todo el modelo de
  datos necesario (`DteFiscalMeteringReservation`, `DteTransmissionLog`)
  ya existía desde FASE IV-A/IV-B.
- Sin cambios de Plan/Entitlements, sin cuotas finitas nuevas.

## 8. Deuda explícita fuera de alcance de IV-C

**SEND/firma runtime-aware credential propagation** — `transmitDteDocument`
y `resolveDteSignerConfigForIssuer` (usado por `sign-dte-document.service.ts`)
siguen acoplados al prisma singleton global; su API pública no recibe
un `runtimeDb` explícito, a diferencia de `reconcileDteWithMh` (FASE
IV-B.4, ya runtime-aware). No se resuelve en IV-C. No bloquea: Support
Session sigue read-only, el inspector de IV-C es puramente lectura, y
la reconciliación manual ya es runtime-aware. Debe cerrarse antes de
operación fiscal real de un usuario cliente con runtime DB separada
(FASE VI).

## 9. Archivos

**Nuevos**: `reconcile-dte-with-mh.action.ts` (+test), `list-dte-query-history.ts`
(+test), `get-dte-monitoring-panel-data.ts` (+test), `dte-monitoring-panel.tsx`,
`/dashboard/dte/monitoring/page.tsx`, este documento.

**Modificados**: `dte-action-availability.utils.ts` (+test, `canReconcile`),
`outgoing/types.ts` (`canReconcile`, `DteQueryHistoryItem`, `mh_query_history`),
`dte-outgoing-action-bar.tsx` (`ReconcileMhChip`), `dte-outgoing-detail-panel.tsx`
(wiring + `QueryHistorySection`), `dte-outgoing-client.tsx` (`handleReconcile`),
`get-dte-outgoing-detail-by-id.ts` (integra `mh_query_history`),
`dashboard-nav.ts` (entrada "Monitoreo DTE").
