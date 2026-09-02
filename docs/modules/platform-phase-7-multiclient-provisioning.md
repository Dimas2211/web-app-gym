# FASE 7 — Cierre: base operativa multi-cliente (provisioning)

Fecha: 01/09/2026.
Alcance: documentación, auditoría y checklist. **No se ejecutó ninguna
escritura de datos en esta fase** — ni control plane, ni runtime, ni
PRODUCTION. No se creó ningún cliente real nuevo, ninguna base real
nueva, ningún DTE, ninguna firma, ninguna transmisión, ningún delivery.

## 1. Resumen ejecutivo

FASE 7 cierra la **base operativa** para que Zolvi pueda manejar varios
clientes/organizaciones con su propia base runtime, perfil de conexión,
configuración DTE, firmador y módulos — sin todavía dar un modo editable
completo desde plataforma sobre cada pantalla del ERP (eso es la fase
siguiente, ver §16).

Hallazgo principal de la auditoría: **la plataforma ya tiene mucha más
infraestructura de provisioning de la que el flujo actual usa en la
práctica.** Existen piezas D0/C3/C4/C7/D1A/D1B (seguridad de ejecución,
preflight, inspector, tenant binding, seeds controlados de catálogo DTE
y fiscal config) que sí están cableadas a UI y son seguras de usar. Pero
el paso más crítico y más peligroso del alta de un cliente — crear el
tenant, la location y el usuario admin en la base runtime — **hoy solo
existe como script ad-hoc** (`prisma/seed-trustmedb.ts`), no como acción
de plataforma, no pasa por `evaluateDatabaseExecutionSafety` (D0), y no
está integrado con `PlatformDatabaseProfile`/Runtime Database Router.
Ese es el hueco principal que queda documentado para la fase de
automatización (§14).

## 2. Qué quedó listo (confirmado por auditoría, no por promesa)

Multi-cliente **sí** puede operar hoy con estas piezas, cada una ya
probada o ya cableada a UI real:

| Pieza | Estado |
|---|---|
| `PlatformOrganization` (alta, edición, estado, licencia, módulos) | Cerrado — CRUD completo en `/dashboard/platform/organizations` |
| `PlatformDatabaseProfile` (alta, edición, activar/desactivar, test de conexión) | Cerrado — `/dashboard/platform/database-profiles` |
| Runtime Database Router (`withRuntimePrisma`, `createRuntimePrismaClient`) | Cerrado y probado end-to-end con TrustMe (FSE14 TEST) |
| Sesión runtime "Operar como cliente" (lectura) | Cerrado — 4+ pantallas runtime-aware en lectura, ver §7 |
| Delivery externo DTE runtime-aware desde UI | Cerrado — primer slice de escritura runtime-aware con allowlist (bloque anterior a este) |
| Preflight de base cliente (C3) | Cerrado — `runDatabaseProfilePreflightAction`, solo lectura |
| Inspector de perfil (C4) | Cerrado — `inspectDatabaseProfileAction`, solo lectura |
| Tenant Binding & Auto-Discovery (C7) | Cerrado — `bindOrganizationTenantAction` + `detectDatabaseProfileTenantAction`, con confirmación textual + admin key |
| Seed controlado de catálogo DTE (D1A) | Cerrado — `runDatabaseProfileDteCatalogSeedAction`, bloqueado en PRODUCTION, pasa por D0 |
| Seed controlado de fiscal config (D1B) | Cerrado — `runDatabaseProfileTenantFiscalConfigAction`, bloqueado en PRODUCTION, pasa por D0 |
| Signer issuer-aware (`resolveDteSignerConfigForIssuer`) | Cerrado — `DteCredential` por `issuer_config_id` con fallback global intacto |
| Checklist de deployment manual (11 pasos) | Cerrado como *tracker* — `PlatformDeploymentJob` en modo MANUAL, no ejecuta infraestructura |

## 3. Qué quedó probado con TrustMe

TrustMe es el **primer y único** cliente runtime validado end-to-end:

- Perfil runtime registrado y con conexión probada.
- Tenant vinculado (`organization.tenant_id`) vía Tenant Binding.
- Dashboard runtime-aware en lectura confirmado en `/dashboard/products`,
  `/dashboard/customers`, `/dashboard/suppliers`, `/dashboard/inventory`,
  `/dashboard/dte/outgoing`.
- Ciclo fiscal completo FSE14 TEST sobre runtime: CREATE → GENERATE →
  VALIDATE → SIGN → TRANSMIT MH TEST → `ACCEPTED` → DELIVER MariaDB
  externa. Ver `dte-trustme-fse14-test-closure.md`.
