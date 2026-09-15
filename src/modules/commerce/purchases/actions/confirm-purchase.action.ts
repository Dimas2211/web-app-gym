"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — confirm-purchase.action.ts
//
// Confirma una compra: DRAFT → CONFIRMED.
// Genera movimientos PURCHASE_IN en inventory por cada línea stockable.
//
// Permiso: requireAdmin.
// purchase_id viene del form; tenant_id y location_id desde sesión.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { confirmPurchase }        from "../services/purchase.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type ConfirmPurchaseState =
  | { error?: string }
  | undefined;

// ── Helpers de parseo FormData ────────────────────────────────────

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value as string | null;
  if (s === null || s === undefined) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

// ── Action ────────────────────────────────────────────────────────

export async function confirmPurchaseAction(
  _prev: ConfirmPurchaseState,
  formData: FormData,
): Promise<ConfirmPurchaseState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.purchases", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
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
    if (!location_id) return { error: "La sesión no tiene una location activa." };

    const purchase_id = str(formData.get("purchase_id"));
    if (!purchase_id) return { error: "purchase_id es requerido." };

    const result = await confirmPurchase(
      purchase_id,
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      context.client,
    );

    if (!result.ok) return { error: result.error };

    revalidatePath(`/dashboard/purchases/${purchase_id}`);
    revalidatePath("/dashboard/purchases");
    revalidatePath("/dashboard/inventory");
  } finally {
    await dispose();
  }
}
