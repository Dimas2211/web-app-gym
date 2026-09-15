"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — discard-draft-sale.action.ts
//
// Descarta (elimina físicamente) una venta en estado DRAFT.
// No deja registro CANCELLED — el borrador desaparece sin rastro.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { discardDraftSale } from "../services/sale.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type DiscardDraftSaleActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function discardDraftSaleAction(
  sale_id: string,
): Promise<DiscardDraftSaleActionResult> {
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

    const result = await discardDraftSale(sale_id, context.tenantId, location_id, context.client);

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/sales");

    return { ok: true };
  } finally {
    await dispose();
  }
}
