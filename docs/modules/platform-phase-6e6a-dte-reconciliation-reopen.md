# FASE VI-E6A — DTE reconciliation + reopen/resign runtime awareness

## Objetivo

Cerrar el flujo de reconciliación DTE (`reconcile-dte-with-mh.*`) y los workflows
de reapertura para re-firma (`reopen-rejected-dte-for-resign.*`,
`reopen-signed-dte-for-resign.service.ts`) para `RUNTIME_CLIENT`, manteniendo:

- `DteOutgoingDocument` en runtime DB
- issuer/config en runtime DB
- credential en runtime DB
- MH query/auth usando la credential de esa misma runtime DB
- status/logs/metering en runtime DB
- capacidad comercial (`resolveCommercialEnforcementContext`) en Control Plane

Además, cierra dos gaps de cobertura heredados de VI-E5B (transmisión):
test dedicado cross-tenant/cross-location, y test integrado que demuestra
que `dteDoc.environment` selecciona realmente auth URL + transmission URL +
ambiente del payload correctos para TEST/PRODUCTION.

Explícitamente **fuera de alcance**: invalidación (VI-E6B), contingencia
productiva (VI-E6C), delivery MariaDB (VI-E7), MH real, signer real, push,
deploy.

## 1. Preflight

HEAD de partida: `3ad3af1` (`fix(dte): route transmission through runtime database`).
Working tree limpio salvo `gym_system_db_before_dte_alignment.backup` y
`prisma/scripts/reset-user-password.ts` (preservados sin tocar).

## 2. Inventario de reconciliación

| Path | Entry point | DB source (antes) | DB source (después) | Write? |
|---|---|---|---|---|
| `services/dte-reconciliation.service.ts` | `reconcileDteWithMh(params)` | `runtimeDb: PrismaClient` (requerido, sin default, sin `import prisma`) | Sin cambio — ya era 100% runtime-aware desde FASE IV-B.4 | Sí — `DteOutgoingDocument`, `DteFiscalMeteringReservation`, `DteTransmissionLog` |
| `actions/reconcile-dte-with-mh.action.ts` | `reconcileDteWithMhAction(dteDocumentId)` | `requireAdmin` + `getEffectiveLocationId` + `resolveCommercialEnforcementContext` manual; pasaba `runtimeDb: prisma` (singleton global) | **Migrado** a `requireOperationalContext({ module: "fiscal.dte", write: true })`; pasa `runtimeDb: context.client` | Sí (delega al service) |
| `queries/list-dte-query-history.ts` | `listDteQueryHistory({ dteDocumentId, client })` | `client: PrismaClient = prisma` (ya inyectable) | Sin cambio — su único caller (`get-dte-outgoing-detail-by-id.ts` ← `GET /api/dte/outgoing/:id`) ya forwardea `ctx.client` desde `getDteApiContext` | No (solo lectura) |

No existe una tabla `DteQueryHistory` separada — los logs de consulta MH viven
en `DteTransmissionLog` filtrados por `operation_type: "QUERY"`.

## 3. Reconciliation service — invariante same-runtime

`DTE_RECONCILIATION_SAME_RUNTIME_DB = YES`. El service nunca importa el
prisma singleton global; `MhAuthAdapter({ credentialClient: runtimeDb })` se
construye siempre con la misma `runtimeDb` recibida — la `DteCredential` se
resuelve de la misma base física que `DteOutgoingDocument`/`DteIssuerConfig`.
Certificado desde IV-B.4, re-verificado en esta fase sin cambios
(`dte-reconciliation.service.runtime-aware-adapter.test.ts`).

## 4. Credential / MH query

`resolveMhAuthCredentials(..., client: runtimeDb)` — mismo chain certificado
en VI-E5B para transmisión. Sin cambios necesarios en esta fase; la action ya
migrada ahora garantiza que `runtimeDb` sea siempre `context.client` en vez
del prisma global.

## 5. Environment

`reconcileDteWithMh` usa `dteDoc.environment` para `resolveDteMhUrls(environment)`
→ `queryDteUrl`. Certificado con 2 tests nuevos en
`dte-reconciliation.service.test.ts` (TEST → `apitest.dtes.mh.gob.sv`,
PRODUCTION → `api.dtes.mh.gob.sv`, verificando tanto el argumento pasado al
adapter de consulta como la URL persistida en el log).

