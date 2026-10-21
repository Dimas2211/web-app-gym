// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — soporte común de las Server Actions que delegan en
// GymBookingService (classes/actions.ts y client-portal/actions.ts).
//
// Archivo sin "use server": los archivos de acciones solo pueden exportar
// funciones async. Regla 2 del contrato: tenant/location SIEMPRE desde el
// OperationalContext y el rol LIVE (effectiveUser.role), nunca del JWT ni
// del formulario.
// ─────────────────────────────────────────────────────────────────

import type { OperationalContext } from "@/modules/platform/runtime/require-operational-context";
import type { GymBookingActor, GymBookingScope } from "./booking-contracts";

const ACTOR_ROLES: ReadonlySet<string> = new Set(["super_admin", "branch_admin", "reception", "trainer", "client"]);

export function bookingScopeFromContext(context: Pick<OperationalContext, "tenantId" | "locationId">): GymBookingScope {
  return { tenantId: context.tenantId, locationId: context.locationId };
}

/** Actor del servicio con rol LIVE; null si el rol no participa en reservas. */
export function bookingActorFromContext(context: Pick<OperationalContext, "effectiveUser">): GymBookingActor | null {
  const { id, role } = context.effectiveUser;
  if (!ACTOR_ROLES.has(role)) return null;
  return { userId: id, role: role as GymBookingActor["role"] };
}

/** Texto opcional del formulario: ausente → undefined (no se toca); vacío → null. */
export function optionalFormText(formData: FormData, field: string): string | null | undefined {
  if (!formData.has(field)) return undefined;
  const v = String(formData.get(field) ?? "").trim();
  return v === "" ? null : v;
}
