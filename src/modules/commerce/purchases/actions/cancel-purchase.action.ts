"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — cancel-purchase.action.ts
//
// Anula una compra en estado DRAFT → CANCELLED.
// No genera movimientos de inventario: solo cambia el estado.
//
// Permiso: requireAdmin.
// purchase_id viene del form; tenant_id y location_id desde sesión.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { cancelPurchase } from "../services/purchase.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type CancelPurchaseState =
  | { error?: string }
  | undefined;

// ── Helpers de parseo FormData ────────────────────────────────────

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value as string | null;
  if (s === null || s === undefined) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

export async function cancelPurchaseAction(
  _prev: CancelPurchaseState,
  formData: FormData,
): Promise<CancelPurchaseState> {
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

    const result = await cancelPurchase(
      purchase_id,
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      context.client,
    );

    if (!result.ok) return { error: result.error };

    revalidatePath(`/dashboard/purchases/${purchase_id}`);
    revalidatePath("/dashboard/purchases");
  } finally {
    await dispose();
  }
}
