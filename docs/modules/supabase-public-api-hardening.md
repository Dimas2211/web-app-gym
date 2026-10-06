# SUPABASE-PUBLIC-API-HARDENING — Cierre de la Supabase Data API sobre `public`

Fecha: 2026-10-06. Estado: **CODE COMPLETE en repo, certificado localmente. NO aplicado en producción** (trustme-runtime pendiente de aplicación controlada, §8).

## 1. Vulnerabilidad

`trustme-runtime` (Supabase `vkoywmzlgygypaddxjtn`) exponía las 82 tablas de `public` a los roles `anon` y `authenticated` de la Supabase Data API (PostgREST / GraphQL):

| Hallazgo (auditoría read-only 2026-10-06) | Valor |
|---|---|
| Security Advisor | `rls_disabled_in_public` (ERROR / EXTERNAL) |
| Tablas accesibles por anon / authenticated | 82 / 82 (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) |
| `USAGE` sobre `public` | anon, authenticated, service_role **y `PUBLIC`** |
| Default ACLs peligrosas | `postgres` (tablas/secuencias/funciones) y `supabase_admin` (ídem) |
| Tablas sensibles incluidas | `users` (hashes bcrypt), `_prisma_migrations` (escribible), credenciales/configuración DTE, compras, ventas |

**El mismo proyecto físico aloja 4 organizaciones** (verificado read-only en Control Plane, 2026-10-06): `trustme-0001` (perfil Dedicated "TRUST ME") y, vía Shared Target "Zolvi Shared 01", `commerce-pilot-0001`, `meta-training` y `rechightraining`. Todas conectan como rol `postgres`. Una sola aplicación de la migración afecta físicamente a las cuatro.

El Control Plane (`nygdqnlzoalmhrqwijjn`) es la referencia segura: ACL de `public` = `{postgres=UC/postgres}`, sin default ACLs, `SET ROLE anon` → `permission denied for schema public`.

## 2. Causa raíz

1. El schema `public` de un proyecto Supabase nace con `USAGE` para `anon`/`authenticated`/`service_role` y además para `PUBLIC` (PostgreSQL 15+).
2. `pg_default_acl` del proyecto otorga ALL a anon/authenticated para todo objeto que `postgres` cree en `public`. **`postgres` es exactamente el rol con el que corre `prisma migrate deploy`** (y el de la app) → cada migración nueva nacía expuesta (ej. `tenant_security_configs`).
3. Las tablas no tienen RLS (correcto para Zolvi, ver §3), así que el único control eran los grants.

## 3. Por qué RLS NO es la solución

- La autorización de Zolvi vive server-side: Auth.js → Server Actions → `requireOperationalContext` / guards → Runtime Database Router → Prisma. El acceso de Prisma usa `postgres` (`BYPASSRLS`), por lo que RLS no aportaría nada al camino legítimo.
- Habilitar RLS en 82 tablas sin políticas equivale a "deny all" para anon solo mientras nadie agregue políticas, duplica la autorización en otra capa y genera mantenimiento por tabla. El problema real es que **existe una segunda puerta (Data API) que no debe existir**: se cierra con privilegios, no con políticas.
- RLS queda reportado como dato **informativo** en la auditoría (`RLS_STATUS`).

## 4. Arquitectura de acceso (verificada en repo)

```
Browser → Next.js → Auth.js → Server Actions / backend
        → Runtime Database Router (control-plane-prisma + runtime PrismaClient por URL)
        → Prisma → PostgreSQL (rol postgres)
```

Auditoría de dependencias (todo el repo, excepto `node_modules`/`.next`): sin `@supabase/*` en `package.json`/`package-lock.json`, sin `createClient`, `/rest/v1`, `/graphql/v1`, Realtime, Edge Functions, Supabase Auth ni variables `SUPABASE_*`/`NEXT_PUBLIC_SUPABASE_*` en ningún `.env*`. Única mención: comentarios de `src/core/storage/index.ts` (Supabase Storage como opción futura; storage actual = filesystem). Control Plane y runtime comparten el mismo `schema.prisma` y las mismas migraciones; solo cambia la URL.

## 5. Solución elegida

**Una migración Prisma** — `prisma/migrations/20261006000000_harden_supabase_public_data_api/migration.sql` — porque es el único mecanismo que ya llega a TODAS las bases (Control Plane, Dedicated, Shared, bases nuevas vía provisioning + `RUN_MIGRATIONS`) sin crear un pipeline paralelo.

Un único bloque `DO` (atómico):

