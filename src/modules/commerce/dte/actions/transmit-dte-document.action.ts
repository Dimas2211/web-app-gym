"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — transmit-dte-document.action.ts
//
// Server Action: transmite un DteOutgoingDocument en estado SIGNED a MH.
// Transición: SIGNED → ACCEPTED | OBSERVED | REJECTED
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id siempre desde sesión.
//   - No devuelve signed_jws ni token al cliente.
//   - Solo indica el estado fiscal final y datos no sensibles.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  transmitDteDocument,
  type TransmitDteDocumentResult,
} from "../services/transmit-dte-document.service";

export type { TransmitDteDocumentResult };

export async function transmitDteDocumentAction(
  dteDocumentId: string,
): Promise<TransmitDteDocumentResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)     return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)   return { ok: false, error: "La sesión no tiene una location activa." };
  if (!dteDocumentId) return { ok: false, error: "El ID del documento DTE es requerido." };

  const result = await transmitDteDocument({
    dteDocumentId,
    userId:     sessionUser.id,
    tenantId:   tenant_id,
    locationId: location_id,
  });

  if (result.ok) {
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/purchases");
    revalidatePath("/dashboard/dte/outgoing");
  }

  return result;
}
