"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — validate-dte-json-schema.action.ts
//
// Server Action: valida el json_document de un DteOutgoingDocument
// contra el schema oficial MH. Transición GENERATED → SCHEMA_VALIDATED.
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id siempre desde sesión.
//   - Si valida: revalida paths de sales y dte/outgoing.
//   - Si falla: devuelve errores legibles sin modificar el documento.
//   - NO firma. NO transmite.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }        from "next/cache";
import { requireAdmin }          from "@/lib/permissions/guards";
import {
  validateDteJsonSchema,
  type ValidateDteJsonSchemaResult,
} from "../services/validate-dte-json-schema.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type { ValidateDteJsonSchemaResult };

export async function validateDteJsonSchemaAction(
  dte_document_id: string,
): Promise<ValidateDteJsonSchemaResult> {
  const sessionUser = await requireAdmin();

  if (!dte_document_id) return { ok: false, error: "El ID del documento DTE es requerido." };

  // FASE VI-E3: contexto operacional runtime — GENERATED → SCHEMA_VALIDATED
  // se resuelve/persiste siempre en la misma DB efectiva.
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

    const result = await validateDteJsonSchema(
      dte_document_id,
      context.tenantId,
      context.locationId,
      context.effectiveUser.id,
      context.client,
    );

    if (result.ok) {
      revalidatePath("/dashboard/sales");
      revalidatePath("/dashboard/dte/outgoing");
    }

    return result;
  } finally {
    await dispose();
  }
}
