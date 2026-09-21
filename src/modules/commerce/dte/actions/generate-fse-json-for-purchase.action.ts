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
// FASE VI-E4A: contexto operacional runtime — DteOutgoingDocument,
// Purchase y DteIssuerConfig se leen/actualizan SIEMPRE en la misma DB
// efectiva.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin }   from "@/lib/permissions/guards";
import { generateAndPersistFseJsonForDte } from "../services/generate-fse-json-pipeline.service";
import type { DteValidationError } from "../services/validate-dte-json-schema.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type GenerateFseJsonForPurchaseActionResult =
  | { ok: true; dte_status: string; validation_errors?: DteValidationError[] }
  | { ok: false; error: string };

export async function generateFseJsonForPurchaseAction(
  dte_document_id: string,
): Promise<GenerateFseJsonForPurchaseActionResult> {
  const sessionUser = await requireAdmin();

  if (!dte_document_id) return { ok: false, error: "El ID del documento DTE es requerido." };

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

    const result = await generateAndPersistFseJsonForDte(
      {
        tenant_id:       context.tenantId,
        location_id:     context.locationId,
        dte_document_id,
        user_id:         context.effectiveUser.id,
      },
      context.client,
    );

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
  } finally {
    await dispose();
  }
}
