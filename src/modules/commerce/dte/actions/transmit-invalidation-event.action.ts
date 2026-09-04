"use server";

// commerce/dte — transmit-invalidation-event.action.ts
//
// Server Action: transmite un DteInvalidationEvent en estado SIGNED a MH.
// Transición: SIGNED → ACCEPTED | REJECTED
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id siempre desde sesión.
//   - No devuelve signed_jws ni token al cliente.

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  transmitInvalidationEvent,
  type TransmitInvalidationEventResult,
} from "../services/transmit-invalidation-event.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type { TransmitInvalidationEventResult };

export async function transmitInvalidationEventAction(
  invalidationEventId: string,
): Promise<TransmitInvalidationEventResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)           return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)         return { ok: false, error: "La sesión no tiene una location activa." };
  if (!invalidationEventId) return { ok: false, error: "El ID del evento de invalidación es requerido." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const result = await transmitInvalidationEvent({
    invalidationEventId,
    userId:     sessionUser.id,
    tenantId:   tenant_id,
    locationId: location_id,
  });

  if (result.ok) {
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/dte/outgoing");
  }

  return result;
}
