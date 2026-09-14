/**
 * Contratos de identidad para la capa core de la plataforma.
 *
 * CoreSessionUser es el tipo base activo de la plataforma. Es importado
 * por src/lib/permissions/guards.ts como base de SessionUser GYM y por
 * src/core/permissions/guards.ts como tipo de retorno de getCoreSession().
 *
 * GymSessionUser es un tipo puente utilizado internamente en getCoreSession()
 * para castear session.user (cuyo tipo NextAuth no incluye tenant_id/location_id
 * de forma estática) antes de extraer los campos core. No es un tipo de uso
 * público en módulos GYM — esos módulos usan SessionUser de @/lib/permissions/guards.
 *
 * Estado post-9D:
 * - JWT emite tenant_id / location_id únicamente (sin gym_id / branch_id)
 * - CoreSessionUser es el contrato activo, no un contrato futuro
 * - GymSessionUser existe como tipo auxiliar de adaptación en el core
 *
 * FASE VI-B — auth_scope:
 * - ROLE (arriba) sigue gobernando privilegios DENTRO del tenant/organización.
 * - AUTH_SCOPE es un concepto ortogonal: origen/alcance de la identidad.
 *   "PLATFORM" = autenticado por el flujo global actual (Prisma global).
 *   "RUNTIME_CLIENT" = reservado para login runtime futuro (VI-C), aún no habilitado.
 * - `role === "super_admin"` NUNCA es prueba suficiente de identidad Platform Admin.
 *   Ver canAccessPlatformAdmin() en @/core/permissions/platform-access.
 * - `auth_scope` es `AuthScope | undefined` (no opcional): todo constructor de
 *   CoreSessionUser/SessionUser debe decidir explícitamente su valor. `undefined`
 *   representa "desconocido/ausente" y debe fallar cerrado (nunca tratarse como
 *   PLATFORM) — ver isAuthScope().
 */

// ─── Contrato de alcance de autenticación (FASE VI-B) ─────────────────────────

/**
 * Origen y alcance de la identidad autenticada. Ortogonal a `role`.
 *
 * PLATFORM        → identidad autenticada por el flujo global actual (Prisma
 *                    global). Único valor emitido hoy por authorize().
 * RUNTIME_CLIENT  → reservado para login runtime contra una base de cliente
 *                    (FASE VI-C). NO HABILITADO todavía — ningún flujo de login
 *                    actual produce este valor.
 *
 * No es un enum de Prisma: pertenece al contrato de sesión/autenticación,
 * no al modelo persistente de User.
 */
export type AuthScope = "PLATFORM" | "RUNTIME_CLIENT";

const AUTH_SCOPE_VALUES: readonly AuthScope[] = ["PLATFORM", "RUNTIME_CLIENT"];

/**
 * Type guard de frontera para AuthScope. Cualquier valor proveniente de un
 * JWT/cookie (incluida una sesión creada antes de FASE VI-B, que no tendrá
 * este campo) debe pasar por aquí antes de tratarse como AuthScope válido.
 *
 * Un valor no reconocido (incluido `undefined`) retorna false — fail closed,
 * nunca se asume "PLATFORM" por defecto.
 */
export function isAuthScope(value: unknown): value is AuthScope {
  return typeof value === "string" && (AUTH_SCOPE_VALUES as readonly string[]).includes(value);
}

// ─── Contrato base cross-industry ─────────────────────────────────────────────

/**
 * Representa al usuario autenticado desde la perspectiva de la plataforma core.
 * Usa nombres genéricos independientes de cualquier industria.
 *
 * tenant_id   → identificador del gimnasio/tenant (columna gym_id en BD actual)
 * location_id → identificador de la sucursal (columna branch_id en BD actual)
 * role        → string genérico; cada industria lo narra con su propio enum
 * auth_scope  → FASE VI-B. `undefined` = ausente/no validado (fail closed en
 *               requireSuperAdmin/canAccessPlatformAdmin, nunca se interpreta
 *               como PLATFORM).
 *
 * Los nombres de columna en BD (gym_id, branch_id) son un detalle de
 * implementación de la capa de datos. El contrato de sesión usa tenant_id
 * y location_id desde el cierre de la Etapa 9.
 */
export type CoreSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  tenant_id: string;
  location_id: string | null;
  auth_scope: AuthScope | undefined;
};

// ─── Tipo puente para adaptación de sesión ────────────────────────────────────

/**
 * Tipo auxiliar usado exclusivamente en getCoreSession() para castear
 * session.user al shape esperado por toCoreSessionUser.
 *
 * El JWT post-9D emite tenant_id y location_id directamente, por lo que
 * gym_id y branch_id ya no existen en sesión. Este tipo modela el mínimo
 * necesario para que toCoreSessionUser pueda leer tenant_id y location_id
 * desde el objeto de sesión sin depender del tipo estático de NextAuth.
 *
 * `auth_scope` aquí es `unknown` deliberadamente: el valor crudo del JWT no
 * está validado todavía en este punto — toCoreSessionUser es quien lo valida
 * con isAuthScope() antes de producir el CoreSessionUser final.
 *
 * No usar en módulos GYM. SessionUser en @/lib/permissions/guards es el
 * tipo correcto para código del dominio GYM.
 */
export type GymSessionUser = Omit<CoreSessionUser, "auth_scope"> & {
  auth_scope?: unknown;
  /** Preservado para compatibilidad con el cast en getCoreSession(). */
  gym_id?: string;
  /** Preservado para compatibilidad con el cast en getCoreSession(). */
  branch_id?: string | null;
};

// ─── Utilidad de adaptación ────────────────────────────────────────────────────

/**
 * Extrae los campos CoreSessionUser desde un objeto de sesión.
 * Usado internamente por getCoreSession() en src/core/permissions/guards.ts.
 *
 * Valida `auth_scope` con isAuthScope() en esta frontera: un valor ausente,
 * corrupto o de una sesión creada antes de FASE VI-B se normaliza a
 * `undefined` — nunca se asume "PLATFORM" por defecto (fail closed).
 *
 * Para módulos GYM, usar getSessionOrRedirect() de @/lib/permissions/guards.
 * Para módulos core, usar getCoreSession() de @/core/permissions/guards.
 */
export function toCoreSessionUser(user: GymSessionUser): CoreSessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenant_id: user.tenant_id,
    location_id: user.location_id,
    auth_scope: isAuthScope(user.auth_scope) ? user.auth_scope : undefined,
  };
}
