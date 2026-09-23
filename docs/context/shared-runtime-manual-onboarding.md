# Shared Runtime — Manual Onboarding (SHARED-PILOT-4A)

Estado: implementado y validado en LOCAL. No desplegado a producción. No se creó ningún cliente piloto real todavía.

## 1. Objetivo

Permitir que un operador dé de alta un cliente Commerce-only completo desde Platform Admin, sin SQL manual, sin Prisma Studio, sin scripts ad-hoc, sin copiar UUIDs y sin reingresar password de base de datos por cada cliente nuevo.

## 2. Arquitectura

```
PlatformOrganization (control plane)
   |
   +-- shared_runtime_target_id ──┐   (Shared, N:1)
   |                              ↓
   |                    PlatformSharedRuntimeTarget
   |                    (conexión física reusable,
   |                     credencial cifrada AES-256-GCM)
   |
   +-- database_profiles[]            (Dedicated, 1:1, sin cambios)
   |
   +-- tenant_id ──────────────────→ RuntimeTenant (en la base runtime)
```

- **Dedicated Runtime**: sin cambios de comportamiento. `PlatformDatabaseProfile` sigue siendo 1 perfil = 1 organización.
- **Shared Runtime** (nuevo): `PlatformSharedRuntimeTarget` es una conexión física que múltiples `PlatformOrganization` pueden referenciar. El aislamiento de datos entre organizaciones que comparten la misma base física lo garantiza `tenant_id` (RuntimeTenant + User.tenant_id), nunca la conexión en sí.
- Ambos caminos convergen en el mismo `runtime-database-router.ts` — no hay un router paralelo. `resolveRuntimeDatabaseProfileForOrganization` y `withRuntimePrismaForProvisioning` chequean `organization.shared_runtime_target_id` primero; si es null, caen al camino Dedicated histórico.

## 3. Flujo manual (operador)

1. Platform Admin → Organizaciones → Nueva organización (código, nombre, plan, sin vertical).
2. Abrir la organización → panel **Runtime**.
3. Si no tiene runtime asignado: seleccionar un Shared Runtime registrado (o asignar un perfil Dedicated desde Database Profiles) → botón "Asignar".
4. Con runtime resuelto: completar modo (Commerce-only / Gym), nombre/slug de tenant, location inicial, datos del admin (email/password/nombre) → checkbox de confirmación → "Provisionar cliente".
5. Resultado: Tenant ID, Location creada, Admin creado, Gym extension ("No aplica" en Commerce-only), Binding OK — todo en la misma pantalla, sin mostrar el password.
6. (Fuera de esta fase) el humano abre `https://cliente.getzolvi.com` e inicia sesión.

Ningún paso requiere UUIDs copiados a mano, SQL, ni reingresar la contraseña de la base compartida.

## 4. Idempotencia y recuperación de fallos

No hay transacción ACID entre Control Plane (BD de la app) y la base runtime (BD del cliente) — son bases físicas distintas. `provisionSharedRuntimeOrganizationAction` usa `PlatformDeploymentLog` (ya existente, sin nueva tabla) como marcador de estado:

| Punto de fallo | Efecto en retry |
|---|---|
| A. Falla antes de escribir en runtime | Retry crea `RuntimeTenant`/Location/Admin desde cero — nada se creó antes. |
| B. Falla después de crear RuntimeTenant, antes del log CREATED | **Gap conocido, no cerrado en esta fase**: un log `PROVISION_RUNTIME_TENANT_CREATED` no se escribió, así que un retry no encuentra el marcador y vuelve a intentar crear — riesgo de duplicado si la creación en sí tuvo éxito pero el log falló entre medio. Mitigado parcialmente por los `slug @unique` de RuntimeTenant/Gym (el retry fallaría con error de slug duplicado en vez de crear una segunda fila silenciosamente), pero no es una garantía formal de idempotencia end-to-end. |
| C. Falla después del log CREATED, antes del bind | Retry detecta el log, reutiliza `tenantId/gymId/locationId/adminUserId` guardados, y solo reintenta el bind. No duplica nada. |
| D. Falla en el bind (conflicto de tenant_id) | Retorna error explícito, no reescribe el binding, exige revisión manual vía Tenant Binding. |
| E. Falla después del bind pero antes de la respuesta UI | Próximo intento ve `organization.tenant_id` ya poblado → no-op idempotente (`alreadyProvisioned: true`). |

## 5. Same-email multi-tenant (Gap G)

`User.email` pasó de único global a `@@unique([tenant_id, email])` (migración `20260923210930_user_email_unique_per_tenant`). El mismo email puede existir en tenants distintos, incluso dentro de la misma base física Shared. `authenticateRuntimeUser` resuelve por el compound key `(tenant_id, email)` directamente en la query — el tenant se conoce siempre antes de buscar el usuario (viene de `resolveOrganizationByHostname`), nunca se elige "el primer" usuario que matchee el email.

`authenticatePlatformUser` (login del propio Platform Admin, sin noción de tenant) se protegió con el mismo patrón fail-closed que `resolveOrganizationByHostname`: si el email matchea más de una fila, se deniega en vez de autenticar arbitrariamente contra la primera.

## 6. Domain routing

`PlatformOrganization.domain` ahora tiene `@unique` en BD (migración `20260923210900_add_organization_domain_unique`), además de la normalización ya existente (lowercase/trim/hostname puro, sin protocolo/path/puerto) vía `organizationDomainSchema`. `resolveOrganizationByHostname` mantiene deliberadamente el patrón `findMany + take:2` + fail-closed como defensa en profundidad, no depende solo de la constraint de BD.

## 7. Invariantes de seguridad cubiertas por tests

- Tenant A y tenant B pueden compartir el mismo email (`authenticate-runtime-user.test.ts`).
- Login con hostname de tenant A + email compartido con tenant B solo autentica al usuario de A.
- Password de un usuario de tenant B nunca autentica contra el hostname de tenant A.
- Tenant mismatch → fail closed.
- Provisioning contra un Shared Runtime Target inexistente/inactivo → fail closed (`runtime-database-router.shared-target.test.ts`).
- Organización ya vinculada a otro tenant → fail closed, no reescribe el binding.
- Retry de provisioning no duplica RuntimeTenant/Location/Admin cuando ya existe el log CREATED (`provision-shared-runtime-organization.action.test.ts`).
- Commerce-only nunca crea fila Gym.
- Dominio duplicado → rechazado antes de escribir (guard explícito en create/update org actions).
- Dominio con protocolo/path/puerto → rechazado por Zod (`organization-domain.schema.test.ts`).
- Secreto del Shared Runtime Target nunca se selecciona en las queries que alimentan la UI (`list-shared-runtime-targets.ts` omite `encrypted_password` explícitamente).
- Email ambiguo (2+ filas) en login de Platform Admin → fail closed, nunca "el primero" (`authorize-credentials.test.ts`).

## 8. Lo que NO se hizo en esta fase

- No se creó ningún cliente piloto real (Commerce Pilot).
- Wildcard DNS/Vercel para `*.getzolvi.com` — infraestructura externa, no aplicada ni requerida para que el código funcione; solo falta ese paso one-time para que un dominio de cliente resuelva al deployment.
- DTE — explícitamente fuera de alcance de este wizard.
- Idempotencia formal end-to-end (punto B de la tabla arriba) — quedó con una mitigación parcial (constraint de slug único), no con una garantía transaccional completa.
