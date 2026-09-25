# FASE VI-E8 — DTE Integral Dedicated-Runtime Certification

> *HISTÓRICO*: `SHARED_RUNTIME_IMPLEMENTED = NO` refleja el momento de E8.
> Shared Runtime está implementado y en producción desde SHARED-PILOT-4A..4C
> (ver `docs/context/shared-pilot-4c-closure.md`). El onboarding fiscal DTE
> de clientes Shared sigue **DEFERRED**.

Dedicated DB only. NO Shared/Hybrid. Certifica lo ya implementado en
VI-E1..E7 (no re-audita desde cero) más el cierre de la última deuda
TypeScript conocida. NO declara `DEDICATED_RUNTIME_V1 = CERTIFIED` (fase
futura, tras un "Cliente 3" end-to-end real).

## 1. Deuda TSC cerrada

`generate-nc-json.service.runtime-write.test.ts` tenía un mismatch de tipos
en el mock de `findFirst` (TS inferí­a el tipo del retorno del primer mock y
lo reasignaba con formas incompatibles en los tests 2 y 3). Cerrado
declarando tipos explícitos de fixture (`NcDocRow`, `CcfeDocRow`,
`FindFirstDocRow`, `FindFirstFn`) y usándolos en las 3 reasignaciones de
`findFirst`. **Solo tipos/mocks — `generate-nc-json.service.ts` (producción)
y el NC05 builder no se tocaron; la intención de cada test es idéntica.**
`npx tsc --noEmit` → **0 errores** (antes: 1 error preexistente documentado
desde VI-E4B).

## 2. Censo de Prisma global runtime-reachable (alcance DTE)

Censo ACOTADO a rutas de producción DTE runtime-reachable (creación,
generación JSON, validación, firma, transmisión normal+contingencia,
metering, reconciliación, reopen, invalidación, entrega externa origen) —
no un re-audit general del repo.

| Categoría | Ejemplos | Veredicto |
|---|---|---|
| `OPTIONAL_DEFAULT_SAFE` | Todos los servicios `*.service.ts` de creación/firma/transmisión/reconciliación/invalidación/contingencia/entrega externa (`db: PrismaClient = prisma` o `client?: PrismaClient`) — certificados runtime-safe en VI-E1..E7, callers productivos siempre pasan `context.client`/`access.context.client` explícito | Prisma global es solo el valor por defecto para compatibilidad de callers no migrados; ningún caller productivo activo depende de él |
| `CONTROL_PLANE_ONLY` | `resolve-external-dte-destination.ts` (lee `PlatformExternalIntegration`/`PlatformOrganization` vía `controlPlanePrisma`), `require-runtime-dte-write-access.ts` (resuelve perfil/organización) | Correcto por diseño — esas tablas SIEMPRE viven en Control Plane, nunca en runtime DB del cliente |
| `GLOBAL_REFERENCE` | `queries/list-dte-catalog-items.ts` (`DteCatalogItem`, sin `tenant_id` — catálogo oficial MH compartido) | Legítimo — no es dato de cliente |
| `DEV_ONLY` | `src/modules/commerce/dte/dev/verify-*.ts` (12 scripts), `fex11-test/actions/fex11-test-console.actions.ts` (falla explícito si `NODE_ENV==="production"`) | No reachable en producción, confirmado por guard explícito o por no estar wireado a ninguna ruta |
| `DEAD_CODE` | `actions/preview-fex-json.action.ts` (documentado en el propio archivo: "no está conectada a ningún botón, selector ni flujo visible") | Prisma global sin `client` param, pero sin entry point UI — deuda preexistente, no cerrada aquí (fuera de alcance: requeriría decidir si FEX11 preview se conecta a UI, decisión de producto) |
| `RUNTIME_UNSAFE` | Ninguno encontrado en rutas productivas reachable | — |

`DTE_RUNTIME_CLIENT_CAN_HIT_GLOBAL_PRISMA = NO` para todo el ciclo DTE
productivo reachable. La única excepción real (`preview-fex-json.action.ts`)
es código muerto sin wiring UI, documentado como deuda preexistente, no un
riesgo activo hoy.

## 3. Matriz por tipo de documento × paso del flujo

