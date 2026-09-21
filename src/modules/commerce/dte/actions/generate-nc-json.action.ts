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
import { generateNcJsonForDte }   from "../services/generate-nc-json.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

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

  if (!dteDocumentId) return { ok: false, message: "El ID del documento DTE es requerido." };

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, message: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!context.locationId) {
      return { ok: false, message: "La sesión no tiene una location activa." };
    }

    const result = await generateNcJsonForDte(
      {
        dteDocumentId,
        userId:     context.effectiveUser.id,
        tenantId:   context.tenantId,
        locationId: context.locationId,
      },
      context.client,
    );

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
  } finally {
    await dispose();
  }
}
