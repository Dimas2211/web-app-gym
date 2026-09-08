# FASE IV-A — Motor de metering comercial `fiscal.dte.monthly_issued`

Estado: **motor implementado y testeado en LOCAL. NO activado en producción.**
Aplica sobre la auditoría de diseño previa (misma fase, pasada 1). Ver también
`docs/modules/platform-block-b-runtime-enforcement.md` para el enforcement
estático (módulos + 4 capacidades) sobre el que esta fase se apoya.

## 1. Política comercial implementada

Un `DteOutgoingDocument` con `environment = PRODUCTION` consume exactamente 1
unidad de `fiscal.dte.monthly_issued` la primera vez que su `dte_status`
transiciona a `ACCEPTED` u `OBSERVED`. Nunca consumen unidad adicional:
reintentos del mismo documento, invalidación, contingencia, consultas MH,
firma, re-firma, delivery externo (MariaDB), ni ningún tipo de DTE
específico (FE/CCFE/NC/FEX/FSE) — no hay whitelist comercial por
`dte_type_code`, cualquier tipo saliente actual o futuro sigue la misma
regla.

`environment = TEST` nunca crea reserva ni consume, bajo ninguna
circunstancia.

## 2. Máquina de estados

Una fila `DteFiscalMeteringReservation` por `dte_document_id` (`@@unique`).

```
(sin fila)  --reserve-->                PENDING
PENDING     --reserve (retry)-->        PENDING    (idempotente, no cuenta de nuevo)
PENDING     --finalize (ACCEPTED/OBSERVED)-->  CONSUMED
PENDING     --release (REJECTED)-->      RELEASED
RELEASED    --reserve (reapertura)-->    PENDING    (MISMA fila; period_key/reserved_at nuevos, resolved_at=null)
CONSUMED    --reserve-->                 CONSUMED   (idempotente — no debería ocurrir en el pipeline normal, tratado explícito)
```

`RELEASED` **no** sigue ocupando cupo — una reapertura vuelve a comprobar
capacidad fresca desde cero. `CONSUMED` es terminal — nunca se decrementa
(invalidación no lo toca).

## 3. Periodo comercial

`period_key = "YYYY-MM"` del mes calendario **local** de
`PlatformOrganization.timezone` (nunca UTC, nunca un fallback fijo como
`America/El_Salvador`). Se fija en el momento en que la reserva `PENDING`
se adquiere por primera vez (o se reabre) — nunca se recalcula
retroactivamente contra la fecha de la respuesta MH. Un DTE reservado el
30/09 23:59 local cuya respuesta MH llega el 01/10 sigue perteneciendo a
septiembre.

Timezone ausente o no-IANA en una organización MANAGED → error comercial
explícito (`TIMEZONE_INVALID_OR_MISSING`, HTTP 422). Nunca se asume UTC ni
El Salvador como fallback silencioso — ver
`src/modules/commerce/dte/utils/dte-fiscal-period.util.ts`. Se resuelve con
`Intl.DateTimeFormat({ timeZone })` (API nativa, incluye DST) — no se
agregó `date-fns-tz` ni ninguna dependencia nueva.

## 4. Concurrencia

El check de capacidad + la reserva ocurren en una transacción Postgres
`Serializable` (mismo patrón que `withCapacityCheckedTransaction`, retry
acotado ante P2034/40001). La llamada HTTP a MH ocurre **fuera** de esa
transacción — nunca se mantiene una transacción SQL abierta durante I/O de
red. Dos transmisiones simultáneas de documentos distintos cerca del
límite: solo una gana el check; la otra recibe `CAPACITY_LIMIT_REACHED`
**antes** de llamar a MH.

Dos intentos concurrentes sobre el **mismo** `dte_document_id`: el
`@@unique([dte_document_id])` es el guardián final — si dos transacciones
intentan crear la fila, una gana y la otra recibe `P2002`, que se resuelve
releyendo la fila ganadora y devolviéndola como éxito idempotente (nunca
se crea una segunda reserva, nunca se disfraza un `P2002` de otra
constraint como éxito).

## 5. PENDING — incertidumbre nunca se resuelve por adivinanza

Error técnico, timeout, o estado MH inesperado: la reserva permanece
`PENDING` — no se consume, no se libera. Sigue ocupando cupo (evita
overselling). Un reintento del mismo documento reutiliza la misma reserva
(nunca crea una segunda ni vuelve a contar). Solo una futura
consulta/reconciliación MH (no implementada todavía — ver Gaps) puede
resolver un `PENDING` colgado. **No se implementó auto-expiración/TTL** —
liberar por edad sin evidencia fiscal permitiría overselling.

## 6. Integración con el pipeline DTE

Punto exacto de reserva: `transmit-dte-document.service.ts`, inmediatamente
antes de `adapter.transmit()` — nunca en `createPending`/`generate`/`sign`.
El servicio resuelve su propio `CommercialEnforcementContext`
internamente (no delega solo en la action que lo invoca) — cualquier
entry point que llame `transmitDteDocument` (la action directa y
`create-and-transmit-credit-note.action.ts`) queda cubierto por el mismo
gate sin duplicar lógica.

Resolución de la reserva (`finalize`/`release`) ocurre dentro de la MISMA
transacción Prisma que ya actualiza `DteOutgoingDocument.dte_status` a
ACCEPTED/OBSERVED/REJECTED (los 3 bloques se convirtieron de `$transaction([...])`
a `$transaction(async (tx) => {...})` para poder llamar al helper con el
mismo `tx`).

