# Platform — Runtime License Enforcement + Settings Access

Estado: **implementado** (rama `fix/runtime-license-settings-access`, baseline `9c1b80a`). Sin cambios en `schema.prisma` y sin migración.

## Objetivo

Que la licencia comercial de `PlatformOrganization` (`license_status`, `billing_cycle`, `trial_ends_at`, `license_expires_at`, `timezone`) gobierne de verdad el acceso runtime. Antes solo se aplicaba `organization.status`, así que una organización `ACTIVE` con un `TRIAL` vencido seguía operando.

## Fuente única de decisión

`src/modules/platform/runtime/organization-access-policy.ts` → `evaluateOrganizationAccess(org, now)`.

- Es pura: `now` es inyectable, no escribe en BD y no loguea. No importa nada server-only, así que también la usa la UI del Control Plane.
- Devuelve `{ allowed, reason, blockedBy: "TECHNICAL" | "COMMERCIAL" | null, today, timeZone, warnings }` y nunca expone IDs ni secretos.
- Login, revalidación live, gate de layouts, `/access-restricted` y el panel de licencia consumen esta función. **Ningún otro punto reimplementa reglas de licencia** (salvo la deuda de provisioning descrita al final).

## Capas

1. **Técnica** (`evaluateTechnicalOrganizationEligibility`, que también usa `canOrganizationAuthenticate`): mira `organization.status`.
2. **Comercial**: mira `license_status`, el ciclo de facturación y las fechas.

## Matriz de estados

| Entrada | Resultado |
|---|---|
| `status` ACTIVE / PENDING | Elegible técnicamente (PENDING se conserva para setup) |
| `status` SUSPENDED / CANCELLED | `ORGANIZATION_SUSPENDED` / `ORGANIZATION_CANCELLED` |
| `status` desconocido | `ORGANIZATION_STATUS_INVALID` (fail closed) |
| `license_status` SUSPENDED / EXPIRED / CANCELLED | `LICENSE_SUSPENDED` / `LICENSE_EXPIRED` / `LICENSE_CANCELLED` |
| TRIAL + `trial_ends_at` | Permitido hasta ese día local inclusive; después `TRIAL_EXPIRED`. Nunca usa `license_expires_at` |
| TRIAL sin `trial_ends_at` | Permitido (legacy), con warning `TRIAL_WITHOUT_END_DATE` en el Control Plane |
| ACTIVE + LIFETIME | Permitido aunque exista una fecha antigua |
| ACTIVE + MONTHLY/ANNUAL/NONE + `license_expires_at` | Permitido hasta ese día local inclusive; después `ACTIVE_LICENSE_EXPIRED` |
| ACTIVE sin `license_expires_at` | Permitido (compatibilidad) |
| ACTIVE + `billing_cycle` desconocido | `BILLING_CYCLE_INVALID` (fail closed) |
| `license_status` desconocido | `LICENSE_STATUS_INVALID` (fail closed) |

Nunca se cambia `license_status` automáticamente al pasar la fecha. El estado efectivo es siempre derivado; no hay cron ni efectos secundarios.

## Fechas: semántica date-only inclusiva

- Las columnas siguen siendo `DateTime`. `<input type="date">` → `z.coerce.date` las persiste a medianoche UTC.
- `toStoredCalendarDate()` extrae `YYYY-MM-DD` con componentes UTC, sin desplazamiento: `2026-10-12T00:00Z` siempre es `2026-10-12`, nunca el 11.
- `getCalendarDateInTimeZone()` calcula el "hoy" con `Intl.DateTimeFormat#formatToParts` en `PlatformOrganization.timezone`, y se comparan strings `YYYY-MM-DD`.
- Ejemplo: `trial_ends_at = 2026-10-15` en America/El_Salvador permite todo el 15 local y bloquea desde las 00:00 del 16 local (06:00 UTC).
- Si el timezone falta o es inválido: fallback UTC determinista, warning `TIMEZONE_FALLBACK_UTC` sanitizado en servidor y visible en el panel. No hay crash ni bypass.
- La visualización usa `formatStoredCalendarDate()` (DD/MM/YYYY) para `trial_ends_at`, `license_expires_at` y `suspended_at`. `created_at` y `updated_at` son timestamps reales y no cambian.

## Puntos de aplicación

