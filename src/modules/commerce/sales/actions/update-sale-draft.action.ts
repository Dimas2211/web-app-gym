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
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type UpdateSaleDraftActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function updateSaleDraftAction(
  sale_id: string,
  input:   UpdateSaleDraftInput,
): Promise<UpdateSaleDraftActionResult> {
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

    const parsed = updateSaleDraftSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok:     false,
        error:  "Datos de venta no válidos.",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const result = await updateSaleDraft(sale_id, context.tenantId, location_id, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      return result.field
        ? { ok: false, field: result.field, error: result.error }
        : { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/sales");
    revalidatePath(`/dashboard/sales/${sale_id}`);

    return { ok: true };
  } finally {
    await dispose();
  }
}