1. **Detección**: si no existen `anon`/`authenticated` → `NOTICE NOT_APPLICABLE` y `RETURN` (PostgreSQL local intacto).
2. **Preservar** `USAGE` explícito a roles no-API (migrador, owners, grantees de tablas) que **hoy tienen** `USAGE` efectivo y lo perderían por depender solo de `PUBLIC`/anon/authenticated. Nunca concede `USAGE` a un rol que no lo tenía (corregido en la revisión pre-producción: la primera versión podía escalar en bases tipo Control Plane — TEST 11). En trustme y Control Plane no agrega nada (plan read-only).
3. **Revocar** privilegios de anon/authenticated sobre tablas, vistas, secuencias y funciones de `public` **que el migrador administra** (owner o miembro del owner), incluidos grants solo por columna. Objetos ajenos → `NOTICE` (quedan neutralizados por el paso 4).
4. **Cerrar el schema**: `REVOKE ALL ON SCHEMA public FROM anon, authenticated` **y `FROM PUBLIC`** (revocar solo a anon no basta: hereda de PUBLIC). Resultado = Control Plane.
5. **Default privileges**: `ALTER DEFAULT PRIVILEGES FOR ROLE <owner> [IN SCHEMA public] REVOKE ALL ON TABLES|SEQUENCES|FUNCTIONS FROM anon, authenticated` para cada entrada que el migrador puede administrar.
6. **Verificación fail-closed**: si anon/authenticated conservan `USAGE`/`CREATE` sobre `public`, o quedan default ACLs del migrador hacia ellos → `RAISE EXCEPTION` → rollback total.

No toca: `service_role`, schemas de Supabase (`auth`, `storage`, `graphql*`, `realtime`, `extensions`), RLS, datos, Auth.js, Router, lógica funcional.

Atomicidad (verificada empíricamente con Prisma 6 + PostgreSQL local): `prisma migrate deploy` ejecuta el script completo en una transacción implícita; ante error se revierte todo el script, `_prisma_migrations` conserva la fila con `finished_at = NULL` y el siguiente deploy falla con P3009 hasta `prisma migrate resolve --rolled-back <migración>`.

Impacto de revocar `PUBLIC` en trustme (plan read-only): pierden `USAGE` sobre `public` los roles internos `authenticator`, `dashboard_user`, `supabase_auth_admin`, `supabase_privileged_role`, `supabase_realtime_admin`, `supabase_replication_admin`, `supabase_storage_admin`. Ninguno tiene grants sobre tablas de Zolvi y en el Control Plane esos mismos roles ya carecen hoy de ese `USAGE`.

## 6. Default privileges: `postgres` vs `supabase_admin`

| Owner | ¿Crea tablas de Zolvi? | ¿Administrable por `postgres`? | Tratamiento |
|---|---|---|---|
| `postgres` | **Sí** — `prisma migrate deploy` corre como `postgres` (las 82 tablas son suyas) | Sí | Revocado por la migración (paso 5). Esto es lo que evita la recurrencia. |
| `supabase_admin` | No (objetos internos de la plataforma Supabase) | **No** (`postgres` no es miembro; verificado) | No se toca. Neutralizado: anon/authenticated ya no tienen `USAGE` sobre `public`, así que ningún objeto futuro creado por `supabase_admin` es alcanzable. Reportado como `UNMANAGED_DEFAULT_PRIVILEGES` INFO. |

Funciones futuras: PostgreSQL concede `EXECUTE` a `PUBLIC` por defecto global. No se altera ese default global (afectaría otros schemas); la función queda inalcanzable porque anon/authenticated no pueden resolver nada en `public` (certificado: TEST 5).

## 7. Comportamiento por entorno

| Entorno | Resultado |
|---|---|
| PostgreSQL local (sin roles Supabase) | `NOT_APPLICABLE`, ACL intacto. `prisma migrate deploy` OK (TEST 8). |
| Supabase Control Plane | No-op efectivo (ya cumple). Audit PASS antes y después. |
| Supabase Runtime (trustme + Shared 01) | anon/authenticated → `permission denied for schema public`; default ACLs de `postgres` limpias; `service_role` sin cambios; Prisma conserva CRUD. |
| Nueva base runtime Supabase | `RUN_MIGRATIONS` (`prisma migrate deploy`) aplica esta migración → nace endurecida. El Preflight lo verifica. |
| Migraciones futuras | Las tablas creadas por `postgres` ya no reciben grants (default ACL limpia) y además el schema está cerrado. |

## 8. Procedimiento de aplicación (producción — requiere autorización)

Detalle exacto en el reporte de la microfase. Resumen:

1. Auditar y generar artefacto de rollback (read-only): `npx tsx prisma/scripts/audit-supabase-public-api.ts --env-file .env.trustme-remote --rollback-sql "$HOME\zolvi-backups\trustme-acl-before-hardening.sql"` (fuera del repo: `backups/` no está en `.gitignore`).
2. `prisma migrate status` contra trustme (DIRECT_URL, puerto 5432 session pooler): debe listar **solo** `20261006000000_harden_supabase_public_data_api`.
3. `prisma migrate deploy` contra trustme.
4. Re-auditar → `RESULT=PASS`. Verificación SQL `SET ROLE anon/authenticated`. Security Advisor.
5. Smoke test productivo (TrustMe + un cliente Shared).
6. Control Plane: `prisma migrate deploy` (no-op efectivo) para mantener historial alineado.