- Delivery externo runtime-aware desde UI (`/dashboard/dte/outgoing`),
  allowlisted a esa única acción, con auditoría en `PlatformDeploymentLog`.
- `DteCredential` TEST y PRODUCTION de TrustMe **ya existen** en su base
  (PRODUCTION es antecedente conocido previo a esta fase, no creado por
  Zolvi — ver `dte-trustme-production-readiness.md` §2.4).
- PRODUCTION de TrustMe: **solo auditado en lectura**, nunca escrito en
  esta ni en la fase anterior. FE01 `OBSERVED` de producción sigue como
  pendiente fiscal separado con TrustMe/contador — no se tocó.

Ningún segundo cliente runtime fue creado, ni siquiera parcialmente, en
ninguna fase hasta ahora.

## 4. Qué significa "control plane"

Es la base de la propia app Zolvi (`DATABASE_URL`/`DIRECT_URL` de la
instancia que corre el Platform Admin). Contiene únicamente entidades
`PlatformX`: `PlatformOrganization`, `PlatformDatabaseProfile`,
`PlatformDeploymentLog`, `PlatformProvisioningLog`, `PlatformModule`,
`PlatformPlan`, `PlatformVertical`, `PlatformBranding`,
`PlatformDeploymentJob`, más los usuarios que administran la
plataforma. **Nunca** debe usarse para leer/escribir datos operativos de
un cliente (products, sales, dte, etc.) — esa separación está impuesta
por convención de nombres (`controlPlanePrisma` es un alias explícito
del mismo Prisma singleton, para dejar clara la intención en el código
que lo usa) y reforzada por el hecho de que ambas bases usan el mismo
`schema.prisma`, así que el error más fácil de cometer es leer/escribir
una tabla operativa (`Sale`, `DteOutgoingDocument`, etc.) contra el
control plane por accidente — el patrón `withRuntimePrisma` existe
precisamente para evitarlo.

## 5. Qué significa "runtime DB"

Es la base Postgres propia de **cada cliente** (ej. TrustMe), resuelta
dinámicamente en cada request por el Runtime Database Router a partir
de un `PlatformDatabaseProfile` (credenciales cifradas AES-256-GCM en el
control plane). Usa el mismo `schema.prisma` que el control plane y que
cualquier instancia GYM directa — es la misma aplicación, apuntando a
una base distinta. El acceso siempre pasa por:

- `withRuntimePrisma` / `withOrganizationRuntimePrisma` — para
  operaciones puntuales, con `$disconnect()` garantizado.
- `resolveEffectiveTenantContext` / `resolveEffectiveApiContext` — para
  páginas y route handlers runtime-aware, resuelve `tenantId` +
  `PrismaClient` + metadata de sesión runtime.
- `withRuntimePrismaForInspection` — variante sin exigir `is_active`
  para el Inspector (C4).

Nunca se abre una conexión runtime sin pasar por uno de estos tres
puntos, y nunca se cachea un `PrismaClient` runtime entre requests (ver
TODO explícito en `runtime-database-router.ts`).

## 6. Qué significa "app directa por cliente"

Es el modelo alternativo, ya soportado por el mismo código sin cambios:
una instancia de la aplicación desplegada exclusivamente para un
cliente, con su propio `DATABASE_URL`/`DIRECT_URL` apuntando
**directamente** a la base de ese cliente. En ese modo, el Prisma
Client global (`@/lib/db/prisma`) **es** la runtime DB — no hay control
plane, no hay Runtime Database Router, no hay sesión "Operar como
cliente" (la cookie nunca se activa porque no hay `PlatformOrganization`
que resolver).

Esto es exactamente lo que ocurre hoy en el entorno local usado en
`dte-trustme-production-readiness.md` §2.6: `DATABASE_URL`/`DIRECT_URL`
apuntan directo a `TrustmeDB`, sin fila en `platform_organizations` — el
Runtime Database Router simplemente no aplica en ese contexto.

**Variables que requiere:** `DATABASE_URL`, `DIRECT_URL` (si se usa
`directUrl` en el datasource de Prisma), más todas las variables de
firmador/MH/MariaDB específicas de ese cliente (`DTE_SIGNER_URL_TEST`,
`DTE_SIGNER_URL_PRODUCTION`, `DTE_SIGNER_API_KEY`, `DTE_MH_*`,
`EXTERNAL_DTE_MARIADB_*`), y `PLATFORM_ENCRYPTION_KEY` solo si esa
instancia también expone pantallas de plataforma.

**Riesgos:**
- No hay banner "Operando como cliente" ni ningún indicador — la
  instancia entera *es* ese cliente, así que un error de configuración
  de entorno (ej. apuntar por error a `DATABASE_URL` de otro cliente)
  no tiene la protección visual del banner runtime.