| Paso | FE01 | CCFE03 | FSE14 | FEX11 | NC05 |
|---|---|---|---|---|---|
| CREATE | ✅ | ✅ | ✅ | ✅ (TEST-only, feature-gated) | ✅ |
| GENERATE JSON | ✅ | ✅ | ✅ | ✅ | ✅ |
| SCHEMA VALIDATE | ✅ | ✅ | ✅ | ✅ | ✅ |
| SIGN | ✅ | ✅ | ✅ | ✅ | ✅ |
| MH AUTH | ✅ (compartido, runtime-aware desde VI-E5B) | ✅ | ✅ | ✅ | ✅ |
| TRANSMIT NORMAL | ✅ | ✅ | ✅ | — (no en pipeline real de transmisión productiva aún) | ✅ |
| METERING | ✅ | ✅ | ✅ | ✅ | ✅ (consume igual que un FE — sin política especial NC, deuda comercial ya documentada en fases IV) |
| RECONCILIATION | ✅ | ✅ | ✅ | — | ✅ |
| EXTERNAL DELIVERY | ✅ | ✅ | ✅ | ✅ (TEST-only vía `fex11-feature-guard`) | ✅ |

Fuente: inspección directa de `build-external-dte-payload.service.ts`
(`SUPPORTED_TYPES = ["01","03","05","14"]` + rama especial `"11"` gateada a
TEST) y de los servicios de creación/firma/transmisión por tipo (sin
llamadas de red reales — certificación por código + tests existentes).

## 4. Flujos secundarios

| Flujo | Estado | Nota |
|---|---|---|
| NC05 aislamiento de referencia original | ✅ | `generate-nc-json.service.ts` filtra el CCFE original por `tenant_id`/`location_id` en el `where` — cross-tenant fail-closed, certificado por test |
| Reopen rejected/resign | ✅ | `reopen-rejected-dte-for-resign.service.ts` runtime-aware desde VI-E6A |
| Reconciliation | ✅ | `dte-reconciliation.service.ts` runtime-aware desde VI-E6A, NO cubre `INVALIDATION_PENDING` ni `DteContingencyEvent` (deuda conocida, ver abajo) |
| Invalidation (creación/firma/transmisión) | ✅ | VI-E6B |
| Invalidation — entrega externa | ✅ (esta fase, VI-E7) | Mismo resolver que entrega DTE normal |
| Contingencia (creación/firma/transmisión) | ✅ (servicios) | VI-E6C — `CONTINGENCY_PRODUCT_ENTRYPOINT = NONE` sigue así (sin Server Action/UI productiva, deuda ya documentada, no es alcance de E8) |
| Transmission type 2 (contingencia) | ✅ | `assertDteContingencyTransmissionAllowed` runtime-aware desde VI-E6C |

## 5. Invariantes de seguridad

- **Dedicated Runtime DB isolation**: cross-tenant bloqueado (tests de
  aislamiento en cada fase E1..E7, incluida esta: `resolve-external-dte-destination.test.ts`
  aislamiento A/B, `deliver-dte-to-external-db.service.cross-tenant.test.ts`
  STEP 9), cross-location bloqueado (`where` con `location_id` en cada query
  de documento/evento), rol efectivo LIVE (`requireOperationalContext`
  revalida `role` contra runtime DB, certificado desde VI-D2).
- **Support Session read-only** salvo `DELIVER_EXTERNAL` — política sin
  ampliar, allowlist verificada por test (`RUNTIME_DTE_WRITE_ALLOWLIST`
  sigue siendo exactamente `["DELIVER_EXTERNAL"]`).
- **Entorno TEST/PRODUCTION**: `sign-dte-document.service.ts` y los
  servicios de invalidación/contingencia rechazan mezclar `DteOutgoingDocument
  .environment` con `DteIssuerConfig.environment` (certificado en VI-E5A/
  E6B/E6C, no tocado en E7/E8).
- **Mismo emisor/credencial/documento por runtime**: `resolveDteSignerConfigForIssuer`
  y `MhAuthAdapter({ credentialClient: db })` siempre reciben el `db`
  efectivo — nunca resuelven credenciales de una base distinta a la del
  documento.
