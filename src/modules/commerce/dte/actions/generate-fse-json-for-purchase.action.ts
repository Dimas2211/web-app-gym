"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fse-json-for-purchase.action.ts
//
// Genera + persiste + valida (AJV) el json_document para un
// DteOutgoingDocument tipo FSE 14 en estado PENDING_GENERATION.
//
// Reglas:
//   - Solo FSE 14 con purchase_id.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO toca inventario.
//   - tenant_id y location_id se inyectan desde sesión — nunca del input.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin }   from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { generateAndPersistFseJsonForDte } from "../services/generate-fse-json-pipeline.service";
import type { DteValidationError } from "../services/validate-dte-json-schema.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type GenerateFseJsonForPurchaseActionResult =
  | { ok: true; dte_status: string; validation_errors?: DteValidationError[] }
  | { ok: false; error: string };

export async function generateFseJsonForPurchaseAction(
  dte_document_id: string,
): Promise<GenerateFseJsonForPurchaseActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)       return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)     return { ok: false, error: "La sesión no tiene una location activa." };
  if (!dte_document_id) return { ok: false, error: "El ID del documento DTE es requerido." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const result = await generateAndPersistFseJsonForDte({
    tenant_id,
    location_id,
    dte_document_id,
    user_id: sessionUser.id,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "No se pudo generar el JSON FSE." };
  }

  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/dte/outgoing");

  return {
    ok:                 true,
    dte_status:         result.dte_status ?? "GENERATED",
    validation_errors:  result.validation_errors,
  };
}