## 6. Status transitions

Sin cambios — se preservan exactamente las transiciones ya certificadas en
IV-B: `SIGNED → ACCEPTED`, `SIGNED → OBSERVED`, idempotencia en estados
terminales (`ACCEPTED`/`OBSERVED`/`REJECTED`/`INVALIDATED`), repair local
seguro, y fail-closed (`INCONSISTENT_LOCAL_STATE`) ante cualquier divergencia
del ledger. No se tocó ninguna transición.

## 7. Metering durante reconciliación

`finalizePendingReservationByDocument` (PENDING→CONSUMED por documento,
exclusivo de reconciliación) sin cambios — ya era runtime-clean. TEST hace
bypass (nunca tuvo reserva); PRODUCTION exige ledger PENDING consistente
antes de llamar MH.

## 8. Concurrencia

Se preserva la protección existente: re-lectura de `DteOutgoingDocument`
dentro de la transacción antes de escribir; si el estado cambió
concurrentemente (ya no está `SIGNED`), aborta con
`ABORTED_CONCURRENT_CHANGE` sin sobrescribir. Test ya existente
(`dte-reconciliation.service.test.ts`, caso 35), sin cambios.

## 9. Query history

Confirmado: `listDteQueryHistory` ya acepta `client` inyectable, y su único
caller productivo (`get-dte-outgoing-detail-by-id.ts`) ya recibe `ctx.client`
desde `GET /api/dte/outgoing/:id` (`getDteApiContext`, migrado en fase
anterior VI-E2A). Sin escritura cross-tenant posible — scoping por
`tenant_id`/`location_id` en la query principal.

## 10. Reopen rejected

`reopen-rejected-dte-for-resign.service.ts` — sin cambios de código (ya
runtime-capable desde VI-E5A: `db: PrismaClient = prisma` inyectable,
transacción única). Preconditions auditadas y preservadas:

- `dte_status === "REJECTED"` (si no, error explícito)
- `reception_stamp` vacío (si tiene sello, no es rechazo técnico de firma)
- `json_document` presente
- `codigoMsg` del último log `SEND` ∈ `{"802"}` (RESIGNABLE_MH_CODES) — leído
  del log real, nunca del texto libre `rejection_reason`

Primer test dedicado del service creado en esta fase
(`reopen-rejected-dte-for-resign.service.test.ts`, 8 casos): flujo normal,
las 4 preconditions, y aislamiento cross-tenant/cross-location.

## 11. Reopen signed

`reopen-signed-dte-for-resign.service.ts` — código runtime-capable pero
**sin ningún entry point productivo** (`REOPEN_SIGNED_ENTRYPOINT = NONE`,
confirmado por grep exhaustivo: cero imports fuera del archivo mismo). Por
instrucción explícita de esta fase, no se creó una Server Action/UI nueva —
queda documentado y listo para cuando exista el caso de uso real (firmador
reemplazado a mitad de una operación SIGNED-pero-nunca-enviada).

## 12. Metering reopen

`RELEASED → PENDING` (reapertura) ocurre exclusivamente dentro de
`reserveDteFiscalCapacity` (`dte-fiscal-metering.service.ts`), en su rama
"sin fila, o RELEASED (reapertura)" — código preexistente, no tocado. Ni
`reopen-rejected-dte-for-resign.service.ts` ni
`reopen-signed-dte-for-resign.service.ts` tocan la tabla de metering: es
correcto por diseño, la re-reserva ocurre naturalmente en el próximo
`transmitDteDocument`. No se agregó lógica de metering nueva en los
services de reopen.

## 13. Resign chain

`reopen-rejected-dte-for-resign` deja el documento en `SCHEMA_VALIDATED`,
el mismo estado que `signDteDocument` (ya runtime-aware desde VI-E5A) sabe
firmar — sin duplicar lógica de firma. La action
(`reopen-rejected-dte-for-resign.action.ts`) ya pasaba `context.client` desde
VI-E5A; sin cambios en esta fase.

## 14. Support