- **Sin autoridad de cliente/browser**: `organizationId`/`tenantId`/
  `locationId`/destino externo se resuelven SIEMPRE server-side
  (`requireRuntimeDteWriteAccess`, `requireOperationalContext`) — nunca
  aceptados como parámetro del cliente en ninguna action tocada por E7/E8.
- **Sin secretos en logs**: `encrypted_payload` nunca se loguea; el adapter
  MariaDB sanitiza errores (`password=[redacted]`); ningún test de esta fase
  usa credenciales reales ni las imprime.

## 6. Aislamiento de entorno

Sin cambios respecto a VI-E5A/E6B/E6C — reconfirmado por inspección: ningún
servicio de esta fase introduce una ruta nueva de mezcla TEST/PRODUCTION.

## 7. Arquitectura Dedicated-only

`SHARED_RUNTIME_IMPLEMENTED = NO`, `HYBRID_RUNTIME_IMPLEMENTED = NO` — el
modelo nuevo (`PlatformExternalIntegration`) vive en el Control Plane
(igual que `PlatformDatabaseProfile`), nunca reemplaza aislamiento físico por
`tenant_id` lógico. Cada organización sigue teniendo su propia base
Postgres dedicada; lo único nuevo es DÓNDE se guarda la config de un
destino MariaDB EXTERNO opcional (Control Plane, no la runtime DB del
cliente, y nunca compartido entre organizaciones).

## 8. Deudas conocidas, no cerradas en E7/E8 (no bloqueantes)

- `INVALIDATION_PENDING_CRASH_RECOVERY_SAFE = NO` — sin cambios (VI-E6B).
- `CONTINGENCY_CRASH_RECOVERY_SAFE = NO` — sin cambios (VI-E6C).
- `CONTINGENCY_PRODUCT_ENTRYPOINT = NONE` — sin cambios (VI-E6C), servicios
  runtime-capable, sin UI real todavía.
- `preview-fex-json.action.ts` — `DEAD_CODE`, Prisma global sin `client`,
  sin entry point UI. No es un riesgo activo (0 callers reales), pero queda
  documentado para no perderlo de vista si algún día se conecta a UI.
- Catálogos globales de referencia (`DteCatalogItem`, etc.) — legítimamente
  fuera del contrato runtime (dato compartido, no de cliente).

Clasificación: `KNOWN_NON_BLOCKING_DISTRIBUTED_RECOVERY_DEBT` para los dos
primeros ítems (mismo criterio que fases previas).

## 9. Validación final

- `npx vitest run` → **880/880 PASS** (sin cambio de conteo respecto al
  cierre de E7 — el cierre de la deuda TSC de E8 fue solo de tipos/mocks,
  no agregó ni quitó tests).
- `npx tsc --noEmit` → **0 errores** (deuda NC05 cerrada).
- `npm run lint` → sin errores nuevos (solo warnings preexistentes en
  archivos no tocados por E7/E8).
- `npm run build` → PASS.
- `git diff --check` → limpio (solo avisos benignos de fin de línea
  LF/CRLF, sin marcadores de conflicto ni errores de espacio en blanco).

## 10. Impacto en bases de datos y sincronización local/remota

Igual que lo reportado en `platform-phase-6e7-external-delivery.md` §8 — E8
no tocó `schema.prisma` ni generó migraciones adicionales. La migración
`20260921233552_add_platform_external_integration` (de E7) sigue aplicada
solo en local; remoto pendiente de que el usuario corra `prisma migrate
deploy` contra cada perfil remoto que deba usar `PlatformExternalIntegration`.

## 11. Flags finales

Ver bloque `FINAL FLAGS` en el reporte de la sesión (SubagentHandback) para
el detalle completo — resumen aquí:

```
DTE_DEDICATED_RUNTIME_CERTIFIED = YES (alcance: ciclo DTE completo E1-E7,
  NO el mismo alcance que DEDICATED_RUNTIME_V1, que sigue pendiente de un
  Cliente 3 end-to-end real)
TSC_FULL_PASS = YES
ALL_TESTS_PASS = YES
BUILD_PASS = YES
SCHEMA_CHANGE = NO (en E8 — el cambio de schema fue en E7)
MIGRATION_REQUIRED = NO (en E8)
READY_FOR_VI_F = YES
```
