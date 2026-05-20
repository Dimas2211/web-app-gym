"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-credit-note-dte.action.ts
//
// Crea un DteOutgoingDocument tipo "05" (Nota de Crédito) en estado
// PENDING_GENERATION desde un CCFE 03 ACCEPTED.
//
// Reglas:
//   - NO genera el JSON DTE.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - Solo acepta CCFE tipo "03" en estado ACCEPTED como origen.
//   - tenant_id y location_id se inyectan desde sesión.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// ─────────────────────────────────────────────────────────────────

import { z }                       from "zod";
import { revalidatePath }          from "next/cache";
import { requireAdmin }            from "@/lib/permissions/guards";
import { getEffectiveLocationId }  from "@/lib/location/active-location";
import { createCreditNoteDteFromAcceptedCcfe } from "../services/create-credit-note-dte.service";

const createCreditNoteInputSchema = z.object({
  sourceDteDocumentId: z.string().uuid("El ID del documento fuente debe ser un UUID válido."),
  reasonCode:          z.string().trim().min(1).max(20).optional(),
  reasonText:          z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres.").max(500),
});

export type CreateCreditNoteDteInput = z.infer<typeof createCreditNoteInputSchema>;

export type CreateCreditNoteDteActionResult =
  | {
      ok:              true;
      creditNoteDteId: string;
      controlNumber:   string;
      generationCode:  string;
      dteStatus:       "PENDING_GENERATION";
    }
  | { ok: false; message: string; errors?: Record<string, string[]> };

export async function createCreditNoteDteAction(
  rawInput: CreateCreditNoteDteInput,
): Promise<CreateCreditNoteDteActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, message: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, message: "La sesión no tiene una location activa." };

  const parsed = createCreditNoteInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok:      false,
      message: "Datos de la Nota de Crédito no válidos.",
      errors:  parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await createCreditNoteDteFromAcceptedCcfe({
    sourceDteDocumentId: parsed.data.sourceDteDocumentId,
    reasonCode:          parsed.data.reasonCode,
    reasonText:          parsed.data.reasonText,
    userId:              sessionUser.id,
    tenantId:            tenant_id,
    locationId:          location_id,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath("/dashboard/dte/outgoing");

  return {
    ok:              true,
    creditNoteDteId: result.creditNoteDteId,
    controlNumber:   result.controlNumber,
    generationCode:  result.generationCode,
    dteStatus:       result.dteStatus,
  };
}