- Las credenciales de ese cliente viven en variables de entorno del
  proceso, no cifradas en un `PlatformDatabaseProfile` — la superficie
  de exposición es distinta (quien tenga acceso al proceso/`.env` tiene
  la contraseña en texto plano).
- No hay Tenant Binding, preflight ni inspector centralizados — cada
  instancia se audita por separado, manualmente.

**Cuándo conviene:** cuando el cliente necesita aislamiento físico total
(su propio deployment, su propio dominio, sin dependencia del control
plane de Zolvi para operar) o cuando el modelo runtime compartido no
aplica todavía (ej. antes de que ese cliente tenga su
`PlatformDatabaseProfile` registrado).

**Qué revisar antes de usarlo operativamente:** que las variables de
entorno correctas estén cargadas (no las de otro cliente ni las de
TEST en un despliegue que debería ser PRODUCTION), que `DTE_SIGNER_URL_*`
apunte al firmador correcto para ese certificado/ambiente (ver
`dte-signer-routing-runbook.md`), y que no haya ningún
`PlatformDatabaseProfile` en el control plane apuntando a la misma base
con `is_active: true` simultáneamente (evitaría ambigüedad si alguna vez
se decide migrar ese cliente al modelo runtime compartido).

No se implementó ningún deployment nuevo en esta fase — esto es
documentación de la opción ya existente, no una pieza nueva.

## 7. Cómo se opera TrustMe hoy

### A. TrustMe desde Platform Admin / Runtime Database Router

**Qué ya se puede ver:**
- Perfil de conexión en `/dashboard/platform/database-profiles` (label,
  ambiente, estado de la última prueba de conexión — nunca la
  contraseña).
- Estado de organización/licencia/módulos activos en
  `/dashboard/platform/organizations`.
- Dashboard operativo runtime-aware en modo lectura: products,
  customers, suppliers, inventory, `/dashboard/dte/outgoing` (incluye
  detalle fiscal, logs de transmisión, acciones disponibles calculadas
  en servidor).

**Qué se puede auditar (solo lectura, sin banner de escritura):**
- Preflight de la base runtime (C3) — schema, catálogos base, bloqueos.
- Inspector de perfil (C4) — conteos y muestras básicas sin exponer
  datos sensibles.
- `prisma/scripts/audit-trustme-dte-runtime.ts` — auditoría dirigida al
  runtime DTE (conexión, esquema, datos base) antes de operar.

**Qué acciones específicas ya existen (con ejecución real):**
- Entrar/salir del modo "Operar como cliente" (`enterClientRuntimeAction`
  / `exitClientRuntimeAction`), siempre `readOnly: true`.
- Enviar DTE externo (`DELIVER_EXTERNAL`) desde
  `/dashboard/dte/outgoing` en modo runtime — única escritura
  allowlisted, requiere `super_admin` + confirmación explícita + queda
  auditada en `PlatformDeploymentLog`.
- Seed de catálogo DTE (D1A) y de fiscal config (D1B) contra el perfil
  runtime — bloqueados en PRODUCTION, con dry-run obligatorio antes del
  real run.
- Tenant Binding (`bindOrganizationTenantAction`) — ya usado para ligar
  `organization.tenant_id` de TrustMe.

**Qué sigue siendo solo lectura:**
- Todo lo demás del dashboard operativo (sales, purchases, cash, resto
  de acciones DTE: generar JSON, validar schema, firmar, transmitir,
  crear NC, invalidar) — sigue en Prisma global cuando se navega esas
  pantallas en modo runtime; el guard runtime-aware de escritura
  (`requireRuntimeDteWriteAccess`) solo tiene `DELIVER_EXTERNAL` en su
  allowlist.
- El firmado/transmisión real del ciclo DTE en runtime **solo** corre
  hoy vía el runner de soporte `fse14-test-purchase-runner.ts`, no desde
  UI operativa.

**Qué no debe ejecutarse todavía:**
- Cualquier acción de escritura runtime fuera de la allowlist actual
  (`DELIVER_EXTERNAL`) — no existe mecanismo para pedirlo desde la UI,
  y no debe forzarse manualmente.
- `SEED_TENANT_BASE` / `RUN_MIGRATIONS` contra el runtime de TrustMe —
  no tienen runner implementado todavía (ver §10, fila correspondiente);
  solo existen como tipo/checklist, no como acción ejecutable.
- Cualquier operación DTE de PRODUCTION de TrustMe.

### B. TrustMe como app/deployment directo apuntando a TrustMeDB

