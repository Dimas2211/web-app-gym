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
import { createDteOutgoingDocumentDraftSchema } from "../schemas/dte-issuer-config.schemas";
import { createPendingDteForSale } from "../services/dte-outgoing.service";
import type { CreateDteOutgoingDocumentDraftInput } from "../schemas/dte-issuer-config.schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type CreatePendingDteForSaleActionResult =
  | { ok: true; dte_document_id: string }
  | { ok: false; error: string; errors?: Record<string, string[]> };

export async function createPendingDteForSaleAction(
  input: CreateDteOutgoingDocumentDraftInput,
): Promise<CreatePendingDteForSaleActionResult> {
  const sessionUser = await requireAdmin();

  // FASE VI-E3: contexto operacional runtime — reemplaza tenant/location
  // de sesión + gate comercial manual + Prisma global. RUNTIME_CLIENT crea
  // el DTE enteramente en su propia DB (Sale, correlativo, documento).
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

    const parsed = createDteOutgoingDocumentDraftSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok:     false,
        error:  "Datos del documento DTE no válidos.",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const result = await createPendingDteForSale(
      context.tenantId,
      context.locationId,
      context.effectiveUser.id,
      parsed.data,
      context.client,
    );

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath(`/dashboard/sales/${parsed.data.sale_id}`);
    revalidatePath("/dashboard/dte/outgoing");

    return { ok: true, dte_document_id: result.dte_document_id };
  } finally {
    await dispose();
  }
}