El runner `run-runtime-migrations-runner.ts` bloquea `RUN_MIGRATIONS` en PRODUCTION por diseño (D0); la aplicación productiva es un paso operado manualmente, igual que las migraciones runtime anteriores.

## 9. Rollback

El estado previo es **inseguro**: ante una falla funcional, primero identificar la dependencia (qué rol/objeto falló, logs de Supabase/Vercel). Nada en Zolvi usa anon/authenticated, por lo que una falla real apuntaría a otra causa.

- **Artefacto dirigido**: `--rollback-sql` genera, ANTES del hardening, los `GRANT` exactos del ACL previo — schema (incluido `PUBLIC`), tablas, columnas, secuencias, funciones y default ACLs administrables (en trustme: 3 de schema, 24 default ACLs, 1312 de tablas = 1339). Se aplica **solo la sentencia necesaria** para la dependencia identificada; el archivo completo restaura el estado anterior exacto, entrada por entrada e incluido grantor (certificado: TEST 10). No deshace los `USAGE` aditivos del paso 1 (en trustme: ninguno). Nunca `GRANT ALL TO anon` genérico.
- La migración queda registrada en `_prisma_migrations`; un rollback de ACL no requiere tocar ese historial (la migración es idempotente y volvería a cerrar el schema si se re-ejecuta en otra base).
- Si el problema fuese un rol legítimo no previsto que perdió `USAGE` vía `PUBLIC`: `GRANT USAGE ON SCHEMA public TO <ese_rol>;` (no reabrir PUBLIC).

## 10. Verificación y pruebas

| Pieza | Ubicación |
|---|---|
| Auditoría reusable | `src/modules/platform/lib/supabase-public-api-audit.ts` (`auditSupabasePublicApiSecurity`, `generateSupabaseApiAclRestoreSql`) |
| Preflight | `database-preflight.ts`: checks `PUBLIC_DATA_API_EXPOSURE` y `UNSAFE_DEFAULT_PRIVILEGES` (BLOCKER) — visibles en el Preflight de perfil y operativo |
| CLI read-only | `prisma/scripts/audit-supabase-public-api.ts` (`--org`, `--env-file`, `--json`, `--rollback-sql`) |
| Unit tests | `supabase-public-api-audit.test.ts` (12) |
| Certificación local | `prisma/scripts/certify-supabase-public-api-hardening.ts` — base desechable + simulación Supabase en transacción con ROLLBACK (roles transitorios, cero residuo): TEST 1–13, 18/18 PASS |

## 11. Criterios de aceptación

- `SET ROLE anon` / `SET ROLE authenticated` → `permission denied for schema public`.
- Audit `RESULT=PASS` (sin CRITICAL); Preflight sin FAIL en los dos checks nuevos.
- Security Advisor sin `rls_disabled_in_public` (la exposición por grants desaparece; ver riesgo §12.1).
- Smoke test productivo completo OK.

## 12. Riesgos y pendientes

1. **Security Advisor**: el Control Plane no reporta el lint con la misma configuración; se espera el mismo resultado en runtime, pero solo se confirma tras aplicar.
2. **Exposición histórica**: no se puede afirmar que no fue explotada. Revisar logs de API de Supabase (requests a `/rest/v1`/`/graphql/v1` con rol anon/authenticated) del proyecto runtime; si hay accesos no explicados, rotar contraseñas de usuarios y credenciales sensibles almacenadas en runtime.
3. **`supabase_admin` default ACLs**: permanecen (no administrables por `postgres`); neutralizadas por el cierre del schema.
4. **Reapertura manual**: un `GRANT USAGE ON SCHEMA public TO anon` hecho a mano (Dashboard/SQL editor) reabriría la puerta; el Preflight lo detectaría (BLOCKER).
5. **Storage**: si en el futuro se adopta Supabase Storage/Data API, requerirá diseño explícito; esta microfase asume que Zolvi no usa la Data API.
6. **`service_role`** conserva acceso total vía Data API (fuera de alcance por decisión). Su clave no está en Vercel ni en el repo; si se filtrara, expondría `public`. Seguimiento opcional: alinear con el Control Plane (sin `USAGE` para service_role).
7. **Alcance del auditor**: analiza el schema `public`. No detecta vistas o funciones SECURITY DEFINER en *otros* schemas expuestos que lean `public` (en trustme: 0 verificadas read-only el 2026-10-06).
8. **Defensa complementaria (no aplicada)**: quitar `public` de "Exposed schemas" en la configuración API del proyecto Supabase.