Aplica la explicación general de §6. Concretamente para TrustMe: el
entorno local usado para la auditoría de `dte-trustme-production-readiness.md`
tiene `DATABASE_URL`/`DIRECT_URL` apuntando directo a `TrustmeDB`, sin
fila en `platform_organizations` — en ese checkout, el control plane no
aplica y toda operación (incluida la auditoría PRODUCTION de esa fase)
se hizo contra el Prisma Client global directamente.

Esto significa que **hoy conviven dos formas válidas de operar sobre la
misma base física de TrustMe**: vía Runtime Database Router (cuando el
proceso corre como la plataforma multi-cliente con su propio
`DATABASE_URL` de control plane) o vía app directa (cuando el proceso
corre con `DATABASE_URL` apuntando directo a TrustMe). **No deben usarse
simultáneamente contra la misma base productiva sin dejar explícito cuál
es la fuente de verdad operativa** — dos procesos escribiendo
correlativos DTE contra la misma base sin coordinación es el riesgo
concreto más alto de este punto.

## 8. Auditoría detallada — Tarea 1

| Pieza | Estado real | Evidencia |
|---|---|---|
| `PlatformOrganization` | Cerrado, CRUD completo | `create-platform-organization.action.ts`, `update-platform-organization.action.ts`, `change-organization-status.action.ts` |
| `PlatformDatabaseProfile` | Cerrado, CRUD + test de conexión | `create-database-profile.action.ts`, `update-database-profile.action.ts`, `test-database-profile-connection.action.ts`, `set-database-profile-active.action.ts` |
| Runtime Database Router | Cerrado y probado con TrustMe | `runtime-database-router.ts`, cierre FSE14 TEST |
| Runtime session "Operar como cliente" | Cerrado — solo lectura + 1 acción allowlisted | `runtime-session.ts` (`readOnly: true` literal), `require-runtime-dte-write-access.ts` |
| Tenant/location en runtime | Resuelto por convención pragmática, no por selector real | `resolveRuntimeFirstLocationId` toma la primera location activa alfabéticamente — no hay selector de sucursal en modo runtime todavía |
| `DteIssuerConfig` TEST/PRODUCTION | Modelo maduro, ya usado por TrustMe en ambos ambientes | Confirmado en `dte-trustme-production-readiness.md` §2.1 |
| `DteCredential` TEST/PRODUCTION | Modelo reutilizado para signer profile por `issuer_config_id`, ya con datos de TrustMe en ambos ambientes | `dte-signer-multitenant-block.md`, `dte-trustme-production-readiness.md` §2.4 |
| `DteCorrelative` | Cerrado, con baseline de migración externa soportado | `dte-correlatives-onboarding.md`; TrustMe PRODUCTION ya tiene consumo real (§2.2 del doc de production readiness) |
| Preflight global/runtime | Cerrado — dos variantes: operativo (`run-database-preflight.action.ts`, resuelve tenant desde `PlatformOrganization`) y por perfil (`run-database-profile-preflight.action.ts`, runtime directo) | Ambos solo lectura |
| Inspector por perfil (C4) | Cerrado | `inspect-database-profile.action.ts` + `withRuntimePrismaForInspection` |
| Scripts de soporte/provisioning existentes | Ricos pero dispersos: runners de seed DTE (D1A/D1B), runners de soporte DTE (create/generate/sign/transmit), auditoría runtime, health-check firmador, registro de credencial firmador | Todos server-only, ninguno wireado a un flujo único de "alta de cliente" |
| Qué existe para crear nuevas organizaciones/clientes | Alta de `PlatformOrganization` + `PlatformDatabaseProfile` + Tenant Binding — sí, completo y seguro | — |
| Qué falta para crear/agregar nuevos clientes sin pasos manuales peligrosos | **Crear tenant + location + usuario admin en la base runtime** — hoy solo vía script ad-hoc (`prisma/seed-trustmedb.ts`), sin pasar por D0, sin usar `PlatformDatabaseProfile`/Runtime Router, sin dry-run, sin auditoría en `PlatformDeploymentLog`. También falta un runner real para `RUN_MIGRATIONS` contra un perfil runtime (hoy es un paso manual de checklist, no una acción) | `SEED_TENANT_BASE` y `RUN_MIGRATIONS` están **definidos como tipo y clasificados en la matriz de riesgo de D0** (`database-execution-safety.ts`) pero **no tienen runner/acción implementado** — son el hueco más importante encontrado en esta auditoría |

## 9. Flujo estándar de provisioning de nuevo cliente — Tarea 3

Numeración según el pedido original. Cada paso indica si ya es una
acción de plataforma real, un script manual existente, o un hueco sin
herramienta todavía.

