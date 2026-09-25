# Cierre — SHARED-PILOT-4C + SHARED-OPS-PARITY-1

Estado: **CERRADO**. HEAD productivo `2a14917eb9bc0e266380aefe289af0395c3e45a9`, deployment Vercel `READY`.

Este documento es la fuente de cierre del bloque Shared Runtime (4A → 4C) y de la paridad de operaciones organization-scoped. Para el detalle del wizard de provisioning e idempotencia (4A/4B) ver `docs/context/shared-runtime-manual-onboarding.md`. Para el detalle funcional de datasets de Data Onboarding ver `docs/cierre_tecnico_data_onboarding_controlado.md`.

## 1. Objetivo

- Poder dar de alta clientes nuevos sobre una base física **compartida** (Shared Runtime) desde Platform Admin, sin SQL manual ni scripts ad-hoc.
- Que Shared y Dedicated converjan en el mismo Runtime Router y en las mismas operaciones administrativas, indexadas por **organización** (no por perfil de base).
- Que un tenant nuevo quede operable en Commerce desde el primer login (baseline Commerce).
- Que Data Onboarding funcione organization-scoped, incluyendo PRODUCTION bajo guardas explícitas.
- Validarlo con un piloto técnico (Commerce Pilot) y un primer cliente Shared real (Metatraining).

## 2. Arquitectura final

La raíz runtime es `RuntimeTenant`, no `Gym`:

```
PlatformOrganization (Control Plane)
        |
     tenant_id
        |
RuntimeTenant (base runtime)
  ├── Branch / Location
  ├── User
  ├── Commerce
  ├── DTE
  └── Gym   [extensión opcional]
```

- `COMMERCE_ONLY`: no existe fila `Gym` (`gym = null`).
- `GYM`: `Gym` es una extensión del `RuntimeTenant` (para tenants GYM históricos, `runtime_tenants.id` conserva el mismo id que `gyms.id`).

### Shared vs Dedicated

```
SHARED
  PlatformOrganization
    → shared_runtime_target_id
    → PlatformSharedRuntimeTarget
    → misma base física para N organizaciones
    → aislamiento por tenant_id

DEDICATED
  PlatformOrganization
    → PlatformDatabaseProfile
    → base física propia
```

Ambos convergen en `resolveRuntimeDatabaseProfileForOrganization()` (`runtime-database-router.ts` — no existe un router paralelo). Las operaciones administrativas nuevas (Data Onboarding, baseline, Operar como cliente) resuelven por `organizationId → PlatformOrganization → tenant_id → Runtime Router → runtime efectivo`. `profileId` **no** es autoridad de tenant: la ruta legacy por perfil valida el perfil contra su organización y converge en el mismo resolver.

## 3. Commits principales

| Commit | Descripción |
|---|---|
| `a99085a` | Login directo runtime Dedicated por hostname |
| `4103229` / `bf4a35e` | Rutas admin runtime directas + location activa en base Dedicated |
| `f8e1f6a` | Preparación de aislamiento tenant para Shared Runtime |
| `5499063` | Hardening de aislamiento tenant en DTE sobre Shared |
| `77af607` | Raíz tenant desacoplada de Gym (`RuntimeTenant`) |
| `4817702` | SHARED-PILOT-4A — onboarding manual Shared desde Platform Admin |
| `ced2d54` | SHARED-PILOT-4B — provisioning retry-safe (operación + receipt) |
| `c930f31` / `6a3a7d3` | Entrypoint raíz neutral + branding Zolvi básico |
| `ba24672` / `77752a1` | Admin UI de Shared Runtime Targets + edición |
| `9b98e2f` | Hardening del formulario de alta de proveedor |
| `a2587f1` | CAT-022 restringido a códigos oficiales |
| `2a14917` | SHARED-OPS-PARITY-1 — operaciones organization-scoped (Data Onboarding, baseline, Operar como cliente) |

## 4. Provisioning Shared

Platform Admin → Organizaciones → organización → panel Runtime → asignar Shared Runtime Target → "Provisionar cliente". Una sola transacción runtime crea `RuntimeTenant` + Location + Admin (+ `Gym` solo en modo GYM) + **baseline Commerce** + `RuntimeProvisioningReceipt`. La finalización en Control Plane hace el bind de `tenant_id` y marca la operación `COMPLETED`. Retry exactly-once effective (ver `shared-runtime-manual-onboarding.md` §4).

## 5. Wildcard y dominios