Support Session (`SUPPORT_RUNTIME`) bloqueada para reconciliar/reabrir por el
mismo mecanismo certificado desde VI-D2: `requireOperationalContext({ write: true })`
rechaza `READ_ONLY` (`context.readOnly === true` para `SUPPORT_RUNTIME`,
incondicional) ANTES de invocar el service — sin excepción, sin bypass. La
migración de `reconcile-dte-with-mh.action.ts` hereda esta garantía
automáticamente sin código adicional.

## 15. Cross-tenant / cross-location

Nuevos tests:

- `dte-reconciliation.service.test.ts`: tenant A no puede reconciliar DTE de
  tenant B; location A no puede reconciliar DTE de location B (mismo
  tenant) — `BUSINESS_ERROR`, 0 llamadas MH.
- `reopen-rejected-dte-for-resign.service.test.ts`: mismo patrón para
  reopen — error explícito, sin mutación, sin log `RETRY_PREPARE`.
- `transmit-dte-document.service.runtime.test.ts`: cierra el gap heredado
  de VI-E5B — tenant A / location A no pueden transmitir un DTE de
  tenant/location B — 0 llamadas a `MhDteTransmissionAdapter`,
  `MhAuthAdapter`, `reserveDteFiscalCapacity`, `$transaction`.

## 16. E5B — gap de transmisión cross-tenant (cerrado)

Ver punto 15 — certificado en `transmit-dte-document.service.runtime.test.ts`.

## 17. E5B — gap de integración de ambiente (cerrado)

Nuevo archivo `dte-transmission.environment-integration.test.ts` (3 tests):
usa las clases REALES `MhAuthAdapter` + `MhDteTransmissionAdapter` (nunca
mockeadas como constructor), mockeando únicamente el boundary de red
(`fetch`) y el boundary de credenciales (`resolveMhAuthCredentials`).
Certifica el chain completo: `environment` → URL de auth MH → URL de
recepción MH → código de ambiente en el payload (`00`=TEST, `01`=PRODUCTION)
→ propagación del mismo `credentialClient` a `resolveMhAuthCredentials`. No
bastaba el test unitario aislado de `resolveDteMhUrls`
(`dte-mh.config.test.ts`) — ahora existe cobertura del chain real.

## 18. Contingency guard

Sin tocar, deuda confirmada y re-registrada: `assertDteContingencyTransmissionAllowed`
sigue usando el prisma global sin ningún parámetro `db`/`runtimeDb`
inyectable. Su caller (`transmit-dte-document.service.ts`, ya migrado en
VI-E5B) no le pasa `db` porque el guard no lo acepta. Pendiente para VI-E6C.

## 19. Censo de Prisma global (acotado)

`RUNTIME_CLIENT_DTE_RECONCILIATION_CAN_HIT_GLOBAL_PRISMA = NO` —
`reconcile-dte-with-mh.action.ts` ya no pasa `prisma` como `runtimeDb`.

`RUNTIME_CLIENT_DTE_REOPEN_CAN_HIT_GLOBAL_PRISMA = NO` — ambos services de
reopen ya usaban `db: PrismaClient = prisma` como default (solo alcanzado
por callers legacy PLATFORM_NATIVE sin `db` explícito); la única action real
(`reopen-rejected-dte-for-resign.action.ts`) ya pasaba `context.client` desde
VI-E5A.

## 20. Semántica de fallos

Sin cambios — se preservan exactamente los comportamientos existentes ante
auth failure, network failure, not found en MH, ambiente inválido, status
inesperado, y fallo de persistencia en DB (fail-closed, nunca convierte
automáticamente a REJECTED salvo que el código ya lo hiciera). Reopen sigue
fail-closed ante estado inválido, sello de recepción existente, o código no
resignable.

## 21. Auditoría de secretos

Sin cambios — ningún log nuevo incluye token/password/`encrypted_payload`/
`signed_jws` completo. Test existente (`dte-reconciliation.service.test.ts`,
caso 39) ya certifica que el log QUERY nunca contiene
Authorization/token/Bearer; el test nuevo de mapping de resultados de la
action (`reconcile-dte-with-mh.action.test.ts`, caso 13) certifica lo mismo
a nivel de resultado público.

## 22. Tests — resumen

20 tests nuevos (789 en el repo, antes 769):

- `reconcile-dte-with-mh.action.test.ts` — reescrito completo, 15 casos
  (antes 13, migrado al patrón `requireOperationalContext`).
