// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — soporte común de las acciones administrativas nuevas
// (series, actividades, ausencias, modalidades).
//
// La autorización usa SIEMPRE el rol LIVE del contexto operacional
// (context.effectiveUser), nunca el rol del JWT ni lo que muestre la UI:
//  - super_admin (isGlobal): todo el tenant;
//  - branch_admin (canManageStaff): solo su sucursal (context.locationId);
//  - reception / trainer / client: sin administración GYM nueva.
// ─────────────────────────────────────────────────────────────────

import type { UserRole } from "@prisma/client";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import type { OperationalContext } from "@/modules/platform/runtime/require-operational-context";
import { mapGymBookingDbError } from "../booking/booking-db-errors";

export type GymAdminScope =
  | { ok: true; isGlobal: boolean; locationId: string | null }
  | { ok: false; error: string };

/** Alcance administrativo LIVE (SA = tenant, BA = su sucursal). */
export function gymAdminScope(context: Pick<OperationalContext, "effectiveUser" | "locationId">): GymAdminScope {
  const caps = getCapabilities(context.effectiveUser.role as UserRole);
  if (caps.isGlobal) return { ok: true, isGlobal: true, locationId: null };
  if (caps.canManageStaff && context.locationId) {
    return { ok: true, isGlobal: false, locationId: context.locationId };
  }
  return { ok: false, error: "Sin permisos para esta operación." };
}

/** Mismo texto que LIVE_IDENTITY_CHANGED_MESSAGE de GYM-4 (trainer-access). */
const IDENTITY_CHANGED_MESSAGE = "Tu rol o tu sede cambiaron. Vuelve a iniciar sesión para continuar.";

/**
 * LIVE-2 — alcance administrativo con la identidad VIGENTE, leída en la base
 * efectiva de la operación (context.client). En PLATFORM_NATIVE el rol, el
 * tenant y la sede del contexto salen del JWT (hasta 8 h); en RUNTIME_CLIENT
 * el rol es LIVE pero la sede sigue siendo la del JWT. Exige, fail closed:
 *  - usuario existente y activo, del tenant efectivo;
 *  - rol vigente = rol de la sesión, y administrativo (SA / BA);
 *  - BA: su sede vigente (users.branch_id) = la sede de la sesión, activa.
 * Ante cualquier discrepancia se pide iniciar una sesión nueva.
 */
export async function liveGymAdminScope(
  context: Pick<OperationalContext, "effectiveUser" | "locationId" | "tenantId" | "client" | "readOnly">
): Promise<GymAdminScope> {
  const changed = { ok: false, error: IDENTITY_CHANGED_MESSAGE } as const;
  if (context.readOnly) return { ok: false, error: "Sin permisos para esta operación." };
  const live = await context.client.user.findUnique({
    where: { id: context.effectiveUser.id },
    select: { status: true, tenant_id: true, role: true, branch_id: true },
  });
  if (!live || live.status !== "active" || live.tenant_id !== context.tenantId) return changed;
  if (live.role !== context.effectiveUser.role) return changed;
  const scope = gymAdminScope({ effectiveUser: { ...context.effectiveUser, role: live.role }, locationId: context.locationId });
  if (!scope.ok || scope.isGlobal) return scope;
  if (live.branch_id !== scope.locationId) return changed;
  const branch = await context.client.branch.findFirst({
    where: { id: scope.locationId!, tenant_id: context.tenantId, status: "active" },
    select: { id: true },
  });
  return branch ? scope : changed;
}

/** ¿El alcance cubre la sucursal? `null` = registro de todas las sedes (solo SA). */
export function scopeCoversLocation(scope: Extract<GymAdminScope, { ok: true }>, locationId: string | null): boolean {
  return scope.isGlobal || (locationId !== null && locationId === scope.locationId);
}

/** Mensaje para un rechazo de los triggers/FKs de 2A; null si no es uno conocido. */
export function gymAdminDbErrorMessage(err: unknown): string | null {
  switch (mapGymBookingDbError(err)) {
    case "TENANT_MISMATCH":
      return "La referencia no pertenece a esta organización.";
    case "CROSS_LOCATION":
      return "La referencia no pertenece a la sucursal correspondiente.";
    case "DEPENDENT_RECORDS_CONFLICT":
      return "El cambio afecta registros vigentes que dependen de este (sesiones, series o membresías). Resuélvelos primero.";
    case "CONCURRENT_UPDATE_RETRY":
      return "Otro usuario modificó estos datos al mismo tiempo. Intenta nuevamente.";
    default:
      return null;
  }
}

export function isUniqueViolation(err: unknown): err is { code: string; meta?: { target?: unknown } } {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/** Campos del índice único violado (Prisma P2002), si se conocen. */
export function uniqueViolationFields(err: unknown): string[] {
  if (!isUniqueViolation(err)) return [];
  const target = err.meta?.target;
  if (Array.isArray(target)) return target.map(String);
  return typeof target === "string" ? [target] : [];
}
