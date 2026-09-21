# FASE VI-E7 — External Delivery / MariaDB Destination Isolation

Dedicated DB only. NO Shared/Hybrid. Cierra el último gap conocido del ciclo
DTE runtime-aware: la entrega externa a MariaDB (FE/CCFE/NC05 y
invalidación) tenía SOURCE parcialmente runtime-aware (solo
`deliver-dte-to-external-db.action.ts`) y DESTINATION 100% global
(`EXTERNAL_DTE_MARIADB_*` por variables de entorno, compartido por TODOS los
tenants del proceso).

## 1. Hallazgo inicial (bloqueante, resuelto por decisión explícita del usuario)

Auditoría (sesión previa) encontró:
- `deliver-invalidation-to-external-db.action.ts` seguía sobre `requireAdmin()`
  + Prisma global — el servicio ya aceptaba `client` runtime desde VI-E6B pero
  el entry point productivo nunca lo resolvía.
- `EXTERNAL_DTE_MARIADB_HOST/PORT/USER/PASSWORD/DATABASE/TABLE/*` se leían
  exclusivamente de `process.env` — un único destino para TODO el proceso
  Node, sin ningún mecanismo existente (código, runtime DB, ni modelo Control
  Plane) para aislarlo por organización. Cerrarlo sin invento de esquema no
  era posible — se reportó `E7_REQUIRES_SCHEMA_DECISION = YES` y se detuvo el
  trabajo antes de VI-E8.

El usuario tomó la decisión arquitectónica: **integración externa opcional
POR ORGANIZACIÓN, modelada en el Control Plane** (no en runtime DB, no en
`PlatformDatabaseProfile`, no Shared/Hybrid). Esta fase implementa esa
decisión.

## 2. Modelo de datos nuevo

`PlatformExternalIntegration` (Control Plane, `prisma/schema.prisma`) —
genérico y liviano, extensible a futuras integraciones sin nueva migración
estructural (mismo criterio que `PlatformEntitlementDefinition.code`):

```
id, organization_id (FK PlatformOrganization), type (enum
PlatformExternalIntegrationType, arranca con DTE_MARIADB), label,
is_active, encrypted_payload, last_tested_at/last_test_status/
last_test_message, created_at/updated_at/created_by/updated_by
```

`@@unique([organization_id, type])` — como máximo una fila vigente por tipo
de integración por organización (mismo criterio "una config vigente" que el
resto de la plataforma; no se modela historial de configs deshabilitadas,
`is_active` + `updated_at` ya cubren auditoría básica).

`encrypted_payload` guarda el JSON completo de conexión
(host/port/database/user/password/table/invalidationTable/timeoutMs) cifrado
con `encryptJsonPayload`/`decryptJsonPayload` (`@/lib/security/encryption.ts`,
AES-256-GCM) — **mismo helper exacto que `PlatformDatabaseProfile
.encrypted_password`**, ninguna implementación nueva de cifrado.

Migración: `prisma/migrations/20260921233552_add_platform_external_integration/`
— puramente aditiva (1 tabla, 1 enum, 4 índices, 1 FK), sin cambios
destructivos.

## 3. Resolver de destino — única fuente de verdad

`resolveExternalDteMariaDbDestination()`
(`src/modules/commerce/dte/config/resolve-external-dte-destination.ts`) —
**el único mecanismo de resolución de destino**, reusado sin duplicar tanto
por entrega DTE normal como por entrega de invalidación.

Contrato:
- `organizationId` presente + fila activa → `CONFIGURED` (source:
  `ORGANIZATION`, payload descifrado).
- `organizationId` presente + fila inactiva → `DISABLED` (fail closed, nunca
  entrega).
- `organizationId` presente sin fila → `NOT_CONFIGURED` **siempre**, incluso
  con `allowLegacyEnvFallback: true` (el fallback legado NUNCA sustituye una
  organización administrada por Platform sin integración propia).
