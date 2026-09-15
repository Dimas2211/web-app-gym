"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — confirm-sale.action.ts
//
// Confirma una venta DRAFT → CONFIRMED.
// Fase 4G: sin DTE real, sin SALE_OUT, sin movimientos de inventario.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { confirmSale } from "../services/sale.service";

export type ConfirmSaleActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function confirmSaleAction(
  sale_id: string,
): Promise<ConfirmSaleActionResult> {
  const sessionUser = await requireAdmin();

  if (!sale_id?.trim()) return { ok: false, error: "El ID de venta es requerido." };

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.sales", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(sessionUser, context.client, context.tenantId));
    if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

    const result = await confirmSale(sale_id, context.tenantId, location_id, context.effectiveUser.id, context.client);

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/sales/new");

    return { ok: true };
  } finally {
    await dispose();
  }
}