- Wildcard Vercel `*.getzolvi.com` **aplicado**. No se requiere DNS individual por cliente.
- Dominios operativos: `getzolvi.com`, `app.getzolvi.com`, `trustme.getzolvi.com`, `commerce-pilot.getzolvi.com`, `metatraining.getzolvi.com`.
- Login runtime directo por hostname **habilitado**:

```
hostname
  → PlatformOrganization.domain (@unique, normalizado)
  → runtime authentication (tenant_id + email)
  → auth_scope = RUNTIME_CLIENT
  → Runtime Router
  → tenant aislado
```

Hostnames de plataforma (`PLATFORM_HOSTS`, p.ej. `app.getzolvi.com`) siguen la rama `PLATFORM`.

## 6. Commerce Pilot (piloto técnico certificado)

| Campo | Valor |
|---|---|
| Nombre | Zolvi Commerce Pilot |
| code | `commerce-pilot-0001` |
| domain | `commerce-pilot.getzolvi.com` |
| runtime | SHARED |
| mode | COMMERCE_ONLY |

Estado certificado:

- RuntimeTenant = 1, Branch = 1, Admin User = 1, **Gym = 0**.
- Baseline Commerce: ProductCategory `GENERAL` = 1, TaxRate `IVA 13%` = 1, TenantFiscalConfig = 1.
- Provisioning receipt: `mode = COMMERCE_ONLY`, `gym_id = null`.
- Aislamiento visual y backend contra TrustMe: **PASS**.

## 7. Metatraining (primer cliente Shared real)

Primer cliente Shared real, usado para operación y capacitación.

| Campo | Valor |
|---|---|
| code | `meta-training` |
| name | Metatraining |
| domain | `metatraining.getzolvi.com` |
| runtime | SHARED (Zolvi Shared 01) |
| status | ACTIVE |
| provisioning | PROVISIONED |

Fiscal (DTE): **sin onboarding fiscal** — ver §13.

## 8. Data Onboarding Shared

Contrato:

```
organizationId → PlatformOrganization → tenant_id → Runtime Router → runtime efectivo
```

- Ruta nueva: `/dashboard/platform/data-onboarding/org/[organizationId]`.
- Ruta legacy Dedicated: `/dashboard/platform/data-onboarding/[profileId]` — converge en el mismo resolver organization-scoped.
- Pipeline único (`runDataOnboardingImport`) para los 7 datasets: `categories`, `lines`, `sublines`, `customers`, `suppliers`, `products`, `inventory_initial`.
- `tenantId` siempre server-side; tenant/target/host enviados por el navegador se ignoran.

Política PRODUCTION (`data-onboarding-execution-policy.ts`):

| Modo | PRODUCTION |
|---|---|
| DRY_RUN | Permitido (sin escrituras) |
| EXECUTE | Permitido bajo guardas explícitas |

Guardas de EXECUTE en PRODUCTION: `super_admin`, organización válida, tenant válido, runtime activo, `CREATE_ONLY`, módulo comercial del dataset habilitado, conexión verificada, análisis DB-aware sin errores y solo filas CREATE, confirmación textual exacta `IMPORT <DATASET> <organization.code>` (el código se lee del Control Plane, nunca del navegador). Fuera de PRODUCTION se mantiene el Safety Gate D0 histórico sin cambios. El Safety Gate D0 global sigue bloqueando PRODUCTION para seeds, repairs y migraciones.

## 9. Baseline Commerce

`ensureCommerceTenantBaseline()` (`src/modules/platform/lib/provisioning/ensure-commerce-tenant-baseline.ts`) crea idempotentemente, con `RuntimeTenant.id` como `tenant_id`:

- TaxRate `IVA 13%`
- ProductCategory `GENERAL`
- `TenantFiscalConfig`

Solo crea lo que falta; nunca actualiza, borra ni duplica.

- Organizaciones nuevas: se ejecuta dentro de la misma transacción de provisioning, antes del `RuntimeProvisioningReceipt`. El replay por receipt es read-only.
- Organizaciones existentes: reparación manual idempotente `ensureOrganizationRuntimeBaselineAction()` (botón en Platform Admin).
- No duplica catálogos globales de la base física.

### Capas de datos en una base runtime