- `organizationId` null (sin `PlatformOrganization` mapeada — ERP
  standalone/autoalojado) + `allowLegacyEnvFallback: true` + env completo →
  `CONFIGURED` (source: `PLATFORM_NATIVE_LEGACY_ENV`). Razonamiento: en ese
  caso el despliegue físico completo pertenece a un solo tenant, así que el
  env ya es "por organización" por construcción (no hay otro tenant en el
  mismo proceso que pueda recibir el cruce).
- `organizationId` null + `allowLegacyEnvFallback: false` (RUNTIME_CLIENT) →
  `NOT_CONFIGURED` siempre, JAMÁS cae al env aunque esté completo.

`organizationId`/`allowLegacyEnvFallback` se resuelven **server-side** en
`requireRuntimeDteWriteAccess()`
(`src/modules/commerce/dte/runtime/require-runtime-dte-write-access.ts`),
NUNCA aceptados del browser:
- Modo runtime ("Operar como cliente"): `organizationId = profile
  .organizationId` (siempre presente), `allowLegacyEnvFallback = false`
  SIEMPRE.
- Modo normal: `organizationId` resuelto por `tenant_id` contra
  `PlatformOrganization` (Control Plane), `allowLegacyEnvFallback = true`.

## 4. Entry points migrados

- `deliver-dte-to-external-db.action.ts` / `.service.ts` — ya usaba
  `requireRuntimeDteWriteAccess` (fase previa); ahora también pasa
  `organizationId`/`allowLegacyEnvFallback` al servicio, que resuelve destino
  vía el resolver en vez de `getExternalDteMariaDbConfig()` directo.
- `deliver-invalidation-to-external-db.action.ts` — **migrado en esta sesión
  del patrón `requireAdmin()` + Prisma global al mismo
  `requireRuntimeDteWriteAccess("DELIVER_EXTERNAL")`** usado por la entrega
  DTE normal (misma allowlist, sin ampliarla). Servicio actualizado igual que
  el de DTE.
- `dev/verify-fse14-e2e-local.ts` (script manual, DEV_ONLY) — actualizado
  solo para compilar (`organizationId: null, allowLegacyEnvFallback: true`,
  preserva su comportamiento legado de env directo para pruebas locales).

## 5. Política Support Session — preservada, no ampliada

`RUNTIME_DTE_WRITE_ALLOWLIST = ["DELIVER_EXTERNAL"]` — sin cambios. Sigue
exigiendo `requireSuperAdmin()` + `confirmed: true` explícito (diálogo de
confirmación en UI) + auditoría en `PlatformDeploymentLog`
(`recordRuntimeDteWriteAudit`). Test de regresión explícito en
`require-runtime-dte-write-access.test.ts`.

## 6. Legado por variables de entorno — auditoría de usos

| Archivo | Clasificación | Nota |
|---|---|---|
| `config/external-dte-mariadb.config.ts` | `PLATFORM_NATIVE_LEGACY` | Solo leído por el resolver, rama fallback (`organizationId=null` + `allowLegacyEnvFallback=true`) |
| `config/resolve-external-dte-destination.ts` | `PLATFORM_NATIVE_LEGACY` | Uso controlado — ver contrato arriba |
| `services/deliver-dte-to-external-db.service.ts` | — | Ya NO lee env directo; resuelto vía resolver |
| `services/deliver-invalidation-to-external-db.service.ts` | — | Ídem |
| `adapters/external-dte-mariadb.adapter.ts` | neutral | No lee env — recibe `config` ya resuelto (org o legado); mensajes de error mencionan nombres de env solo para el caso legado |
| `dev/verify-fex11-mariadb-delivery-local.ts` | `DEV_ONLY` | Script manual de verificación local, no reachable en producción, no tocado |

`RUNTIME_CLIENT_EXTERNAL_DELIVERY_CAN_USE_GLOBAL_ENV_DESTINATION = NO` —
certificado por test (`allowLegacyEnvFallback` SIEMPRE `false` en modo
runtime, verificado en `require-runtime-dte-write-access.test.ts` y
`resolve-external-dte-destination.test.ts`).

