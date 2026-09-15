"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — add-sale-item.action.ts
//
// Agrega una línea de producto a una venta en estado DRAFT.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { addSaleItemSchema } from "../schemas/sale.schemas";
import { addSaleItemToDraft } from "../services/sale.service";
import type { AddSaleItemInput } from "../schemas/sale.schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type AddSaleItemActionResult =
  | { ok: true; item_id: string; line_number: number }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function addSaleItemAction(
  sale_id: string,
  input:   AddSaleItemInput,
): Promise<AddSaleItemActionResult> {
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

    const parsed = addSaleItemSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok:     false,
        error:  "Datos de línea no válidos.",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const result = await addSaleItemToDraft(sale_id, context.tenantId, location_id, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      return result.field
        ? { ok: false, field: result.field, error: result.error }
        : { ok: false, error: result.error };
    }

    revalidatePath(`/dashboard/sales/${sale_id}`);

    return { ok: true, item_id: result.item_id, line_number: result.line_number };
  } finally {
    await dispose();
  }
}
