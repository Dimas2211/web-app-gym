"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — remove-sale-item.action.ts
//
// Elimina una línea de una venta en estado DRAFT.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { removeSaleItemFromDraft } from "../services/sale.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type RemoveSaleItemActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function removeSaleItemAction(
  item_id: string,
  sale_id: string,
): Promise<RemoveSaleItemActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };
  if (!sale_id?.trim()) return { ok: false, error: "El ID de venta es requerido." };
  if (!item_id?.trim()) return { ok: false, error: "El ID de línea es requerido." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.sales");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const result = await removeSaleItemFromDraft(item_id, sale_id, tenant_id, location_id, sessionUser.id);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/dashboard/sales/${sale_id}`);

  return { ok: true };
}