Un token (`DteMeteringToken`) capturado en el momento de reservar
(`BYPASS_TEST` | `BYPASS_LEGACY_UNMANAGED` | `ALREADY_CONSUMED` | `RESERVED`)
se pasa a `finalize`/`release` — evita que esas funciones necesiten
re-derivar TEST/LEGACY/entitlement y por tanto evita cualquier divergencia
entre lo decidido al reservar y lo decidido después.

## 7. Unlimited / UNCONFIGURED / LEGACY_UNMANAGED

- **Unlimited** (`is_unlimited=true` efectivo): SÍ crea reserva (mide uso
  real para reporting/auditoría) pero nunca bloquea.
- **UNCONFIGURED** (MANAGED sin entitlement definido): fail-closed — una
  nueva emisión PRODUCTION se bloquea con `ENTITLEMENT_NOT_CONFIGURED`.
  **Implementado en el motor pero NO activado** — TrustMe y GYM EL
  SALVADOR siguen `UNCONFIGURED` deliberadamente; activar el límite es una
  decisión comercial posterior, fuera de esta fase.
- **LEGACY_UNMANAGED**: bypass explícito por `ctx.mode` (igual que el resto
  del Commercial Enforcement) — nunca reportado como `Unlimited`, nunca
  crea ledger.

## 8. Reporting

`getDteMonthlyMeteringStatus(ctx, runtimeDb, now)` separa `consumed` /
`pending` / `occupied` (= consumed+pending) / `limit` / `remainingForNewIssue`
— nunca un contador opaco. `listDteMonthlyMeteringEntries` /
`listPendingDteMeteringReservations` dan el detalle documento por
documento (trazabilidad de "por qué 137/500"). Sin UI todavía — solo
funciones de lectura.

## 9. Backfill histórico

`prisma/scripts/backfill-dte-fiscal-metering.ts` (INSPECT por defecto,
EXECUTE gateado por dos variables de entorno exactas). Cubre **todo**
`DteOutgoingDocument` PRODUCTION históricamente `ACCEPTED`/`OBSERVED`/
`INVALIDATED` con evidencia real (nunca solo el mes vigente) — evidencia:
`ACCEPTED`→`accepted_at`, `OBSERVED`→`observed_at`, `INVALIDATED`→
`accepted_at` original (la invalidación no borra la evidencia de
aceptación). Sin timestamp → fila marcada `CONFLICT`, revisión manual, no
se inventa fecha. `REJECTED` y `TEST` quedan siempre fuera. Idempotente por
el mismo `@@unique([dte_document_id])`.

`period_key` histórico se deriva del timestamp de evidencia, no de un
`reserved_at` real (nunca existió) — limitación de bootstrap documentada,
no un bug: puede diferir excepcionalmente del criterio "periodo de
adquisición" que rige documentos nuevos desde esta fase en adelante.

**No se ejecutó EXECUTE contra ninguna base durante esta implementación.**

## 10. `issued_at` — deuda separada, no tocada

`DteOutgoingDocument.issued_at` nunca se escribe en el pipeline de emisión
propia (confirmado por auditoría) y no se tocó en esta fase. No se usa
como timestamp de metering. Deuda documentada aparte — fuera de alcance.

## 11. Gaps antes de activar en producción

1. **No existe reconciliación/consulta MH real** — un `PENDING` que quedó
   colgado por timeout solo puede resolverse manualmente hoy (vía
   `listPendingDteMeteringReservations`, lectura únicamente). Activar un
   límite finito real en un cliente MANAGED sin esto puede acumular
   `PENDING` indefinidos que ocupan cupo sin resolución automática.
2. **Backfill EXECUTE no se corrió contra ninguna organización real** —
   necesario antes de activar el límite en cualquier organización con DTE
   históricos del mes vigente.
3. **`PlatformOrganization.timezone` debe estar configurado y ser IANA
   válido** para cualquier organización antes de activar el entitlement —
   si no, toda transmisión PRODUCTION de esa organización fallará con
   `TIMEZONE_INVALID_OR_MISSING`.
4. **Extensión de `CapacityUsageProvider`** quedó mínima y aditiva
   (`usageContext?: { periodKey }`) — los 4 providers estáticos no cambian
   de comportamiento, pero cualquier futuro entitlement `MONTHLY` deberá
   seguir el mismo patrón.
5. **Sin UI** — Platform Admin no muestra todavía "137/500, 2 pendientes,
   361 disponibles" en Organization/Plan Detail. Diseño conceptual ya
   cubierto en la auditoría previa, no implementado.

## 12. Qué NO se activó en esta fase

- No se activó ningún límite comercial real en TrustMe ni GYM EL
  SALVADOR — `fiscal.dte.monthly_issued` sigue `UNCONFIGURED` para ambas.
- No se modificó `PlatformPlanEntitlement` ni ningún
  `PlatformOrganizationEntitlementOverride`.
- No se transmitió ningún DTE real, no se llamó a MH, no se firmó nada, no
  se tocó MariaDB.
- La migración se aplicó únicamente a la base LOCAL (`localhost:5432/TrustmeDB`
  — mismo host en `DATABASE_URL` y `DIRECT_URL` en este entorno). No se
  tocó ningún Control Plane ni runtime remoto.
