/**
 * Mapa de capacidades de rol para la capa core de la plataforma.
 *
 * ESTADO: Fase 2 — contrato puro. Sin impacto funcional.
 * Los guards actuales en @/lib/permissions/guards.ts no usan este mapa todavía.
 * Este archivo existe como contrato y utilidad para módulos nuevos en src/core/.
 *
 * PROPÓSITO:
 * Los guards actuales comparan nombres de rol directamente:
 *   if (user.role === "super_admin") ...
 * Ese patrón no es cross-industry porque "super_admin" es un nombre GYM-específico.
 *
 * El mapa de capacidades permite escribir guards genéricos:
 *   if (getCapabilities(user.role).isGlobal) ...
 * ...que funcionan independientemente de cómo se llamen los roles en cada industria.
 */

// ─── Tipo de capacidades ───────────────────────────────────────────────────────

export type RoleCapabilities = {
  /**
   * Acceso sin restricción de ubicación dentro del tenant.
   * Equivale a super_admin en GYM.
   */
  isGlobal: boolean;

  /**
   * Puede crear, editar o desactivar ubicaciones (branches/sucursales).
   */
  canManageLocations: boolean;

  /**
   * Puede crear y gestionar cuentas de staff dentro de su scope.
   */
  canManageStaff: boolean;

  /**
   * Puede registrar, editar o gestionar miembros/clientes.
   */
  canManageMembers: boolean;

  /**
   * Puede ver datos operativos del tenant (clases, agenda, reportes básicos).
   */
  canViewOperations: boolean;

  /**
   * Puede acceder a reportes y analíticas.
   */
  canViewReports: boolean;

  /**
   * Alcance de acceso a datos:
   * - "global"   → ve todo el tenant (super_admin)
   * - "location" → ve solo su sucursal (branch_admin, reception, trainer)
   * - "own_data" → ve solo sus propios registros (client/member)
   */
  scopeType: "global" | "location" | "own_data";
};

// ─── Mapa GYM → capacidades ────────────────────────────────────────────────────

/**
 * Mapa de capacidades para los roles actuales del sistema GYM.
 * Si se añade una nueva industria, se define un mapa equivalente
 * para sus propios roles; los guards core leen del mapa, no del nombre.
 */
const GYM_ROLE_CAPABILITIES: Record<string, RoleCapabilities> = {
  super_admin: {
    isGlobal: true,
    canManageLocations: true,
    canManageStaff: true,
    canManageMembers: true,
    canViewOperations: true,
    canViewReports: true,
    scopeType: "global",
  },
  branch_admin: {
    isGlobal: false,
    canManageLocations: false, // solo puede editar la propia
    canManageStaff: true,      // reception y trainer de su sucursal
    canManageMembers: true,
    canViewOperations: true,
    canViewReports: true,
    scopeType: "location",
  },
  reception: {
    isGlobal: false,
    canManageLocations: false,
    canManageStaff: false,
    canManageMembers: true,
    canViewOperations: true,
    canViewReports: false,
    scopeType: "location",
  },
  trainer: {
    isGlobal: false,
    canManageLocations: false,
    canManageStaff: false,
    canManageMembers: false,
    canViewOperations: true,
    canViewReports: false,
    scopeType: "location",
  },
  client: {
    isGlobal: false,
    canManageLocations: false,
    canManageStaff: false,
    canManageMembers: false,
    canViewOperations: false,
    canViewReports: false,
    scopeType: "own_data",
  },
};

// ─── Fallback para roles desconocidos ─────────────────────────────────────────

const NO_CAPABILITIES: RoleCapabilities = {
  isGlobal: false,
  canManageLocations: false,
  canManageStaff: false,
  canManageMembers: false,
  canViewOperations: false,
  canViewReports: false,
  scopeType: "own_data",
};

// ─── API pública ───────────────────────────────────────────────────────────────

/**
 * Retorna las capacidades de un rol dado.
 * Acepta cualquier string — si el rol no está mapeado retorna NO_CAPABILITIES.
 *
 * @example
 * const caps = getCapabilities(user.role);
 * if (caps.isGlobal) { ... }
 * if (caps.canManageMembers && caps.scopeType === "location") { ... }
 */
export function getCapabilities(role: string): RoleCapabilities {
  return GYM_ROLE_CAPABILITIES[role] ?? NO_CAPABILITIES;
}

/**
 * Registra un mapa de capacidades para una industria adicional.
 * Permite que nuevas industrias definan sus propios roles sin modificar este archivo.
 *
 * @example
 * // En src/modules/spa/roles.ts:
 * registerIndustryCapabilities({
 *   spa_owner: { isGlobal: true, ... },
 *   therapist: { isGlobal: false, ... },
 * });
 */
export function registerIndustryCapabilities(
  map: Record<string, RoleCapabilities>
): void {
  Object.assign(GYM_ROLE_CAPABILITIES, map);
}
