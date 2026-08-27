"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — reopen-rejected-dte-for-resign.action.ts
//
// Reabre un DteOutgoingDocument REJECTED por firma inválida (MH 802)
// para permitir re-firma con el mismo documento/correlativo. Ver
// reopen-rejected-dte-for-resign.service.ts para las reglas completas.
//
// NUNCA transmite. Solo deja el documento en SCHEMA_VALIDATED, listo
// para que el flujo normal de firma (signDteDocumentAction, sin
// modificar) lo firme de nuevo.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { reopenRejectedDteForResign } from "../services/reopen-rejected-dte-for-resign.service";

export type ReopenRejectedDteForResignActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function reopenRejectedDteForResignAction(
  dteDocumentId: string,
): Promise<ReopenRejectedDteForResignActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)     return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)   return { ok: false, error: "La sesión no tiene una location activa." };
  if (!dteDocumentId) return { ok: false, error: "El ID del documento DTE es requerido." };

  const result = await reopenRejectedDteForResign({
    dteDocumentId,
    tenantId:   tenant_id,
    locationId: location_id,
    userId:     sessionUser.id,
  });

  if (result.ok) {
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/purchases");
    revalidatePath("/dashboard/dte/outgoing");
  }

  return result;
}
