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
//
// FASE VI-E6B — reemplaza requireAdmin + getEffectiveLocationId +
// resolveCommercialEnforcementContext manual por
// requireOperationalContext, mismo patrón que transmit-dte-document.action.ts
// (VI-E5B) y reconcile-dte-with-mh.action.ts (VI-E6A).

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import {
  transmitInvalidationEvent,
  type TransmitInvalidationEventResult,
} from "../services/transmit-invalidation-event.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type { TransmitInvalidationEventResult };

export async function transmitInvalidationEventAction(
  invalidationEventId: string,
): Promise<TransmitInvalidationEventResult> {
  const sessionUser = await requireAdmin();

  if (!invalidationEventId) return { ok: false, error: "El ID del evento de invalidación es requerido." };

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!context.locationId) {
      return { ok: false, error: "La sesión no tiene una location activa." };
    }

    const result = await transmitInvalidationEvent(
      {
        invalidationEventId,
        userId:     context.effectiveUser.id,
        tenantId:   context.tenantId,
        locationId: context.locationId,
      },
      context.client,
    );

    if (result.ok) {
      revalidatePath("/dashboard/sales");
      revalidatePath("/dashboard/dte/outgoing");
    }

    return result;
  } finally {
    await dispose();
  }
}
