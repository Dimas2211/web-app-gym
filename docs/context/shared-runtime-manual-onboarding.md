# Shared Runtime — Manual Onboarding (SHARED-PILOT-4A)

Estado: implementado y validado en LOCAL (4A + 4B idempotencia distribuida). No desplegado a producción. No se creó ningún cliente piloto real todavía.

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

## 4. Idempotencia distribuida y recuperación de fallos (SHARED-PILOT-4B)

### 4.1 Limitación de transacción distribuida

Control Plane (BD de la app) y la base runtime (BD del cliente, Shared o Dedicated) son bases físicas distintas: **no existe transacción ACID entre ambas**. Hay exactamente dos transacciones independientes:

| Transacción | Dónde | Qué escribe |
|---|---|---|
| RUNTIME TX | `provisionRuntimeTenant()` → `db.$transaction` en la base runtime | RuntimeTenant (+Gym si GYM) + Location + Admin + **RuntimeProvisioningReceipt** |
| CONTROL PLANE TX (finalización) | `provisionSharedRuntimeOrganizationAction` → `controlPlanePrisma.$transaction` | bind `tenant_id` + operación `COMPLETED` + `provisioning_status` + logs |

Antes de 4B, entre el commit runtime y el log `PROVISION_RUNTIME_TENANT_CREATED` existía una ventana no recuperable: si el proceso caía ahí, el retry no tenía identidad persistida para reconocer la operación ya aplicada (el `slug @unique` solo lo convertía en error, no en recuperación). **Esa ventana queda cerrada.** La operación es ahora *exactly-once effective* aunque se ejecute *at-least-once*.

### 4.2 Diseño: operación + receipt

```
Control Plane                                   Runtime DB (Shared/Dedicated)
PlatformOrganization
   └── PlatformRuntimeProvisioningOperation     RuntimeProvisioningReceipt
         organization_id  @unique                 idempotency_key @unique ◄──┐
         idempotency_key  @unique ──────────────► tenant_id / location_id /   │ misma
         status PENDING|RUNNING|COMPLETED|FAILED   admin_user_id (FK, @unique) │ RUNTIME TX
         runtime_target_kind/id (pin)            + RuntimeTenant, Location,  ─┘
         result_* (IDs)                            Admin (+Gym)
```

- **idempotency_key**: `crypto.randomUUID()` generado server-side al crear la operación. Nunca viene del browser, nunca se envía al browser (la query del panel no la selecciona), no contiene información sensible.
- **Una operación por organización** (`organization_id @unique`). Todo reintento — incluidos requests concurrentes — reutiliza la MISMA key. La key no se regenera por click.
- **Receipt atómico**: se crea en la misma transacción runtime que Tenant/Location/Admin. Solo existen dos estados: nada, o los cuatro juntos. Las FK del receipt (`ON DELETE RESTRICT`) impiden un receipt sin recursos.
- **Advisory lock**: la transacción runtime toma `pg_advisory_xact_lock(hashtext('runtime-provisioning:' || key))` antes de buscar el receipt: dos requests con la misma key se serializan y el segundo ve el receipt del primero.
- **Pin de target**: en el primer intento que conecta, la operación fija `runtime_target_kind/id` (condicional, antes de escribir en runtime). Si la organización se reasigna a otro target, el retry falla cerrado — el receipt podría vivir en la base anterior.
- Nunca se guarda password, hash, credenciales de BD ni connection strings en la operación, el receipt ni los logs.

### 4.3 Fuente de verdad

| Registro | Rol |
|---|---|
| `PlatformRuntimeProvisioningOperation` | **Coordination state** (Control Plane). Decide si hay que llamar al runtime y con qué key. |
| `RuntimeProvisioningReceipt` | **Runtime application proof**. Decide si la operación ya se aplicó y qué IDs produjo. |
| `PlatformDeploymentLog` | **Solo auditoría**. Nunca se lee para decidir (la recuperación por log de 4A fue eliminada). |

### 4.4 Semántica exacta de retry

1. Operación `COMPLETED` → respuesta idempotente (`alreadyProvisioned: true`, mismos IDs). 0 escrituras. Si `organization.tenant_id` ya no coincide con `result_tenant_id` → fail closed.
2. Sin operación y `tenant_id` ya poblado (binding manual o anterior a 4B) → no-op `alreadyProvisioned`.
3. Si no: crear/recuperar la operación → `RUNNING`, `attempt_count++` → pin de target → motor runtime con la key:
   - receipt existe → valida modo + que tenant/location/admin(/gym) existen y pertenecen al tenant → devuelve **los mismos IDs**, sin escribir;
   - receipt no existe y la organización ya tiene `tenant_id` → **fail closed** (`replayOnly`): nunca nace un segundo tenant;
   - receipt no existe → slug de tenant/gym ya tomado → **fail closed** (nunca se adopta un tenant ajeno); si no, crea todo + receipt.
4. Finalización CP (una transacción): verifica organización y target; `tenant_id` null → bind condicional (`updateMany where tenant_id null`); igual → retry idempotente; distinto → **fail closed**. Marca `COMPLETED` con los IDs, `provisioning_status = PROVISIONED` (nunca degrada `DEPLOYED`) y escribe logs solo si esta request fue la que completó.
5. Cualquier fallo → operación `FAILED` con `last_error` sanitizado (best-effort: si CP está caído, el retry sigue siendo seguro porque la key ya está persistida). El panel muestra **"Falló — Reintentar"**; el retry llama a la misma acción.

