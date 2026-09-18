"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-ccfe-json-for-sale.action.ts
//
// Genera el json_document preliminar para un DteOutgoingDocument
// de tipo CCFE 03 en estado PENDING_GENERATION.
//
// Cambia dte_status de PENDING_GENERATION → GENERATED.
//
// Reglas:
//   - Solo CCFE 03. FE 01 usa generate-fe-json-for-sale.action.ts.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO toca inventario.
//   - NO modifica generation_code ni control_number.
//   - tenant_id y location_id se inyectan desde sesión — nunca del input.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import { generateCcfeJsonForDte } from "../services/generate-ccfe-json.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type GenerateCcfeJsonForSaleActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function generateCcfeJsonForSaleAction(
  dte_document_id: string,
): Promise<GenerateCcfeJsonForSaleActionResult> {
  const sessionUser = await requireAdmin();

  if (!dte_document_id) return { ok: false, error: "El ID del documento DTE es requerido." };

  // FASE VI-E3: contexto operacional runtime — DteOutgoingDocument, Sale
  // y DteIssuerConfig se leen/actualizan SIEMPRE en la misma DB efectiva.
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

    const result = await generateCcfeJsonForDte(
      dte_document_id,
      context.tenantId,
      context.locationId,
      context.effectiveUser.id,
      context.client,
    );

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/dte/outgoing");

    return { ok: true };
  } finally {
    await dispose();
  }
}
