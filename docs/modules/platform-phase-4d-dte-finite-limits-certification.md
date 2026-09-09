# FASE IV-D — Certificación de límites finitos para `fiscal.dte.monthly_issued`

**Estado: `finite limits certified technically, not enabled for real
organizations`.** Ningún plan/organización real fue activado con límite
finito — GYM y TrustMe siguen exactamente como estaban (Unlimited /
UNCONFIGURED, según corresponda). Esta fase certifica el motor
existente (FASE IV-A/IV-B/IV-C), no activa nada nuevo.

## 1. Alcance

Certificar que el motor de metering ya implementado (`dte-fiscal-metering.service.ts`,
`capacity-engine.ts`) respeta la regla comercial:

```
occupied = CONSUMED + PENDING   (RELEASED nunca ocupa)
para cualquier nueva reserva:  occupied + 1 <= limit   — siempre, incluso bajo concurrencia real
```

con la excepción histórica admisible: si un admin reduce el límite por
debajo del uso ya existente, `occupied` puede quedar `> limit`, pero
eso nunca destruye datos, nunca libera reservas, nunca invalida DTE —
solo bloquea nuevas emisiones (`remaining = 0`).

## 2. Auditoría de código como fuente de verdad

`docs/context/current-state.md` (líneas 127/175/179, previo a esta
fase) afirmaba *"el contador/enforcement real no está implementado
todavía"* — **falso respecto al código actual**. El motor completo
(reserve/finalize/release, FASE IV-A; reconciliación, FASE IV-B.1) ya
existe y está testeado. Esta fase corrige esa desactualización (ver
§10).

Puntos exactos verificados en el código:

| Punto | Ubicación |
|---|---|
| Effective entitlement | `resolveCommercialEnforcementContext` (Control Plane) → `CommercialEnforcementContext.effectiveEntitlements` |
| Conteo de usage | `capacity-registry.ts` — `countUsage` de `fiscal.dte.monthly_issued`: `count({status: {in:["PENDING","CONSUMED"]}})`, scoped por `tenant_id`+`period_key` |
| Bloqueo | `capacity-engine.ts` — `assertCapacityAvailable`: `used + delta > limit → CAPACITY_LIMIT_REACHED` |
| Reserva | `dte-fiscal-metering.service.ts` — `reserveDteFiscalCapacity`, transacción `Serializable`, capacity check + write en la MISMA tx |
| CONSUMED | `finalizeDteFiscalCapacityConsumed` — `updateMany({status:"PENDING"}→{status:"CONSUMED"})`, atómico (0 filas afectadas = error explícito) |
| RELEASED | `releaseDteFiscalCapacity` — mismo patrón, `status:"RELEASED"` |
| PENDING | Ocupa cupo igual que CONSUMED. Nunca se libera por edad, timeout, error técnico o query inconclusiva — sin TTL, sin auto-release |
| CONSUMED | Terminal. Reserve reintenta idempotente (`ALREADY_CONSUMED`, sin recontar/reescribir). Invalidación posterior nunca devuelve cupo |
| RELEASED | Libera cupo. Reapertura solo si hay capacidad — nunca transforma RELEASED→PENDING si el check falla |
| `limit < occupied` | `getCapacityStatus` → `status:"OVER_LIMIT"`, `remaining:0` — no destructivo, nunca corrige el ledger |

## 3. Matriz certificada

### Real (PostgreSQL local, `localhost:5432/TrustmeDB`)

Ejecutado: `npx tsx src/modules/commerce/dte/dev/verify-dte-fiscal-metering-postgres-concurrency.ts`
(runner ya existente de FASE IV-A.1 — reutilizado sin modificar, por
seguir siendo la evidencia más fuerte para concurrencia real):

