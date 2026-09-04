"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fe-json-for-sale.action.ts
//
// Genera el json_document preliminar para un DteOutgoingDocument
// de tipo FE 01 en estado PENDING_GENERATION.
//
// Cambia dte_status de PENDING_GENERATION → GENERATED.
//
// Reglas:
//   - Solo FE 01. CCFE 03 queda para Fase 4I-3.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO toca inventario.
//   - NO modifica generation_code ni control_number.
//   - tenant_id y location_id se inyectan desde sesión — nunca del input.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin }   from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { generateFeJsonForDte } from "../services/generate-fe-json.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type GenerateFeJsonForSaleActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function generateFeJsonForSaleAction(
  dte_document_id: string,
): Promise<GenerateFeJsonForSaleActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)         return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)       return { ok: false, error: "La sesión no tiene una location activa." };
  if (!dte_document_id)   return { ok: false, error: "El ID del documento DTE es requerido." };

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return { ok: false, error: RUNTIME_READONLY_MESSAGE };
  }

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const result = await generateFeJsonForDte(
    dte_document_id,
    tenant_id,
    location_id,
    sessionUser.id,
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/dte/outgoing");

  return { ok: true };
}
