"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-pending-dte-for-purchase.action.ts
//
// Crea un DteOutgoingDocument tipo "14" (FSE) en estado
// PENDING_GENERATION, vinculado a una compra confirmada marcada
// explícitamente para FSE.
//
// Auto-resuelve la DteIssuerConfig activa para el tenant+location,
// igual que create-pending-dte-simple.action.ts hace para ventas.
//
// Reglas:
//   - NO genera el JSON DTE real.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - Solo crea el registro de seguimiento.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// FASE VI-E4A: contexto operacional runtime — reemplaza tenant/location
// de sesión + gate comercial manual + Prisma global. RUNTIME_CLIENT crea
// el FSE 14 enteramente en su propia DB (Purchase, correlativo, documento).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { createPendingDteForPurchase } from "../services/dte-outgoing.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type CreatePendingDteForPurchaseResult =
  | { ok: true; dte_document_id: string }
  | { ok: false; error: string };

export async function createPendingDteForPurchaseAction(
  purchase_id: string,
): Promise<CreatePendingDteForPurchaseResult> {
  const sessionUser = await requireAdmin();

  if (!purchase_id) return { ok: false, error: "El ID de compra es requerido." };

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

    // Resolver la configuración DTE activa para este tenant+location.
    // Si hay más de una config activa (TEST y PRODUCTION simultáneas),
    // no inferimos silenciosamente para no activar producción por accidente.
    const activeConfigs = await context.client.dteIssuerConfig.findMany({
      where:  { tenant_id: context.tenantId, location_id: context.locationId, is_active: true },
      select: { id: true, environment: true },
      take:   3,
    });

    if (activeConfigs.length === 0) {
      return {
        ok:    false,
        error: "No existe una configuración DTE activa para esta location. Configure el emisor DTE primero.",
      };
    }
    if (activeConfigs.length > 1) {
      return {
        ok:    false,
        error: "Hay más de una configuración DTE activa (TEST y PRODUCTION). Desactive una de las dos antes de generar DTE.",
      };
    }

    const issuerConfig = activeConfigs[0];

    const result = await createPendingDteForPurchase(
      context.tenantId,
      context.locationId,
      context.effectiveUser.id,
      {
        purchase_id,
        issuer_config_id: issuerConfig.id,
        environment:      issuerConfig.environment as "TEST" | "PRODUCTION",
      },
      context.client,
    );

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/purchases");
    revalidatePath(`/dashboard/purchases/${purchase_id}`);
    revalidatePath("/dashboard/dte/outgoing");

    return { ok: true, dte_document_id: result.dte_document_id };
  } finally {
    await dispose();
  }
}
