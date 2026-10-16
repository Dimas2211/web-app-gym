"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — discard-draft-sale.action.ts
//
// Descarta (elimina físicamente) una venta en estado DRAFT.
// No deja registro CANCELLED — el borrador desaparece sin rastro.
//
// Permiso: requireCommerceOperator + rol LIVE (super_admin | branch_admin | reception).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireCommerceOperator } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { discardDraftSale } from "../services/sale.service";
import { OperationalContextError } from "@/modules/platform/runtime/require-operational-context";
import { requireCommerceOperatorContext } from "@/modules/commerce/shared/require-commerce-operator-context";
import { checkOperationalGrant, revokeOperationalGrants } from "@/core/security/operational-authorization/operational-authorization";
import { OPERATIONAL_SCOPES, SALE_DRAFT_WRITE_SCOPES } from "@/core/security/operational-authorization/scopes";

export type DiscardDraftSaleActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function discardDraftSaleAction(
  sale_id: string,
): Promise<DiscardDraftSaleActionResult> {
  const sessionUser = await requireCommerceOperator();

  if (!sale_id?.trim()) return { ok: false, error: "El ID de venta es requerido." };

  let handle;
  try {
    handle = await requireCommerceOperatorContext(sessionUser, { module: "commerce.sales", write: true });
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

    // Autorización Operativa: solo el creador del borrador (SALE_DRAFT_OWNER); un borrador reabierto
    // con clave se elimina desde la consulta con SALE_DELETE_DRAFT.
    const grant = await checkOperationalGrant(context, [OPERATIONAL_SCOPES.SALE_DRAFT_OWNER], sale_id);
    if (!grant.ok) return { ok: false, error: grant.error };

    const result = await discardDraftSale(sale_id, context.tenantId, location_id, context.client);

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    await revokeOperationalGrants(SALE_DRAFT_WRITE_SCOPES, sale_id);
    revalidatePath("/dashboard/sales");

    return { ok: true };
  } finally {
    await dispose();
  }
}