| Capa | Ejemplos | Alcance |
|---|---|---|
| A. Global physical runtime catalogs | `units_of_measure`, `identification_types`, `economic_activities`, `municipalities`, `countries`, catálogos DTE | Una sola copia por base física Shared. Nunca se siembra por organización. |
| B. Tenant baseline | TaxRate, ProductCategory, TenantFiscalConfig | Por `tenant_id` (baseline Commerce). |
| C. Tenant business data | customers, suppliers, products, inventory, sales, purchases, etc. | Por `tenant_id` (Data Onboarding / operación). |

## 10. Aislamiento tenant

- En Shared, el aislamiento lo garantiza `tenant_id` (RuntimeTenant + `User.tenant_id` + filtros de cada módulo), nunca la conexión.
- `User.email` es `@@unique([tenant_id, email])`: el mismo email puede existir en tenants distintos de la misma base física; el login resuelve por `(tenant_id, email)`.
- Tests de aislamiento A/B con analyzer y runners reales de Data Onboarding (SHARED-OPS-PARITY-1).
- Commerce Pilot vs TrustMe: PASS visual y backend.

### Operar como cliente

```
Platform Admin → Shared Runtime Targets → Organizaciones → organización concreta → Operar como cliente
```

- Nunca se opera directamente sobre un Shared Runtime Target sin seleccionar organización.
- Las sesiones Shared se re-resuelven por organización (`enterOrganizationRuntimeAction`, `runtimeKind` en sesión).
- Support Session: `readOnly = true`. Debe permanecer así.

## 11. CAT-022

CAT-022 oficial (Catálogo — Sistema de Transmisión v1.2):

| Código | Descripción |
|---|---|
| `02` | Carnet de residente |
| `03` | Pasaporte |
| `13` | DUI |
| `36` | NIT |
| `37` | Otro |

- `00 — Consumidor final` fue **retirado** de CAT-022 (commit `a2587f1`): validación Zod de customers/suppliers, UI, fallbacks y seeds.
- Consumidor Final es una clasificación de contribuyente: `taxpayer_type = FINAL_CONSUMER`, no un tipo de documento.
- Filas `00` persistidas en bases existentes: `prisma/scripts/retire-cat022-code-00.ts` (dry-run por defecto, protegido por cero referencias). Este cierre no afirma que se haya ejecutado en ninguna base.

## 12. Evidencia productiva

| Evidencia | Resultado |
|---|---|
| Deployment Vercel HEAD `2a14917` | READY |
| Wildcard `*.getzolvi.com` | Aplicado |
| Commerce Pilot provisionado (COMMERCE_ONLY, Gym = 0, baseline completo) | PASS |
| Aislamiento Commerce Pilot vs TrustMe | PASS |
| Metatraining provisionado en SHARED (Zolvi Shared 01) | ACTIVE / PROVISIONED |
| Data Onboarding EXECUTE en PRODUCTION — Metatraining, dataset `categories` | `RUN_IMPORT = SUCCESS`, created = 1 (`SERVICIOS — SERVICIOS`) |

Esto constituye el **primer EXECUTE real de Data Onboarding organization-scoped sobre Shared Runtime en PRODUCTION**.

## 13. DTE — estado exacto

DTE Shared **no** está cerrado fiscalmente para Metatraining.

- **A. RUNTIME_CLIENT real**: la arquitectura DTE usa `requireOperationalContext()` y `context.client` en las acciones runtime-aware, incluidas firma y transmisión.
- **B. Platform → Operar como cliente**: Support Session es `readOnly`. No utilizarla para emitir ni transmitir DTE.

Metatraining: `DteIssuerConfig = 0`, `DteCredential = 0`, `DteCorrelative = 0`, `DteOutgoingDocument = 0`.

Onboarding fiscal Shared: **DEFERRED** a una fase posterior. En este cierre no se llamó a MH, no se firmó y no se transmitió nada.

## 14. Known deferred items (no bloquean el cierre de 4C)

- Onboarding fiscal DTE de nuevos clientes Shared.
- Activación/configuración real de credenciales MH por tenant.
- Pruebas de volumen alto de Data Onboarding.
- Pruebas de concurrencia real de Data Onboarding (dos operadores, mismo dataset/organización).
- RLS (Row Level Security) sigue siendo deuda arquitectónica futura; hoy el aislamiento Shared es por `tenant_id` a nivel de aplicación.

## 15. Siguiente fase

- Siguiente bloque **no-DTE** habilitado sobre esta base (operación de clientes Shared, Data Onboarding de datasets restantes para Metatraining).
- Onboarding fiscal Shared queda como bloque separado y explícito, no implícito en el siguiente trabajo.
