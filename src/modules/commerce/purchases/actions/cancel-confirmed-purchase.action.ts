"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — cancel-confirmed-purchase.action.ts
//
// Anula una compra en estado CONFIRMED → CANCELLED.
// Requiere credenciales administrativas (mismo patrón que edición).
// Genera movimientos RETURN_OUT para revertir inventario.
//
// Permiso: requireAdmin + verifyAdminDeleteCredentials.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { verifyAdminDeleteCredentials } from "@/lib/permissions/delete-authorization";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { cancelConfirmedPurchase } from "../services/purchase.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type CancelConfirmedPurchaseState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export async function cancelConfirmedPurchaseAction(
  _prev: CancelConfirmedPurchaseState,
  formData: FormData,
): Promise<CancelConfirmedPurchaseState> {
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
      return { ok: false, error: "Selecciona una location activa antes de anular." };
    }

    const purchase_id = ((formData.get("purchase_id") as string) ?? "").trim();
    if (!purchase_id) {
      return { ok: false, error: "purchase_id es requerido." };
    }

    const email    = ((formData.get("auth_email")    as string) ?? "").trim();
    const password = ((formData.get("auth_password") as string) ?? "");

    if (!email || !password) {
      return { ok: false, error: "Correo y contraseña son requeridos." };
    }

    const auth = await verifyAdminDeleteCredentials(
      { email, password },
      context.tenantId,
      context.client,
    );

    if (!auth.authorized) {
      return { ok: false, error: auth.error };
    }

    const result = await cancelConfirmedPurchase(
      purchase_id,
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      context.client,
    );

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath(`/dashboard/purchases/${purchase_id}`);
    revalidatePath("/dashboard/purchases");

    return { ok: true };
  } finally {
    await dispose();
  }
}
