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
 */

// ─── Contrato base cross-industry ─────────────────────────────────────────────

/**
 * Representa al usuario autenticado desde la perspectiva de la plataforma core.
 * Usa nombres genéricos independientes de cualquier industria.
 *
 * tenant_id   → identificador del gimnasio/tenant (columna gym_id en BD actual)
 * location_id → identificador de la sucursal (columna branch_id en BD actual)
 * role        → string genérico; cada industria lo narra con su propio enum
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
 * No usar en módulos GYM. SessionUser en @/lib/permissions/guards es el
 * tipo correcto para código del dominio GYM.
 */
export type GymSessionUser = CoreSessionUser & {
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
  };
}