### 4.5 Failure matrix (cubierta por tests)

| # | Punto de fallo | Resultado en retry |
|---|---|---|
| A | Falla al crear la operación CP | 0 escrituras runtime. Retry crea la operación normalmente. |
| B | Operación existe, falla antes de escribir en runtime | Runtime vacío. Retry reutiliza la misma key (`attempt_count` 2). |
| C | Falla dentro de la transacción runtime | Rollback completo (0 tenant/location/admin/receipt). Retry con la misma key crea todo. |
| D | **Commit runtime OK, proceso cae inmediatamente después** | Receipt + recursos existen, CP sin resultado (`RUNNING`). Retry: misma key → receipt → **mismos IDs** → bind → `COMPLETED`. Conteos: +1 tenant, +1 location, +1 user, +1 receipt. |
| D' | La transacción de finalización CP lanza excepción | Rollback de la finalización (sin bind parcial), `FAILED`. Retry recupera por receipt. |
| E | `tenant_id` ya bindeado al tenant correcto, operación no `COMPLETED` | Completa sin error, sin duplicados, sin re-bind. (Sin receipt → fail closed.) |
| F | `COMPLETED` pero el browser perdió la respuesta | Respuesta idempotente, 0 escrituras. |
| G | Slug pertenece a otro tenant/operación | Fail closed (`TENANT_SLUG_TAKEN`/`GYM_SLUG_TAKEN`). Corregir slug y reintentar reutiliza la key. |
| H | Email admin existe en otro tenant | Válido (`@@unique([tenant_id, email])`). |
| I | Conflicto unique (p.ej. email) dentro del tenant, fuera del receipt | Fail closed (`UNIQUE_CONFLICT`), rollback, sin receipt. Estructuralmente el tenant es siempre nuevo dentro de la misma transacción, así que un email "ajeno dentro del mismo tenant" solo puede aparecer por carrera — y termina en rollback. |

Adicionales: `tenant_id` distinto al del receipt → fail closed; tenant ya vinculado a otra organización → fail closed; target reasignado → fail closed; Shared Target inactivo → fail closed.

### 4.6 Concurrencia

Dos (o más) requests simultáneos de "Provisionar" para la misma organización:

- `organization_id @unique` → la segunda `create` choca (P2002) y adopta la operación ganadora: **una sola key**.
- `pg_advisory_xact_lock` por key → la segunda transacción runtime espera al commit de la primera y encuentra su receipt.
- Finalización con `updateMany … where tenant_id null` y `where status != COMPLETED` → un único bind y un único log efectivo.

Resultado verificado: 1 RuntimeTenant, 1 Location, 1 Admin, 1 Receipt, 1 operación efectiva. Además de los tests con doble base en memoria, el motor se verificó contra PostgreSQL real (base scratch temporal en localhost, eliminada después): 5 conexiones concurrentes con la misma key → 1 set de filas; carrera de dos keys por el mismo slug → una gana, la otra rollback completo; receipt huérfano rechazado por FK (P2003).

### 4.7 Operación

- Las organizaciones provisionadas con 4A (log `CREATED` sin receipt) no se reprocesan: si ya tienen `tenant_id`, son no-op. Si quedaron sin bind, un retry crea una operación nueva y, al encontrar el slug tomado, falla cerrado — requiere Tenant Binding manual (nunca adopción por slug).
- La migración `20260923230000_add_runtime_provisioning_idempotency` debe estar aplicada en **Control Plane y en cada base runtime** (Shared Targets y Dedicated) antes de desplegar este código: el motor escribe `runtime_provisioning_receipts` en la base runtime.

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
- Retry de provisioning no duplica RuntimeTenant/Location/Admin/Receipt tras cualquier fallo intermedio A–I, incluido crash post-commit runtime, ni con requests concurrentes (`provision-shared-runtime-organization.action.test.ts`, `provision-runtime-tenant.test.ts`).
- Commerce-only nunca crea fila Gym.
- Dominio duplicado → rechazado antes de escribir (guard explícito en create/update org actions).
- Dominio con protocolo/path/puerto → rechazado por Zod (`organization-domain.schema.test.ts`).
- Secreto del Shared Runtime Target nunca se selecciona en las queries que alimentan la UI (`list-shared-runtime-targets.ts` omite `encrypted_password` explícitamente).
- Email ambiguo (2+ filas) en login de Platform Admin → fail closed, nunca "el primero" (`authorize-credentials.test.ts`).

## 8. Lo que NO se hizo en esta fase

- No se creó ningún cliente piloto real (Commerce Pilot).
- Wildcard DNS/Vercel para `*.getzolvi.com` — infraestructura externa, no aplicada ni requerida para que el código funcione; solo falta ese paso one-time para que un dominio de cliente resuelva al deployment.
- DTE — explícitamente fuera de alcance de este wizard.
- ~~Idempotencia formal end-to-end~~ — cerrada en SHARED-PILOT-4B (sección 4).