- **Login runtime** (`authorize-credentials.ts` → `authenticateRuntimeHostUser`): `resolveOrganizationByHostname` trae los campos comerciales y se evalúa la política **antes** de abrir la runtime DB o comparar password. Si bloquea devuelve el mismo `null` genérico que unas credenciales inválidas. El login PLATFORM no cambia.
- **Revalidación live por request** (`requireRuntimeOrganizationContext`): lee en vivo los campos comerciales del Control Plane y reaplica la política. El bloqueo comercial lanza `RuntimeIdentityError("ORGANIZATION_ACCESS_RESTRICTED", accessReason)` y el técnico conserva `ORGANIZATION_NOT_ELIGIBLE`. Un cambio en el Control Plane bloquea o restaura en el siguiente request, sin esperar las 8h del JWT. La licencia nunca viaja en el JWT. Todas las páginas, Server Actions y Route Handlers runtime-aware pasan por aquí y fallan cerrado.
- **Gate de UX** (`runtime-organization-access-gate.ts`): `enforceRuntimeOrganizationAccess()` se llama desde `getSessionOrRedirect()` y los layouts `(dashboard)` y `(portal)`. Hace una query por request (React `cache`) y redirige a `/access-restricted` antes de que la página resuelva contexto, así no termina en un 500.
- **`/access-restricted`**: fuera de dashboard y portal. Recalcula el motivo en vivo (nunca desde la URL), muestra mensaje por motivo sin datos internos y tiene botón Salir. Si el acceso se restaura vuelve al home; si la identidad no es RUNTIME_CLIENT, va a su home.

## Bypass comercial: PLATFORM y Support Session

El bloqueo comercial aplica solo a `auth_scope = "RUNTIME_CLIENT"`. PLATFORM nativo y Support Session ("Operar como cliente", resuelta por `resolve-runtime-session-profile.ts`) no pasan por el gate y siguen pudiendo entrar a dar soporte.

## Relación con el commercial enforcement existente

El license gate es una capa **anterior** al acceso de organización. `resolveCommercialEnforcementContext`, module-guard, capacity-engine, entitlements y el metering DTE no cambian: siguen decidiendo qué puede hacer la organización cuando su licencia le permite entrar.

## Settings: acceso runtime

- **Datos del gimnasio / Códigos operativos**: `requireGlobalAdmin()` → `requireOperationalContext()` → rol LIVE global, en la página y en la Server Action (`updateGymAction`, `updateGymSettingsAction`).
  - PLATFORM y RUNTIME_CLIENT super_admin editan su tenant efectivo sobre la runtime DB.
  - Support Session queda en READ_ONLY.
  - Un rol LIVE degradado pierde la edición aunque el JWT diga super_admin.
  - Gym mantiene `requireEffectiveVertical(..., "GYM")`.
- **Seguridad**: sin cambios.
- **Deportes / Metas**: `Sport` y `Goal` son catálogos globales **sin `tenant_id`**. En un Shared Runtime, un write de un cliente alteraría el catálogo de otros tenants y los `_count` (clientes/plantillas) agregan relaciones de todos los tenants de la base física. Por eso:
  - RUNTIME_CLIENT: lista en solo lectura, con el aviso explicativo "Catálogo global administrado por Zolvi. Disponible en modo solo lectura.".
  - Support Session: lista en solo lectura ("Solo lectura" en la columna Acciones); hoy **no** muestra ese aviso explicativo.
  - En ambos casos no se muestran Nuevo / Editar / Activar / Desactivar.
  - En ambos casos las columnas Clientes / Plantillas **no se renderizan** (ni header ni valor en el HTML/RSC). Solo Platform Admin nativo ve los conteos globales.
  - Las rutas `new` / `[id]/edit` y sus 6 Server Actions siguen con `requireSuperAdmin()` (Platform-only).
  - Convertirlos en catálogos por organización requiere una microfase separada.
- La raíz de Configuración muestra "Consultar →" en Deportes/Metas para quien no es Platform Admin.

## Deuda conocida

- `src/modules/platform/lib/provisioning-validator.ts` (`checkLicenseDates`) conserva la semántica anterior: compara timestamps contra `new Date()`, ignora LIFETIME y el timezone, y marca vencido el último día del trial o licencia. Solo afecta el check de provisioning, no el acceso runtime. Deberá delegar en `evaluateOrganizationAccess` en una microfase posterior.
- `create-deployment-job` / `create-manual-deployment-job` bloquean `license_status === "CANCELLED"` por su cuenta. Es gating de deployment, no de acceso, y queda fuera de alcance.

## Tests

- `organization-access-policy.test.ts`: matriz completa, frontera de medianoche en El Salvador, fallback UTC, timezone inválido, status y billing desconocidos, display.
- `runtime-organization-access-gate.test.tsx`: gate, portal, `/access-restricted`, PLATFORM sin bloqueo.
- `require-runtime-organization-context.test.ts`: sesión ya abierta bloqueada y restaurada sin JWT nuevo.
- `authorize-credentials.test.ts`: trial vencido, licencias explícitas, trial vigente, PLATFORM.
- `settings-runtime-access.test.tsx`: matriz de Settings y counts sentinel (987/654) ausentes en RUNTIME_CLIENT y Support.
- `platform-license-panel.test.tsx`: `suspended_at` date-only.
- `update-organization-license.schema.test.ts`: TRIAL exige `trial_ends_at`.