| Caso | Resultado real |
|---|---|
| 1 — dos documentos distintos, concurrentes, `limit=100/occupied=99` | `exactlyOnePending=true`, `exactlyOneBlocked=true`, `neverExceeded=true` |
| 2 — mismo `dteDocumentId`, dos intentos concurrentes | `exactlyOneRow=true` (1 sola fila), conflicto Prisma **P2034 observado y reintentado** (bounded retry, `attempts:2`) |
| 3 — RELEASED reacquire con/sin cupo | `okBecamePending=true`, `blockedStaysReleased=true` |
| 4 — rollback forzado tras el capacity check | `rollbackErrorOccurred=true`, `noPhantomRow=true`, `occupiedUnchanged=true` |
| 5 — TEST bypass | `noLedgerCreated=true` |
| 6 — Unlimited | `ledgerCreated=true` (mide), nunca bloquea |
| 7 — UNCONFIGURED | fail-closed, `noLedgerCreated=true` |
| Cleanup | pre/post idénticos: `DteOutgoingDocument` 68→68, `DteFiscalMeteringReservation` 0→0 (tenant sintético `cert-iva1-metering-*`, nunca real) |

### Unitaria (fake DB en memoria — determinística, sin red/Postgres)

Cobertura ya existente (`dte-fiscal-metering.service.test.ts`, 30 tests
+ `transmit-dte-document.service.metering.test.ts`, 2 tests +
`capacity-engine.test.ts`, 17 tests + `capacity-registry.test.ts`, 9
tests + `dte-reconciliation.service.test.ts`, 24 tests) ya certificaba:
bypass TEST/LEGACY, timezone fail-closed, UNCONFIGURED, Unlimited mide,
boundary genérico (`occupied<limit`/`occupied===limit`), idempotencia
por documento (PENDING/CONSUMED/RELEASED), reapertura RELEASED,
ACCEPTED/OBSERVED consumen, REJECTED libera, error técnico preserva
PENDING, reconciliación PROD (`ACCEPTED`/`OBSERVED`/no-conclusivo/rollback
por cambio concurrente), plan/override generico en `capacity-engine.test.ts`.

**Gaps reales identificados y cerrados en esta fase** (6 tests nuevos en
`dte-fiscal-metering.service.finite-limit-certification.test.ts`):

| Caso | Resultado |
|---|---|
| `limit=0`, `occupied=0` | nueva reserva `CAPACITY_LIMIT_REACHED`, cero filas creadas |
| O1 — reserva en septiembre, `finalize` con `now` de octubre | `period_key` permanece `"2026-09"` (finalize nunca recalcula periodo) |
| O3 — septiembre lleno | bloquea en septiembre, **nunca** bloquea un documento nuevo de octubre (periodos aislados por `period_key` en el filtro de `countUsage`) |
| O4 — reporting por periodo | `getDteMonthlyMeteringStatus` cuenta cada mes independientemente |
| Reducir límite bajo el uso (Q) | `occupied=3, limit=2` → `remainingForNewIssue=0` (nunca negativo), nueva reserva bloqueada, **las 3 filas existentes permanecen exactamente iguales** |
| finite→unlimited→finite (R) | bloqueado en finite → permitido en Unlimited (ledger sigue midiendo, crea fila real) → vuelve a finite con `occupied` mayor → `OVER_LIMIT`, nuevas bloqueadas, lo ya creado se preserva |

**Gaps de pipeline completo cerrados** (5 tests nuevos agregados a
`transmit-dte-document.service.metering.test.ts`, reutilizando su mock
ya existente en vez de crear un archivo nuevo):

| Caso | Resultado |
|---|---|
| L1 — capacidad disponible + adapter ACCEPTED | reserve PENDING → ledger CONSUMED, adapter llamado exactamente 1 vez |
| L3 — adapter OBSERVED | ledger CONSUMED igual que ACCEPTED |
| L4 — adapter RECHAZADO confirmado | ledger RELEASED (cupo recuperado) |
| L5 — error técnico/timeout del adapter | reserva creada pero **ledger nunca se toca** — ni CONSUMED ni RELEASED, sigue PENDING |
| M — reintento sobre el mismo DTE ya PENDING | reserve devuelve la MISMA reserva (`reservationCreateSpy` no se vuelve a llamar), nunca segunda fila |