| # | Paso | Cómo se hace hoy |
|---|---|---|
| 1 | Crear `PlatformOrganization` | ✅ Acción real — `createPlatformOrganizationAction`, UI en `/dashboard/platform/organizations/new` |
| 2 | Crear o registrar base runtime | ⚠️ Crear la base física (`CREATE DATABASE`) es manual (proveedor de hosting/Supabase); **registrar** el perfil ya apuntando a ella es acción real (`createDatabaseProfileAction`) |
| 3 | Aplicar migraciones a runtime si aplica | ❌ Manual — `npx prisma migrate deploy` ejecutado por un operador con acceso directo a `DATABASE_URL` de esa base; no hay runner de plataforma. Aparece solo como paso de checklist (`RUN_MIGRATIONS`) en el deployment manual, sin ejecutor |
| 4 | Seed mínimo seguro si aplica | ⚠️ Parcial — catálogo DTE (D1A) y fiscal config (D1B) sí tienen runner seguro; el resto de seeds base (`seed.base.ts`, `seed.catalogs.ts`, etc.) son scripts manuales sin wrapper de plataforma |
| 5 | Crear tenant | ❌ Manual — hoy es `prisma.gym.create(...)` dentro de un script ad-hoc (`prisma/seed-trustmedb.ts`), no una acción de plataforma |
| 6 | Crear location/sucursal | ❌ Manual — mismo script, `prisma.branch.create(...)` |
| 7 | Crear usuario admin del cliente | ❌ Manual — mismo script, `prisma.user.createMany(...)` con password hasheado inline |
| 8 | Registrar `PlatformDatabaseProfile` | ✅ Acción real — `createDatabaseProfileAction` |
| 9 | Probar conexión | ✅ Acción real — `testDatabaseProfileConnectionAction` |
| 10 | Ejecutar preflight | ✅ Acción real — `runDatabaseProfilePreflightAction` |
| 11 | Resolver bloqueantes | ⚠️ Parcial — el preflight reporta bloqueantes; la corrección en sí depende de qué bloqueante sea (algunos con `database-remediation-planner.ts`, otros manuales) |
| 12 | Configurar módulos habilitados | ✅ Acción real — `activateOrganizationModuleAction` / `deactivateOrganizationModuleAction` |
| 13 | Configurar `DteIssuerConfig` TEST | ⚠️ Existe UI (`/dashboard/settings/dte` → `DteIssuerConfigFormDialog`), pero corre sobre Prisma global — **no es runtime-aware**; para un cliente runtime hay que ejecutarla estando desplegado como app directa contra esa base, o esperar la subfase de escrituras runtime-aware ampliadas |
| 14 | Configurar `DteCredential` TEST | ⚠️ Mismo caso — UI existe (`DteCredentialFormDialog`) pero no es runtime-aware; ver §6 de `dte-signer-multitenant-block.md` |
| 15 | Configurar firmador TEST | ❌ Manual — variables de entorno (`DTE_SIGNER_URL_TEST`, `DTE_SIGNER_API_KEY`) o, preferible, `DteCredential.signerUrl/signerApiKey` por `issuer_config_id` (issuer-aware, ver `dte-signer-multitenant-block.md`) |
| 16 | Health check firmador TEST | ✅ Script real — `prisma/scripts/health-check-dte-signer.ts --environment TEST`, solo lectura (GET `/status`) |
| 17 | Certificación/pruebas MH TEST si aplica | ✅ Runner real probado — `fse14-test-purchase-runner.ts` (y equivalentes de soporte para FE01/CCFE03/NC05 vía Support Session) |
| 18 | Preparar `DteIssuerConfig` PRODUCTION | ⚠️ Mismo caso que 13, para PRODUCTION — además sujeto a la regla de "no usar producción para pruebas" |
| 19 | Preparar `DteCredential` PRODUCTION | ⚠️ Mismo caso que 14 — `register-dte-signer-credential.ts --environment PRODUCTION` ya soporta INSPECT y REGISTER (DRY_RUN sin restricción, EXECUTE con confirmación textual propia) |
| 20 | Configurar firmador PROD | ❌ Manual, mismo mecanismo que 15 pero apuntando al firmador PROD real del cliente — **requiere aprobación explícita antes de EXECUTE** |
| 21 | Checklist primer DTE real | ✅ Ya existe — §5 de `dte-trustme-production-readiness.md`, reutilizable para cualquier cliente nuevo |
| 22 | Checklist MariaDB externa si aplica | ⚠️ Parcial — `getExternalDteMariaDbConfig()` es global por proceso (una sola integración externa por deployment), no por `issuer_config_id`; para un segundo cliente con su propia MariaDB externa hace falta diseño adicional (hoy asumiría la misma config de TrustMe) |
| 23 | Documentar responsables y aprobaciones | ❌ No existe plantilla formal — se ha hecho como sección de cierre en cada doc de fase (ver este mismo documento como ejemplo) |

