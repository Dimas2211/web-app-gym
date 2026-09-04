"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-pending-dte-for-sale.action.ts
//
// Crea un DteOutgoingDocument en estado PENDING_GENERATION
// vinculado a una venta.
//
// Reglas:
//   - NO genera el JSON DTE real.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - Solo crea el registro de seguimiento.
//   - Solo permite dte_type_code "01" (FE) y "03" (CCFE) en MVP.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { createDteOutgoingDocumentDraftSchema } from "../schemas/dte-issuer-config.schemas";
import { createPendingDteForSale } from "../services/dte-outgoing.service";
import type { CreateDteOutgoingDocumentDraftInput } from "../schemas/dte-issuer-config.schemas";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type CreatePendingDteForSaleActionResult =
  | { ok: true; dte_document_id: string }
  | { ok: false; error: string; errors?: Record<string, string[]> };

export async function createPendingDteForSaleAction(
  input: CreateDteOutgoingDocumentDraftInput,
): Promise<CreatePendingDteForSaleActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const parsed = createDteOutgoingDocumentDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok:     false,
      error:  "Datos del documento DTE no válidos.",
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await createPendingDteForSale(tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/dashboard/sales/${parsed.data.sale_id}`);
  revalidatePath("/dashboard/dte/outgoing");

  return { ok: true, dte_document_id: result.dte_document_id };
}
