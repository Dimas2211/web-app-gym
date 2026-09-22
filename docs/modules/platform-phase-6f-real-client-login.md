# Platform — FASE VI-F: Real Client Login (Dedicated Runtime) — Code-Ready

## Objetivo

Cerrar FASE VI dejando el código LISTO para que `trustme.getzolvi.com` (u
otro hostname de cliente dedicado) autentique directamente contra su
Dedicated Runtime DB, sin pasar por Support Session. Esta fase es
auditoría + cierre de gaps puntuales — **no** una construcción desde cero:
el pipeline completo ya existía de VI-B/VI-C/VI-D y quedó certificado aquí.

Sin push, sin deploy, sin DNS, sin mutación remota.

## Hallazgo principal

El pipeline `hostname → Organization → DatabaseProfile → runtime Prisma
client → runtime user auth (bcrypt) → tenant/location/rol LIVE` ya estaba
construido, testeado y fail-closed en su totalidad antes de esta fase. VI-F
no encontró gaps estructurales — solo cerró dos escenarios cruzados
explícitos que faltaban en la matriz de tests de `authorizeCredentials`.

## Matriz de auditoría (VI-B/VI-C/VI-D → estado VI-F)

| Paso | Implementación | Listo |
|---|---|---|
| Hostname resolver | `src/lib/http/hostname.ts` (`resolveRequestHostname`, lee `x-forwarded-host`/`host`) + `src/lib/platform/platform-hosts.ts` (`isPlatformHostname`, allowlist `PLATFORM_HOSTS`) | Sí |
| Feature flag | `src/lib/auth/runtime-host-auth-flag.ts` — `RUNTIME_HOST_AUTH_ENABLED`, fail-closed, default `false` | Sí |
| Auth.js config | `src/lib/auth/auth.config.ts` + `auth.ts`, provider `Credentials` único → `authorizeCredentials()` | Sí |
| Organization resolution | `src/modules/platform/runtime/resolve-organization-by-hostname.ts` — busca por `PlatformOrganization.domain`, fail-closed en 0 o 2+ matches, valida `status` | Sí |
| DatabaseProfile resolution | `runtime-database-router.ts` — `resolveRuntimeDatabaseProfileForOrganization()`, prioriza PRODUCTION>STAGING>SANDBOX>TEST>LOCAL | Sí |
| Runtime Prisma client | `runtime-database-router.ts` — `createRuntimePrismaClient()` por request, sin caching (perf TODO documentado, no bloqueante) | Sí |
| Runtime user auth | `src/modules/platform/runtime/authenticate-runtime-user.ts` — busca `User` SOLO en la runtime DB de la organización, bcrypt, valida tenant match | Sí |
| Tenant/location/rol LIVE | `effective-tenant-context.ts` — revalida SIEMPRE contra runtime DB para `auth_scope === "RUNTIME_CLIENT"`, nunca confía en JWT congelado | Sí |
| Support Session | `runtime-session.ts` + `enter-client-runtime.action.ts` — cookie separada, rama `SUPPORT_RUNTIME` mutuamente excluyente de `RUNTIME_CLIENT` | Sí (sin tocar) |
| Módulos/entitlements | `commercial-enforcement.ts` — resuelto desde Control Plane (`PlatformOrganizationModule`/`...EntitlementOverride`), nunca copiado a runtime DB | Sí |
| Navegación | `canAccessPlatformAdmin` calculado server-side en `(dashboard)/layout.tsx` desde `auth_scope === "PLATFORM"` — un `RUNTIME_CLIENT` nunca puede ser `true` | Sí |
| Schema | `PlatformOrganization`, `PlatformDatabaseProfile`, `PlatformExternalIntegration` ya en `schema.prisma` | Sí, sin cambios en VI-F |

## Cambio realizado en VI-F

Único cambio de código: 2 tests nuevos en
`src/lib/auth/authorize-credentials.test.ts` (tests 17 y 18) que certifican
explícitamente:

1. Un usuario que solo existe como Platform User global (ej. `super_admin`)
   **no puede autenticar** vía `trustme.getzolvi.com` — `authenticateRuntimeHostUser`
   nunca consulta el Prisma global, solo la runtime DB de la organización
   resuelta, así que el intento cae en `RUNTIME_USER_NOT_FOUND` → `null`.