`ETAPA N` (reconciliación + límite finito, N1-N4) y `ETAPA S` (precedencia
plan/override) **no requirieron tests nuevos** — ya certificados
exhaustivamente por `dte-reconciliation.service.test.ts` (24 tests,
incluye PROD `ACCEPTED`/`OBSERVED`/error técnico/`RECHAZADO`/`QUERY_INCONSISTENT`,
todos preservando PENDING salvo `QUERY_PROCESSED` inequívoco) y
`capacity-engine.test.ts` (override/override-unlimited/UNCONFIGURED).
`codigoMsg=999` no tiene código dedicado — cae en `QUERY_REJECTED_OR_ERROR`,
ya cubierto por el test 24 de reconciliación; **no se agregó lógica
nueva para él** (sigue exclusivamente empírico, sin automatización).

## 4. Invariantes críticos — resultado final

| Invariante | Certificado |
|---|---|
| `occupied = pending + consumed` | ✅ |
| Exact boundary | ✅ |
| No overselling bajo concurrencia real | ✅ (runner caso 1) |
| Bloqueo antes del adapter/MH | ✅ (`transmit-dte-document.service.metering.test.ts`, adapter nunca invocado cuando `CAPACITY_LIMIT_REACHED`) |
| Mismo documento idempotente | ✅ (runner caso 2, P2034 + retry acotado) |
| PENDING ocupa cupo | ✅ |
| RELEASED libera cupo | ✅ |
| Reapertura re-chequea capacidad | ✅ (runner caso 3) |
| CONSUMED terminal | ✅ |
| ACCEPTED/OBSERVED consumen | ✅ (pipeline completo, L1/L3) |
| REJECTED libera | ✅ (pipeline completo, L4) |
| Error técnico preserva PENDING | ✅ (pipeline completo, L5) |
| Reconciliación preserva contabilidad finita | ✅ (24 tests existentes) |
| Boundary de mes correcto | ✅ (nuevo) |
| Timezone fail-closed | ✅ |
| Over-limit no destructivo | ✅ (nuevo) |
| Transiciones de entitlement seguras | ✅ (nuevo) |
| Rollback atómico | ✅ (runner caso 4 + test de divergencia) |
| Reporting correcto | ✅ |
| Cleanup exacto | ✅ (runner: 68/0 → 68/0) |
| Cero efectos externos reales | ✅ (ver §6) |

**`FINITE_LIMIT_ENGINE_CERTIFIED = YES`**

## 5. Qué NO se activó

- Ningún `PlatformPlanEntitlement`/`PlatformOrganizationEntitlementOverride`
  real fue modificado — cero writes a Control Plane remoto ni a runtime
  DBs de GYM/TrustMe.
- GYM y TrustMe siguen operando exactamente como antes de esta fase
  (Unlimited/UNCONFIGURED según su configuración actual — no verificada
  ni tocada aquí).
- Ningún límite finito real quedó habilitado para ninguna organización.
- Sin scheduler, sin TTL, sin auto-release, sin `QUERY_NOT_FOUND`
  automático — la política PENDING de FASE IV-A/IV-B permanece
  intacta, auditada explícitamente (§2) para confirmar que esta fase no
  la alteró.

## 6. Cero efectos externos reales

Toda la certificación mutativa ocurrió exclusivamente contra
`localhost:5432/TrustmeDB` con un tenant sintético (`cert-iva1-metering-*`,
UUID por corrida, nunca reutilizado) y fixtures aislados, con cleanup
verificado exacto. Cero llamadas MH (real o mockeada-como-red), cero
firmador, cero MariaDB, cero writes a Supabase remoto (Control Plane ni
runtime TrustMe).

## 7. Archivos

**Nuevos**: `dte-fiscal-metering.service.finite-limit-certification.test.ts`
(6 tests), este documento.

**Modificados**: `transmit-dte-document.service.metering.test.ts` (+5
tests, pipeline completo con límite finito disponible), `docs/context/current-state.md`
(corrección de estado desactualizado sobre metering DTE).

**Reutilizados sin cambios**: `src/modules/commerce/dte/dev/verify-dte-fiscal-metering-postgres-concurrency.ts`
(ejecutado, no modificado — ya cubría exhaustivamente la concurrencia
real).

## 8. Bugs encontrados

Ninguno. Los 11 tests nuevos (6 + 5) pasaron en su primera ejecución
sin requerir ningún cambio al código productivo — el motor certificado
en FASE IV-A se comporta exactamente como diseñado bajo todos los casos
adicionales de esta fase.