## 10. Matriz de automatización existente/faltante — Tarea 4

| Necesidad | Existe | Archivo | Seguro | Control plane / Runtime | Requiere aprobación | Falta UI/admin |
|---|---|---|---|---|---|---|
| Crear `PlatformOrganization` | Sí | `create-platform-organization.action.ts` | Sí | Control plane | No | No — ya en UI |
| Crear `PlatformDatabaseProfile` | Sí | `create-database-profile.action.ts` | Sí (cifra password, nunca lo devuelve) | Control plane | No | No — ya en UI |
| Test de conexión | Sí | `test-database-profile-connection.action.ts` | Sí (`SELECT 1`, sanitiza error) | Runtime (efímero) | No | No |
| Preflight (por perfil) | Sí | `run-database-profile-preflight.action.ts` | Sí, solo lectura | Runtime (efímero) | No | No |
| Preflight (operativo) | Sí | `run-database-preflight.action.ts` | Sí, solo lectura | Runtime vía tenant | No | No |
| Inspector | Sí | `inspect-database-profile.action.ts` | Sí, solo lectura, `try/catch` por bloque | Runtime (efímero) | No | No |
| Tenant Binding | Sí | `bind-organization-tenant.action.ts` | Sí — confirmación textual + admin key | Control plane (escribe `tenant_id`) | Sí (confirmación + `PLATFORM_TENANT_BINDING_ADMIN_KEY`) | No |
| Auto-discovery de tenant | Sí | `detect-database-profile-tenant.action.ts` | Sí, solo lectura, no asigna | Runtime (efímero) | No | No |
| Seed tenant/location/admin | **No** | Solo script ad-hoc `prisma/seed-trustmedb.ts` | **No** — no pasa por D0, password hardcodeado en el script, sin dry-run | Ninguno — usa `new PrismaClient()` contra `DATABASE_URL` del proceso, no `PlatformDatabaseProfile` | Sí, siempre debería | **Sí — es el hueco más importante** |
| Migraciones contra runtime | **No** | Solo paso de checklist (`RUN_MIGRATIONS`) sin ejecutor | N/A | N/A | Sí (clasificado `HIGH` en D0) | Sí |
| Seed catálogo DTE | Sí | `run-database-profile-dte-catalog-seed.action.ts` | Sí — D0, bloqueado en PRODUCTION, dry-run obligatorio antes | Runtime (efímero) | Sí (confirmación textual) | No |
| Seed fiscal config | Sí | `run-database-profile-tenant-fiscal-config.action.ts` | Sí — mismas garantías que el anterior | Runtime (efímero) | Sí (confirmación textual) | No |
| Configurar `DteIssuerConfig` | Parcial | `create-dte-issuer-config.action.ts` / `update-dte-issuer-config.action.ts` / `upsert-dte-issuer-config-for-client.action.ts` | Sí para Prisma global | **Solo Prisma global — no runtime-aware** | No (ya requiere `requireAdmin`) | Sí — falta variante runtime-aware |
| Configurar `DteCredential` | Parcial | `upsert-dte-credential.action.ts` | Sí para Prisma global | **Solo Prisma global — no runtime-aware** | No | Sí — falta variante runtime-aware |
| Registrar firmador (signer profile) | Sí (script) | `prisma/scripts/register-dte-signer-credential.ts` | Sí — INSPECT/DRY_RUN siempre seguros, EXECUTE con confirmación textual propia por ambiente | Runtime vía Router | Sí para EXECUTE (más estricta en PRODUCTION) | Sí — hoy es CLI, no UI |
| Health check firmador | Sí (script) | `prisma/scripts/health-check-dte-signer.ts` | Sí — solo GET `/status`, no firma ni transmite | Ninguno (HTTP directo al firmador) | Sí en PRODUCTION (aprobación explícita antes de ejecutar) | Sí — hoy es CLI, no UI |
| Registrar módulos por organización | Sí | `activate-organization-module.action.ts` / `deactivate-organization-module.action.ts` | Sí | Control plane | No | No — ya en UI |

## 11. Riesgos

1. **Provisioning de tenant/location/admin sin control de seguridad**: el
   único camino existente (`seed-trustmedb.ts`) no pasa por D0, no
   registra auditoría, y contiene contraseñas hasheadas inline en el
   script — repetirlo para un cliente nuevo sin envolverlo en un runner
   controlado es el riesgo más alto de este bloque.
