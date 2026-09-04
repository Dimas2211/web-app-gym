"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-nc-json.action.ts
//
// Genera el json_document para un DteOutgoingDocument NC 05 en
// estado PENDING_GENERATION y lo mueve a GENERATED.
//
// Reglas:
//   - Solo NC 05. CCFE 03 usa generate-ccfe-json-for-sale.action.ts.
//   - La NC debe estar en PENDING_GENERATION y tener relación
//     CREDIT_NOTE_OF hacia un CCFE 03 ACCEPTED.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO toca inventario ni caja.
//   - tenant_id y location_id se inyectan desde sesión.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { generateNcJsonForDte }   from "../services/generate-nc-json.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type GenerateNcJsonActionResult =
  | {
      ok:             true;
      dteStatus:      "GENERATED";
      dteDocumentId:  string;
      controlNumber:  string;
      generationCode: string;
    }
  | { ok: false; message: string };

export async function generateNcJsonAction(
  dteDocumentId: string,
): Promise<GenerateNcJsonActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)    return { ok: false, message: "La sesión no tiene un tenant activo." };
  if (!location_id)  return { ok: false, message: "La sesión no tiene una location activa." };
  if (!dteDocumentId) return { ok: false, message: "El ID del documento DTE es requerido." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, message: err.userMessage };
    throw err;
  }

  const result = await generateNcJsonForDte({
    dteDocumentId,
    userId:     sessionUser.id,
    tenantId:   tenant_id,
    locationId: location_id,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath("/dashboard/dte/outgoing");

  return {
    ok:             true,
    dteStatus:      result.dteStatus,
    dteDocumentId:  result.dteDocumentId,
    controlNumber:  result.controlNumber,
    generationCode: result.generationCode,
  };
}