2. Un login por hostname de plataforma nunca invoca
   `resolveOrganizationByHostname` ni `authenticateRuntimeUser` — las dos
   ramas (PLATFORM / RUNTIME_CLIENT) son mutuamente excluyentes desde
   `authorizeCredentials`.

No se tocó lógica de producción. `PlatformOrganization.domain` no tiene
constraint único a nivel DB (se compensa con chequeo de ambigüedad en
`resolveOrganizationByHostname`) — deuda no bloqueante, ya documentada.

## Hostname → Organization (dato requerido en cutover)

El modelo `PlatformOrganization.domain` (`prisma/schema.prisma`) ya es el
mecanismo — no se creó schema nuevo. Para activar el login real de TrustMe
falta únicamente el **dato**: un registro `PlatformOrganization` con
`domain = "trustme.getzolvi.com"`, `status = ACTIVE`, `tenant_id` apuntando
al tenant real de TrustMe, y un `PlatformDatabaseProfile` activo asociado
a esa organización. Esto se crea en Control Plane durante el cutover — no
en esta fase.

## `app.getzolvi.com` (hostname genérico)

No requiere organización ni runtime. Debe listarse en `PLATFORM_HOSTS`
junto al resto de hosts de plataforma (ej.
`PLATFORM_HOSTS="getzolvi.com,app.getzolvi.com,www.getzolvi.com"`) para que
`isPlatformHostname()` lo reconozca y siga sirviendo el login
global/Control Plane existente. No se implementa una "organización app" —
es puramente config de env var.

## Feature flag — comportamiento

`RUNTIME_HOST_AUTH_ENABLED`:
- `false` (default en `.env.example`, y estado actual en todo ambiente): cualquier hostname no-plataforma → `null` sin resolver organización.
- `true`: habilita la rama `RUNTIME_CLIENT` completa.
- Requerido `true` en producción para que `trustme.getzolvi.com` funcione. No se modificó en Vercel en esta fase (ver handoff).

## Validación

- `npx vitest run` → 882/882 PASS (880 previos + 2 nuevos).
- `npx tsc --noEmit` → limpio.
- `npm run lint` → sin errores nuevos (mismos warnings preexistentes).
- `npm run build` → PASS.
- `git diff --check` → limpio.

## Impacto en bases de datos y sincronización local/remota

- `schema.prisma`: **sin cambios** en VI-F.
- Migraciones: **ninguna nueva** en VI-F. `MIGRATION_REQUIRED = NO`.
- Pendiente de fases anteriores (no de VI-F): la migración
  `20260921233552_add_platform_external_integration` sigue aplicada SOLO en
  local — pertenece conceptualmente al Control Plane y debe aplicarse ahí
  antes de cualquier deployment que use delivery externo DTE por
  organización. No se tocó en esta ejecución.
- `DATABASE_URL` y `DIRECT_URL`: no se tocaron. No hay acción pendiente de
  sincronización local/remota generada por VI-F.

## Cutover checklist (ver también sección "VI-F DEPLOYMENT HANDOFF" en el reporte de cierre)

1. Aplicar `20260921233552_add_platform_external_integration` en Control Plane de producción (deuda heredada, no de VI-F).
2. Crear `PlatformOrganization` para TrustMe (`domain = trustme.getzolvi.com`, `status = ACTIVE`, `tenant_id` real).
3. Crear/activar `PlatformDatabaseProfile` para TrustMe (`environment = PRODUCTION`, `is_active = true`).
4. Confirmar módulos/entitlements de TrustMe en Control Plane (Commerce-only, sin vertical).
5. Configurar `PLATFORM_HOSTS` en Vercel para incluir `app.getzolvi.com` (y demás hosts de plataforma).
6. Configurar `RUNTIME_HOST_AUTH_ENABLED=true` en Vercel (producción).
7. Asignar dominios `app.getzolvi.com` y `trustme.getzolvi.com` en el proyecto Vercel correspondiente.
8. Provisionar el primer usuario runtime admin de TrustMe (mecanismo ya existente — no se crea usuario/password en código/docs).
9. Smoke test end-to-end (ver orden en el handoff).
10. Confirmar regresión de Support Session ("operar como cliente") post-cutover.
