"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — reopen-rejected-dte-for-resign.action.ts
//
// Reabre un DteOutgoingDocument REJECTED por firma inválida (MH 802)
// para permitir re-firma con el mismo documento/correlativo. Ver
// reopen-rejected-dte-for-resign.service.ts para las reglas completas.
//
// NUNCA transmite. Solo deja el documento en SCHEMA_VALIDATED, listo
// para que el flujo normal de firma (signDteDocumentAction, ya migrado
// a runtime en VI-E5A) lo firme de nuevo — en la MISMA runtime DB.
//
// FASE VI-E5A — reemplaza requireAdmin + getEffectiveLocationId +
// resolveCommercialEnforcementContext manual por
// requireOperationalContext, igual que sign-dte-document.action.ts. El
// documento se reabre en context.client — nunca en el Prisma global —
// para que quede en la misma runtime DB donde después se firmará.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { reopenRejectedDteForResign } from "../services/reopen-rejected-dte-for-resign.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type ReopenRejectedDteForResignActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function reopenRejectedDteForResignAction(
  dteDocumentId: string,
): Promise<ReopenRejectedDteForResignActionResult> {
  const sessionUser = await requireAdmin();

  if (!dteDocumentId) return { ok: false, error: "El ID del documento DTE es requerido." };

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

    const result = await reopenRejectedDteForResign(
      {
        dteDocumentId,
        tenantId:   context.tenantId,
        locationId: context.locationId,
        userId:     context.effectiveUser.id,
      },
      context.client,
    );

    if (result.ok) {
      revalidatePath("/dashboard/sales");
      revalidatePath("/dashboard/purchases");
      revalidatePath("/dashboard/dte/outgoing");
    }

    return result;
  } finally {
    await dispose();
  }
}
