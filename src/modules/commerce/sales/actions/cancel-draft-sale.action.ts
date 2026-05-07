"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — cancel-draft-sale.action.ts
//
// Cancela una venta en estado DRAFT.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { cancelDraftSale } from "../services/sale.service";

export type CancelDraftSaleActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function cancelDraftSaleAction(
  sale_id: string,
): Promise<CancelDraftSaleActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };
  if (!sale_id?.trim()) return { ok: false, error: "El ID de venta es requerido." };

  const result = await cancelDraftSale(sale_id, tenant_id, location_id, sessionUser.id);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/sales");
  revalidatePath(`/dashboard/sales/${sale_id}`);

  return { ok: true };
}
