"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — transmit-dte-document.action.ts
//
// Server Action: transmite un DteOutgoingDocument en estado SIGNED a MH.
// Transición: SIGNED → ACCEPTED | OBSERVED | REJECTED
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id siempre desde sesión.
//   - No devuelve signed_jws ni token al cliente.
//   - Solo indica el estado fiscal final y datos no sensibles.
//
// FASE VI-E5B — reemplaza requireAdmin + getEffectiveLocationId +
// resolveCommercialEnforcementContext/assertOrganizationModule manual
// por requireOperationalContext (mismo patrón certificado en VI-E3/E4/
// E5A). RUNTIME_CLIENT transmite contra su propia runtime DB
// (context.client); Support Session (SUPPORT_RUNTIME) es read-only ->
// requireOperationalContext rechaza con READ_ONLY antes de tocar el
// documento, MH o el ledger de metering; PLATFORM_NATIVE conserva su
// comportamiento previo (Prisma global).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import {
  transmitDteDocument,
  type TransmitDteDocumentResult,
} from "../services/transmit-dte-document.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type { TransmitDteDocumentResult };

export async function transmitDteDocumentAction(
  dteDocumentId: string,
): Promise<TransmitDteDocumentResult> {
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

    const result = await transmitDteDocument(
      {
        dteDocumentId,
        userId:     context.effectiveUser.id,
        tenantId:   context.tenantId,
        locationId: context.locationId,
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
