"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — recalculate-sale-totals.action.ts
//
// Recalcula los totales de una venta en estado DRAFT.
// Útil para correcciones manuales o sincronización.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { recalculateSaleTotals } from "../services/sale.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type RecalculateSaleTotalsActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function recalculateSaleTotalsAction(
  sale_id: string,
): Promise<RecalculateSaleTotalsActionResult> {
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

    const result = await recalculateSaleTotals(sale_id, context.tenantId, location_id, context.effectiveUser.id, context.client);

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath(`/dashboard/sales/${sale_id}`);

    return { ok: true };
  } finally {
    await dispose();
  }
}
