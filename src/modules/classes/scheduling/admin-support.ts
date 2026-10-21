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
