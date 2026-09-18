"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-pending-dte-simple.action.ts
//
// Wrapper simplificado para crear un DteOutgoingDocument en estado
// PENDING_GENERATION desde el contexto de ventas.
//
// Diferencia con create-pending-dte-for-sale.action.ts:
//   - Solo recibe sale_id.
//   - Auto-resuelve la DteIssuerConfig activa para el tenant+location.
//   - Valida precondiciones de negocio: CONFIRMED + inventory_moved.
//
// Reglas:
//   - NO genera JSON DTE.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - Solo tipos "01" (FE) y "03" (CCFE) en MVP.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { createPendingDteForSale } from "../services/dte-outgoing.service";
import { DTE_MVP_TYPE_CODES } from "../types/dte.types";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type CreatePendingDteSimpleResult =
  | { ok: true; dte_document_id: string }
  | { ok: false; error: string };

export async function createPendingDteSimpleAction(
  sale_id: string,
): Promise<CreatePendingDteSimpleResult> {
  const sessionUser = await requireAdmin();

  // FASE VI-E3: contexto operacional runtime — Sale, DteIssuerConfig y
  // DteOutgoingDocument se resuelven y crean SIEMPRE en la misma DB
  // efectiva (context.client). RUNTIME_CLIENT nunca toca Prisma global.
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
    if (!sale_id) {
      return { ok: false, error: "El ID de venta es requerido." };
    }

    const tenant_id   = context.tenantId;
    const location_id = context.locationId;

    // Cargar la venta y validar precondiciones de negocio — siempre desde
    // la misma DB efectiva (context.client), nunca lookup global.
    const sale = await context.client.sale.findFirst({
      where:  { id: sale_id, tenant_id, location_id },
      select: {
        id:                    true,
        status:                true,
        inventory_moved:       true,
        primary_dte_type_code: true,
      },
    });

    if (!sale) {
      return { ok: false, error: "La venta no existe o no pertenece a la location activa." };
    }
    if (sale.status !== "CONFIRMED") {
      return { ok: false, error: "Solo se puede generar DTE para ventas confirmadas." };
    }
    if (!sale.inventory_moved) {
      return { ok: false, error: "La venta aún no ha aplicado inventario. Aplica el inventario primero." };
    }

    const dteTypeCode = sale.primary_dte_type_code;
    if (!DTE_MVP_TYPE_CODES.includes(dteTypeCode as (typeof DTE_MVP_TYPE_CODES)[number])) {
      return {
        ok:    false,
        error: `El tipo DTE "${dteTypeCode}" no está soportado en esta fase. Solo se admiten FE (01) y CCFE (03).`,
      };
    }

    // Resolver la configuración DTE activa para este tenant+location.
    // Si hay más de una config activa (TEST y PRODUCTION simultáneas),
    // no inferimos silenciosamente para no activar producción por accidente.
    const activeConfigs = await context.client.dteIssuerConfig.findMany({
      where:  { tenant_id, location_id, is_active: true },
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

    const result = await createPendingDteForSale(
      tenant_id,
      location_id,
      context.effectiveUser.id,
      {
        sale_id,
        dte_type_code:    dteTypeCode as "01" | "03",
        issuer_config_id: issuerConfig.id,
        environment:      issuerConfig.environment as "TEST" | "PRODUCTION",
      },
      context.client,
    );

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/sales");
    revalidatePath(`/dashboard/sales/${sale_id}`);
    revalidatePath("/dashboard/dte/outgoing");

    return { ok: true, dte_document_id: result.dte_document_id };
  } finally {
    await dispose();
  }
}
