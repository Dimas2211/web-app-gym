"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — update-purchase-payment-nature.action.ts
//
// Actualiza la Naturaleza del pago (y, si aplica, la base manual de
// servicios) de una compra FSE, recalculando y persistiendo la
// Retención de Renta server-side. Ver purchase.service.ts:
// updatePurchasePaymentNature — el servidor es la fuente de verdad,
// nunca se confía en rate/amount calculados en el cliente.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { updatePurchasePaymentNatureSchema } from "../schemas/payment-nature.schema";
import { updatePurchasePaymentNature } from "../services/purchase.service";
import { getPurchaseById } from "../queries/get-purchase-by-id";
import type { PurchaseDetail } from "../types/purchase.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type UpdatePurchasePaymentNatureState =
  | { ok: true; detail: PurchaseDetail }
  | { ok: false; error: string; field?: string };

export async function updatePurchasePaymentNatureAction(
  purchase_id:    string,
  payment_nature: string,
  manual_base:    number | null,
): Promise<UpdatePurchasePaymentNatureState> {
  const sessionUser = await requireAdmin();
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!sessionUser.tenant_id || !location_id) {
    return { ok: false, error: "Sesión sin tenant o location activa." };
  }

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(sessionUser.tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.purchases");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const parsed = updatePurchasePaymentNatureSchema.safeParse({
    purchase_id,
    payment_nature,
    manual_base,
  });
  if (!parsed.success) {
    const first = Object.entries(parsed.error.flatten().fieldErrors)[0];
    return first
      ? { ok: false, field: first[0], error: first[1][0] }
      : { ok: false, error: "Datos inválidos." };
  }

  const result = await updatePurchasePaymentNature(
    parsed.data.purchase_id,
    sessionUser.tenant_id,
    location_id,
    sessionUser.id,
    {
      payment_nature: parsed.data.payment_nature,
      manual_base:    parsed.data.manual_base ?? null,
    },
  );

  if (!result.ok) return result;

  revalidatePath(`/dashboard/purchases/${parsed.data.purchase_id}`);
  revalidatePath(`/dashboard/purchases/${parsed.data.purchase_id}/edit`);

  const detail = await getPurchaseById(parsed.data.purchase_id, sessionUser.tenant_id, location_id);
  if (!detail) return { ok: false, error: "No se pudo recargar el detalle de la compra." };
  return { ok: true, detail };
}
