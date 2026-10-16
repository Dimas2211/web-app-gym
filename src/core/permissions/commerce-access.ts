/**
 * Política de autorización de Commerce (ventas, caja) — pura, sin I/O.
 *
 * Separa dos niveles que antes se confundían bajo canManageStaff:
 *
 *   - OPERAR Commerce (canOperateCommerce): capturar/confirmar ventas,
 *     abrir/cerrar sesión de caja, registrar movimientos, consultar
 *     historial y cortes. super_admin, branch_admin, reception.
 *   - ADMINISTRAR Commerce (canManageStaff): crear/editar/desactivar
 *     cajas registradoras, exportaciones, acciones fiscales DTE.
 *     super_admin, branch_admin.
 *
 * Alcance: un operador sin isGlobal opera EXCLUSIVAMENTE en su sucursal
 * fija (location_id de la identidad). Si no tiene una, se deniega — nunca
 * se le permite elegir sucursal vía cookie de location activa.
 *
 * El `role` evaluado debe ser el rol EFECTIVO (LIVE para RUNTIME_CLIENT:
 * context.effectiveUser.role / context.effectiveRole), nunca solo el JWT.
 */

import { getCapabilities } from "@/core/permissions/role-capabilities";

export const COMMERCE_ACCESS_MESSAGES = {
  ROLE: "Sin permisos para esta operación.",
  LOCATION_REQUIRED: "Tu cuenta no tiene una sucursal asignada para operar.",
  BRANCH_REASSIGNED:
    "Tu sucursal asignada cambió. Inicia sesión nuevamente para operar en tu nueva sede.",
} as const;

export type CommerceAccessDenialReason = keyof typeof COMMERCE_ACCESS_MESSAGES;

/** Motivos que evalúa la política pura (sin I/O). BRANCH_REASSIGNED requiere DB. */
type PolicyDenialReason = Exclude<CommerceAccessDenialReason, "BRANCH_REASSIGNED">;

export type CommerceAccessDecision =
  | { ok: true }
  | { ok: false; reason: PolicyDenialReason; message: string };

/** ¿Puede el rol operar ventas/caja? (no implica administración) */
export function canOperateCommerce(role: string): boolean {
  return getCapabilities(role).canOperateCommerce;
}

/** ¿Puede el rol administrar Commerce (cajas, exportaciones, DTE)? */
export function canAdministerCommerce(role: string): boolean {
  return getCapabilities(role).canManageStaff;
}

/**
 * Decide si una identidad efectiva puede operar Commerce.
 * `locationId` es la sucursal FIJA de la identidad (no la de cookie).
 */
export function evaluateCommerceOperatorAccess(input: {
  role: string;
  locationId: string | null | undefined;
}): CommerceAccessDecision {
  const caps = getCapabilities(input.role);
  if (!caps.canOperateCommerce) {
    return { ok: false, reason: "ROLE", message: COMMERCE_ACCESS_MESSAGES.ROLE };
  }
  if (!caps.isGlobal && !input.locationId) {
    return {
      ok: false,
      reason: "LOCATION_REQUIRED",
      message: COMMERCE_ACCESS_MESSAGES.LOCATION_REQUIRED,
    };
  }
  return { ok: true };
}
