"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — create-sale-draft.action.ts
//
// Crea una venta nueva en estado DRAFT.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { createSaleDraftSchema } from "../schemas/sale.schemas";
import { createSaleDraft } from "../services/sale.service";
import type { CreateSaleDraftInput } from "../schemas/sale.schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type CreateSaleDraftActionResult =
  | { ok: true; id: string; sale_code: string }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function createSaleDraftAction(
  input: CreateSaleDraftInput,
): Promise<CreateSaleDraftActionResult> {
  const sessionUser = await requireAdmin();

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

    const parsed = createSaleDraftSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok:     false,
        error:  "Datos de venta no válidos.",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const result = await createSaleDraft(context.tenantId, location_id, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      return result.field
        ? { ok: false, field: result.field, error: result.error }
        : { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/sales/new");

    return { ok: true, id: result.id, sale_code: result.sale_code };
  } finally {
    await dispose();
  }
}
