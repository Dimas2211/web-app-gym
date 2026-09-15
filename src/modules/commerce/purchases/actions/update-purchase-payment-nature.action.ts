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
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { updatePurchasePaymentNatureSchema } from "../schemas/payment-nature.schema";
import { updatePurchasePaymentNature } from "../services/purchase.service";
import { getPurchaseById } from "../queries/get-purchase-by-id";
import type { PurchaseDetail } from "../types/purchase.types";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type UpdatePurchasePaymentNatureState =
  | { ok: true; detail: PurchaseDetail }
  | { ok: false; error: string; field?: string };

export async function updatePurchasePaymentNatureAction(
  purchase_id:    string,
  payment_nature: string,
  manual_base:    number | null,
): Promise<UpdatePurchasePaymentNatureState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.purchases", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
        context.client,
        context.tenantId,
      ));

    if (!location_id) {
      return { ok: false, error: "Sesión sin tenant o location activa." };
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
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      {
        payment_nature: parsed.data.payment_nature,
        manual_base:    parsed.data.manual_base ?? null,
      },
      context.client,
    );

    if (!result.ok) return result;

    revalidatePath(`/dashboard/purchases/${parsed.data.purchase_id}`);
    revalidatePath(`/dashboard/purchases/${parsed.data.purchase_id}/edit`);

    const detail = await getPurchaseById(parsed.data.purchase_id, context.tenantId, location_id, context.client);
    if (!detail) return { ok: false, error: "No se pudo recargar el detalle de la compra." };
    return { ok: true, detail };
  } finally {
    await dispose();
  }
}