- `dte-reconciliation.service.test.ts` — +4 (2 cross-tenant/location, 2
  integración de ambiente TEST/PRODUCTION).
- `transmit-dte-document.service.runtime.test.ts` — +2 (cross-tenant,
  cross-location).
- `dte-transmission.environment-integration.test.ts` — nuevo, 3 tests.
- `reopen-rejected-dte-for-resign.service.test.ts` — nuevo, 8 tests (primer
  test dedicado del service).

## 23. TSC / lint / build

- `npx tsc --noEmit`: limpio salvo la deuda preexistente ya documentada en
  `generate-nc-json.service.runtime-write.test.ts` (mismatch de tipos en un
  mock, sin relación con los archivos tocados en esta fase — `TSC_PREEXISTING_ERRORS`).
  `TYPECHECK_NO_NEW_ERRORS = YES`.
- `npm run lint`: sin errores. Solo warnings preexistentes en archivos no
  tocados por esta fase.
- `npm run build`: PASS.

## 24. Schema / migraciones

`SCHEMA_CHANGE = NO`, `MIGRATION_REQUIRED = NO`. No se tocó `schema.prisma`.

## Impacto en bases de datos y sincronización local/remota

- **Qué base se tocó**: ninguna migración de schema. Los cambios son
  exclusivamente de código de aplicación (Server Action + tests).
- **Qué base no se tocó**: tanto `DATABASE_URL` (local) como `DIRECT_URL`
  (remota) permanecen sin cambios estructurales — no hubo `prisma migrate`.
- **Qué quedó alineado**: no aplica desincronización nueva — sin cambios de
  schema no hay riesgo de deriva entre local y remoto por esta fase.
- **Qué quedó pendiente**: nada relacionado a schema. La deuda pendiente es
  puramente de código (contingencia — VI-E6C).
- **Qué debe ejecutar el usuario después**: nada obligatorio para este
  commit — no requiere `npx prisma generate`/`migrate` ni sincronización
  adicional entre `DATABASE_URL` y `DIRECT_URL`.

## Blockers

Ninguno. Fase cerrada con gaps explícitamente documentados (contingencia,
invalidación, MariaDB) para fases posteriores.

## Flags finales

```
DTE_CREATION_RUNTIME_READY = YES
DTE_SIGNING_RUNTIME_READY = YES

DTE_NORMAL_TRANSMISSION_RUNTIME_READY = YES
DTE_CONTINGENCY_TRANSMISSION_RUNTIME_READY = NO
DTE_TRANSMISSION_RUNTIME_READY = PARTIAL

DTE_METERING_RUNTIME_READY = YES

DTE_RECONCILIATION_RUNTIME_READY = YES
DTE_RECONCILIATION_SAME_RUNTIME_DB = YES

RUNTIME_CLIENT_DTE_RECONCILIATION_CAN_HIT_GLOBAL_PRISMA = NO

DTE_RECONCILIATION_CROSS_TENANT_BLOCKED = YES
DTE_RECONCILIATION_CROSS_LOCATION_BLOCKED = YES

DTE_SUPPORT_RECONCILIATION_BLOCKED = YES

DTE_REOPEN_REJECTED_RUNTIME_READY = YES
DTE_REOPEN_SIGNED_RUNTIME_READY = PARTIAL (código runtime-capable, sin entry point productivo)
DTE_REOPEN_RESIGN_RUNTIME_SAFE = YES

RUNTIME_CLIENT_DTE_REOPEN_CAN_HIT_GLOBAL_PRISMA = NO

DTE_E5B_TRANSMISSION_CROSS_TENANT_TEST = YES
DTE_E5B_TRANSMISSION_ENVIRONMENT_INTEGRATION_TEST = YES

DTE_INVALIDATION_RUNTIME_READY = NO
DTE_CONTINGENCY_RUNTIME_READY = NO
DTE_MARIADB_DELIVERY_RUNTIME_READY = PARTIAL

TSC_FULL_PASS = NO (deuda preexistente documentada, no nueva)
TYPECHECK_NO_NEW_ERRORS = YES

SCHEMA_CHANGE = NO
MIGRATION_REQUIRED = NO

ALL_TESTS_PASS = YES
BUILD_PASS = YES

READY_FOR_VI_E6B = YES

BLOCKERS = []
```
