"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — update-sale-draft.action.ts
//
// Actualiza la cabecera de una venta en estado DRAFT.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { updateSaleDraftSchema } from "../schemas/sale.schemas";
import { updateSaleDraft } from "../services/sale.service";
import type { UpdateSaleDraftInput } from "../schemas/sale.schemas";

export type UpdateSaleDraftActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function updateSaleDraftAction(
  sale_id: string,
  input:   UpdateSaleDraftInput,
): Promise<UpdateSaleDraftActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };
  if (!sale_id?.trim()) return { ok: false, error: "El ID de venta es requerido." };

  const parsed = updateSaleDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok:     false,
      error:  "Datos de venta no válidos.",
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await updateSaleDraft(sale_id, tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { ok: false, field: result.field, error: result.error }
      : { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/sales");
  revalidatePath(`/dashboard/sales/${sale_id}`);

  return { ok: true };
}
