/**
 * Contratos de identidad para la capa core de la plataforma.
 *
 * ESTADO: Fase 2 — solo tipos. Sin impacto funcional.
 * El sistema GYM actual sigue usando SessionUser de @/lib/permissions/guards.
 * Estos tipos existen como contrato futuro y no reemplazan ningún import.
 *
 * CUANDO USAR ESTOS TIPOS:
 * - Al escribir nuevos módulos en src/core/ que deban ser cross-industry.
 * - Como referencia para la futura abstracción de guards.ts.
 * - No usar en módulos GYM existentes hasta que se complete la Fase 3.
 */

// ─── Contrato base cross-industry ─────────────────────────────────────────────

/**
 * Representa al usuario autenticado desde la perspectiva de la plataforma core.
 * Usa nombres genéricos independientes de cualquier industria.
 *
 * tenant_id   → reemplazará gym_id en Fase 3
 * location_id → reemplazará branch_id en Fase 3
 * role        → string genérico; cada industria lo narra con su propio enum
 */
export type CoreSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  tenant_id: string;
  location_id: string | null;
};

// ─── Adaptador GYM (Fase 2 — compatibilidad temporal) ─────────────────────────

/**
 * Extiende CoreSessionUser con los campos GYM-específicos del JWT actual.
 * Permite que código nuevo target CoreSessionUser mientras el JWT sigue
 * emitiendo gym_id y branch_id.
 *
 * TRANSICIÓN:
 * - Hoy: SessionUser en guards.ts usa gym_id/branch_id directamente.
 * - Futuro: guards.ts adoptará GymSessionUser y expondrá CoreSessionUser.
 * - Fase 3: gym_id y branch_id desaparecerán del JWT; solo quedarán
 *   tenant_id y location_id.
 */
export type GymSessionUser = CoreSessionUser & {
  /** Alias temporal: mismo valor que tenant_id mientras dure la transición. */
  gym_id: string;
  /** Alias temporal: mismo valor que location_id mientras dure la transición. */
  branch_id: string | null;
};

// ─── Utilidad de adaptación ────────────────────────────────────────────────────

/**
 * Convierte el SessionUser actual (con gym_id/branch_id) en un CoreSessionUser.
 * Usar en código nuevo que deba operar sobre el contrato core.
 *
 * @example
 * const sessionUser = await getSessionOrRedirect(); // retorna SessionUser GYM
 * const core = toCoreSesionUser(sessionUser);        // convierte al contrato core
 */
export function toCoreSessionUser(user: GymSessionUser): CoreSessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenant_id: user.gym_id,
    location_id: user.branch_id,
  };
}
