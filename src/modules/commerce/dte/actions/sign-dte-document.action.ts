"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-dte-document.action.ts
//
// Server Action: firma un DteOutgoingDocument en estado SCHEMA_VALIDATED.
// Transición SCHEMA_VALIDATED → SIGNED.
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id siempre desde sesión.
//   - No devuelve signed_jws al frontend.
//   - Solo indica si la firma fue exitosa y el timestamp.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  signDteDocument,
  type SignDteDocumentResult,
} from "../services/sign-dte-document.service";

export type { SignDteDocumentResult };

export async function signDteDocumentAction(
  dteDocumentId: string,
): Promise<SignDteDocumentResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)     return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)   return { ok: false, error: "La sesión no tiene una location activa." };
  if (!dteDocumentId) return { ok: false, error: "El ID del documento DTE es requerido." };

  const result = await signDteDocument({
    dteDocumentId,
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