## 7. Tests nuevos (17)

- `resolve-external-dte-destination.test.ts` (6) — round-trip de cifrado
  REAL (AES-256-GCM, sin mockear `@/lib/security/encryption`), `DISABLED`,
  `NOT_CONFIGURED` (org resuelta sin fila, incluso con fallback permitido),
  fallback legado (org null + allowLegacyEnvFallback true), RUNTIME_CLIENT
  nunca cae al legado, **aislamiento cruzado A/B** (resolver(A) nunca
  retorna el destino de B).
- `deliver-dte-to-external-db.service.cross-tenant.test.ts` (3) — **STEP 9
  obligatorio**: SOURCE (client runtime) + DESTINATION (config por
  organización) probados JUNTOS en la misma llamada; `NOT_CONFIGURED`/
  `DISABLED` nunca invocan el adapter.
- `deliver-invalidation-to-external-db.service.cross-tenant.test.ts` (2) —
  mismo resolver, destino correcto por organización, nunca fallback ajeno.
- `require-runtime-dte-write-access.test.ts` (6) — allowlist sin ampliar,
  resolución de `organizationId` en ambos modos, `allowLegacyEnvFallback`
  correcto por modo, regresión de `confirmed`.
- `deliver-invalidation-to-external-db.action.test.ts` (6, sesión previa) —
  source isolation del entry point migrado.

Ninguna llamada real a MariaDB/red en ningún test — adapter siempre mockeado.

## 8. Impacto en bases de datos y sincronización local/remota

- `schema.prisma` modificado: sí (`PlatformExternalIntegration` +
  `PlatformExternalIntegrationType`, relación en `PlatformOrganization`).
- Migración nueva: sí — `20260921233552_add_platform_external_integration`.
- Aplicada a: **`DATABASE_URL` local únicamente**
  (`postgresql://.../TrustmeDB` en `.env`, que en este entorno también es
  `DIRECT_URL` — ambas apuntan a la misma base local).
- Remoto/Supabase: **NO tocado, NO desplegado**.
- Local y remoto pueden quedar desincronizados si el remoto usa un
  `DIRECT_URL` distinto — el usuario debe correr `npx prisma migrate deploy`
  (o el runner de migraciones runtime correspondiente) contra cada
  `PlatformDatabaseProfile`/base remota que deba recibir esta migración antes
  de operar `PlatformExternalIntegration` allí.
- Comandos para alinear: `npx prisma migrate status` (verificar pendientes),
  `npx prisma migrate deploy` contra el entorno remoto correspondiente.
- Ningún dato existente fue tocado (tabla nueva, sin backfill).

## 9. Flags de cierre

```
DTE_EXTERNAL_DELIVERY_RUNTIME_READY = YES
DTE_INVALIDATION_EXTERNAL_DELIVERY_RUNTIME_READY = YES
DTE_EXTERNAL_DELIVERY_SOURCE_SAME_RUNTIME_DB = YES
DTE_EXTERNAL_DESTINATION_TENANT_SAFE = YES
DTE_EXTERNAL_DESTINATION_OPTIONAL_SAFE = YES
RUNTIME_CLIENT_EXTERNAL_DELIVERY_CAN_USE_GLOBAL_ENV_DESTINATION = NO
DTE_SUPPORT_DELIVER_EXTERNAL_POLICY_PRESERVED = YES
DTE_MARIADB_REAL_CALLS_PERFORMED = NO
SCHEMA_CHANGE = YES
MIGRATION_REQUIRED = YES (MIGRATION_CREATED = 20260921233552_add_platform_external_integration)
REMOTE_MIGRATION_APPLIED = NO
ALL_TESTS_PASS = YES (880/880 al cierre de E7)
BUILD_PASS = YES
E7_BLOCKERS = []
```
