"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — reconcile-dte-with-mh.action.ts
//
// FASE IV-C — Server Action manual: "Consultar estado MH" para un
// DteOutgoingDocument incierto (típicamente dte_status=SIGNED tras un
// timeout/error técnico de transmisión). Envuelve reconcileDteWithMh
// (FASE IV-B, ya certificado real contra MH TEST — ver
// docs/modules/platform-phase-4b-dte-query-reconciliation.md).
//
// IMPORTANTE — esta action ES MUTATIVA aunque el nombre visual sea
// "consultar": puede llamar a MH, crear un DteTransmissionLog(QUERY),
// actualizar dte_status y resolver el ledger de metering comercial.
// Por eso, a diferencia de transmit-dte-document.action.ts, sí exige
// el guard completo de sesión runtime "Operar como cliente" —
// Support Session debe permanecer 100% read-only para esta operación,
// sin excepción y sin bypass posible desde el cliente.
//
// FASE VI-E6A — reemplaza requireAdmin + getEffectiveLocationId +
// resolveCommercialEnforcementContext manual por
// requireOperationalContext, igual que reopen-rejected-dte-for-resign.
// El documento se reconcilia en context.client — nunca en el Prisma
// global — para que la lectura del estado en MH, la credential
// (resolveMhAuthCredentials) y el ledger de metering resuelto sean
// todos de la MISMA runtime DB del tenant.
//
// Input desde el navegador: ÚNICAMENTE dteDocumentId. tenantId,
// locationId, issuerConfigId, environment, NIT y generationCode se
// resuelven siempre server-side (issuerConfigId/environment/NIT/
// generationCode dentro de reconcileDteWithMh mismo, a partir del
// documento ya scoped por tenant/location).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin }   from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { reconcileDteWithMh } from "../services/dte-reconciliation.service";

// ── Resultado público — nunca expone secretos, tokens ni rawResponse ──

export type ReconcileDteWithMhActionResult =
  | { ok: true; status: "RESOLVED"; dteStatus: "ACCEPTED" | "OBSERVED" }
  | { ok: true; status: "REPAIRED_LOCAL"; dteStatus: "ACCEPTED" | "OBSERVED" }
  | { ok: true; status: "NO_OP"; reason: "ALREADY_RESOLVED" | "NOT_APPLICABLE"; dteStatus: string }
  | { ok: true; status: "PENDING_UNCHANGED" }
  | { ok: false; status: "INCONSISTENT_LOCAL_STATE"; error: string }
  | { ok: false; status: "ABORTED_CONCURRENT_CHANGE"; error: string }
  | { ok: false; status: "BUSINESS_ERROR"; error: string }
  | { ok: false; error: string };

export async function reconcileDteWithMhAction(
  dteDocumentId: string,
): Promise<ReconcileDteWithMhActionResult> {
  const sessionUser = await requireAdmin();

  if (!dteDocumentId) return { ok: false, error: "El ID del documento DTE es requerido." };

  let handle;
  try {
    // write:true -> READ_ONLY (Support Session) rechaza ANTES de
    // cualquier llamada MH o mutación, sin excepción. module -> exige
    // fiscal.dte habilitado (MODULE_DISABLED si no).
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

    // reconcileDteWithMh ya valida internamente que dteDocumentId
    // pertenezca exactamente a tenant_id/location_id (findFirst scoped) —
    // devuelve BUSINESS_ERROR si no, sin llamar MH.
    const result = await reconcileDteWithMh({
      dteDocumentId,
      tenantId:   context.tenantId,
      locationId: context.locationId,
      runtimeDb:  context.client,
      userId:     context.effectiveUser.id,
    });

    if (result.status === "RESOLVED" || result.status === "REPAIRED_LOCAL" || result.status === "NO_OP") {
      revalidatePath("/dashboard/dte/outgoing");
      revalidatePath("/dashboard/dte/monitoring");
    }

    switch (result.status) {
      case "RESOLVED":
        return { ok: true, status: "RESOLVED", dteStatus: result.dteStatus };
      case "REPAIRED_LOCAL":
        return { ok: true, status: "REPAIRED_LOCAL", dteStatus: result.dteStatus };
      case "NO_OP":
        return { ok: true, status: "NO_OP", reason: result.reason, dteStatus: result.dteStatus };
      case "PENDING_UNCHANGED":
        // MH no dio evidencia concluyente — nunca se interpreta como
        // rechazo ni como "no existe". El documento permanece igual.
        return { ok: true, status: "PENDING_UNCHANGED" };
      case "INCONSISTENT_LOCAL_STATE":
        return { ok: false, status: "INCONSISTENT_LOCAL_STATE", error: result.detail };
      case "ABORTED_CONCURRENT_CHANGE":
        return { ok: false, status: "ABORTED_CONCURRENT_CHANGE", error: result.detail };
      case "BUSINESS_ERROR":
        return { ok: false, status: "BUSINESS_ERROR", error: result.error };
    }
  } finally {
    await dispose();
  }
}
