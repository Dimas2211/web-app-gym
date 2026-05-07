"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — update-sale-item.action.ts
//
// Edita una línea de una venta en estado DRAFT.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { updateSaleItemSchema } from "../schemas/sale.schemas";
import { updateSaleItemInDraft } from "../services/sale.service";
import type { UpdateSaleItemInput } from "../schemas/sale.schemas";

export type UpdateSaleItemActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function updateSaleItemAction(
  item_id: string,
  sale_id: string,
  input:   UpdateSaleItemInput,
): Promise<UpdateSaleItemActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };
  if (!sale_id?.trim()) return { ok: false, error: "El ID de venta es requerido." };
  if (!item_id?.trim()) return { ok: false, error: "El ID de línea es requerido." };

  const parsed = updateSaleItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok:     false,
      error:  "Datos de línea no válidos.",
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await updateSaleItemInDraft(item_id, sale_id, tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { ok: false, field: result.field, error: result.error }
      : { ok: false, error: result.error };
  }

  revalidatePath(`/dashboard/sales/${sale_id}`);

  return { ok: true };
}