2. **Doble vía de acceso a la misma base física** (Runtime Router vs.
   app directa) sin un mecanismo que impida usarlas simultáneamente
   contra el mismo cliente — riesgo de correlativos DTE duplicados o
   condiciones de carrera si dos procesos escriben a la vez.
3. **`DteIssuerConfig`/`DteCredential` no son runtime-aware desde UI** —
   para un cliente runtime nuevo, cargar su configuración fiscal
   requiere desplegarlo temporalmente como app directa o escribir
   manualmente contra el runtime vía script — ambos caminos son más
   frágiles que una UI runtime-aware dedicada.
4. **MariaDB externa es una única configuración global por proceso** —
   un segundo cliente con su propia integración externa no puede
   convivir con TrustMe en el mismo deployment sin rediseño.
5. **Selector de location en modo runtime es implícito** (primera
   location alfabética) — no hay selector real; si un cliente runtime
   tiene más de una sucursal, la UI runtime-aware de lectura sigue
   mostrando solo la "representativa", no permite elegir.
6. **Nivel intermedio tenant/organización del signer profile no existe**
   — documentado como pendiente en `dte-signer-multitenant-block.md`,
   relevante en cuanto haya un segundo cliente runtime con más de un
   emisor.
7. **`RUN_MIGRATIONS` contra un perfil runtime no tiene runner** — cada
   alta de cliente nuevo depende de que un operador humano ejecute
   `prisma migrate deploy` manualmente con las credenciales correctas;
   un error de ambiente (ej. apuntar a la base equivocada) no tiene
   ninguna barrera automática todavía.

## 12. Qué falta para automatización completa

1. Un runner `SEED_TENANT_BASE` real: crea tenant + location + admin
   contra un `PlatformDatabaseProfile`, pasando por
   `evaluateDatabaseExecutionSafety` (D0), con dry-run obligatorio,
   confirmación textual, y registro en `PlatformDeploymentLog` — mismo
   patrón que D1A/D1B, aplicado al paso que hoy es el script ad-hoc.
2. Un runner `RUN_MIGRATIONS` (o documentar explícitamente que
   permanece manual por diseño, dado que D0 ya lo clasifica `HIGH` y
   bloqueado en PRODUCTION) — al menos para LOCAL/SANDBOX/TEST.
3. Variantes runtime-aware de `create-dte-issuer-config`,
   `update-dte-issuer-config`/`upsert-dte-issuer-config-for-client` y
   `upsert-dte-credential`, con el mismo patrón de guard allowlisted que
   ya existe para `DELIVER_EXTERNAL`.
4. Convertir `register-dte-signer-credential.ts` y
   `health-check-dte-signer.ts` (hoy CLI) en acciones de plataforma con
   UI, conservando exactamente las mismas garantías (INSPECT/DRY_RUN sin
   restricción, EXECUTE con confirmación textual propia por ambiente).
5. Selector real de location en modo runtime (reemplazar
   `resolveRuntimeFirstLocationId` por un selector explícito cuando el
   cliente tenga más de una sucursal).
6. Diseño de MariaDB externa por `issuer_config_id`/organización en vez
   de config global por proceso, si se planea un segundo cliente con
   integración externa propia.
7. Plantilla formal de "responsables y aprobaciones" por alta de
   cliente (hoy ad-hoc en cada doc de cierre).

## 13. Checklist técnico (alta de cliente — resumen operable)

1. ☐ `PlatformOrganization` creada y en estado válido.
2. ☐ Base runtime creada/disponible (manual).
3. ☐ Migraciones aplicadas contra esa base (manual, `prisma migrate deploy`).
4. ☐ `PlatformDatabaseProfile` registrado, `is_active: true`.
5. ☐ Test de conexión exitoso.
6. ☐ Preflight ejecutado — cero bloqueantes `CRITICAL`.
7. ☐ Tenant + location + admin creados en runtime (hoy manual/script —
   ver riesgo §11.1, envolver en runner antes de repetir).
8. ☐ Tenant Binding (`organization.tenant_id`) confirmado.
9. ☐ Módulos requeridos activados en `PlatformOrganizationModule`.
10. ☐ Seed de catálogo DTE ejecutado (D1A) si el cliente usa DTE.
11. ☐ Seed de fiscal config ejecutado (D1B) si el cliente usa DTE.

## 14. Checklist DTE (por cliente/ambiente)

1. ☐ `DteIssuerConfig` TEST creado y activo.
2. ☐ `DteCredential` TEST registrado (`INSPECT` antes de confiar en uno
   existente).
