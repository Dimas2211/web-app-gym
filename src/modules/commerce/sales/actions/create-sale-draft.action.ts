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
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type CreateSaleDraftActionResult =
  | { ok: true; id: string; sale_code: string }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function createSaleDraftAction(
  input: CreateSaleDraftInput,
): Promise<CreateSaleDraftActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.sales");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const parsed = createSaleDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok:     false,
      error:  "Datos de venta no válidos.",
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await createSaleDraft(tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { ok: false, field: result.field, error: result.error }
      : { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/sales/new");

  return { ok: true, id: result.id, sale_code: result.sale_code };
}
