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
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type DiscardDraftSaleActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function discardDraftSaleAction(
  sale_id: string,
): Promise<DiscardDraftSaleActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)       return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)     return { ok: false, error: "La sesión no tiene una location activa." };
  if (!sale_id?.trim()) return { ok: false, error: "El ID de venta es requerido." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.sales");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const result = await discardDraftSale(sale_id, tenant_id, location_id);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/sales");

  return { ok: true };
}