3. ☐ Firmador TEST resuelto — issuer-aware si `DteCredential.signerUrl`
   está configurado, o variable global `DTE_SIGNER_URL_TEST` como
   fallback.
4. ☐ Health check firmador TEST OK.
5. ☐ Ciclo CREATE→GENERATE→VALIDATE→SIGN→TRANSMIT→DELIVER→VERIFY
   probado en TEST al menos una vez (vía runner de soporte).
6. ☐ `DteIssuerConfig` PRODUCTION preparado (sin transmitir nada).
7. ☐ `DteCredential` PRODUCTION preparado/verificado con `INSPECT`.
8. ☐ Firmador PROD configurado — health check **solo con aprobación
   explícita**.
9. ☐ Checklist de primer DTE productivo real completado (ver §5 de
   `dte-trustme-production-readiness.md`) antes de la primera
   transmisión PRODUCTION.

## 15. Checklist MariaDB externa (si el cliente usa integración externa)

1. ☐ Confirmar si el cliente nuevo requiere su propia integración
   MariaDB externa o comparte la ya configurada — hoy es **una config
   global por proceso** (riesgo §11.4), no aísla por cliente.
2. ☐ Variables de entorno (`EXTERNAL_DTE_MARIADB_HOST/PORT/USER/PASSWORD/DATABASE/TABLE`)
   correctas para ese cliente.
3. ☐ Conexión probada antes del primer delivery real (sin usar
   producción DTE para la prueba — usar un documento TEST).
4. ☐ Tabla destino existente y con el esquema esperado por
   `build-external-dte-payload.service.ts`.
5. ☐ Delivery runtime-aware confirmado disponible desde
   `/dashboard/dte/outgoing` si el cliente opera vía Runtime Database
   Router (ver bloque anterior de esta fase).

## 16. Próxima fase — pendiente futuro, no implementada aquí

Después de cerrar provisioning/multi-cliente (esta fase), la siguiente
fase debe trabajar **operación editable completa desde plataforma**:
revisar y migrar, módulo por módulo, las Server Actions/servicios que
hoy solo funcionan con Prisma global para que acepten el patrón
runtime-aware ya validado (allowlist + guard + auditoría), en:

- products
- customers
- suppliers
- purchases
- sales
- inventory
- cash
- DTE (generate/validate/sign/transmit, más allá del delivery externo
  ya cerrado)

Ninguno de esos módulos se tocó en este bloque. Esta sección es
únicamente el registro de que esa fase existe como pendiente, no su
diseño ni su implementación.

## 17. Impacto en bases de datos y sincronización local/remota

- No hubo cambios en `schema.prisma`.
- No se generó ninguna migración.
- No se aplicó ninguna migración.
- No se escribió ningún dato en ninguna base (control plane, runtime
  TrustMe TEST, runtime TrustMe PRODUCTION, ni ninguna base local).
- No aplica sincronización local/remoto en esta fase — es un bloque
  exclusivamente de auditoría y documentación.

## 18. Confirmaciones de seguridad

- No se creó ningún DTE.
- No se firmó ningún DTE.
- No se transmitió ningún DTE.
- No se hizo ningún delivery externo.
- No se tocó MH.
- No se tocó ningún firmador remoto.
- No se escribió en PRODUCTION fiscal.
- No se incrementó ningún correlativo.
- No se modificó ningún DTE existente (incluido FE01 `OBSERVED` y
  FSE14 `ACCEPTED` de producción — ninguno de los dos se tocó).
- No se modificó `schema.prisma`.
- No se creó ninguna migración.
- No se usó `db push`.
- No se usó `reset`.
- No se ejecutó ningún seed.
- No se creó ningún cliente real nuevo.
- No se creó ninguna base real nueva.
- No se imprimió ningún secret, password, API key ni JWS.
- No se modificó `.env`.
- No se usó `git add .`.
- No se tocó ningún backup.

## 19. Próximo paso recomendado

1. Implementar el runner `SEED_TENANT_BASE` (§12.1) — es el bloqueante
   real para dar de alta un segundo cliente sin repetir el script ad-hoc.
2. Decidir explícitamente si `RUN_MIGRATIONS` se automatiza (al menos
   para LOCAL/TEST) o se documenta como permanentemente manual con un
   runbook reforzado.
3. Diseñar las variantes runtime-aware de `DteIssuerConfig`/`DteCredential`
   (§12.3) antes de intentar dar de alta el segundo cliente runtime con
   DTE activo.
4. Solo después de 1–3, iniciar la fase de operación editable completa
   (§16), módulo por módulo, empezando por el de menor riesgo.
