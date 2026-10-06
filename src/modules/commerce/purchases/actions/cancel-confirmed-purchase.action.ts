"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — cancel-confirmed-purchase.action.ts
//
// Anula una compra en estado CONFIRMED → CANCELLED.
// Requiere la Clave de Supervisor (PURCHASE_CANCEL_CONFIRMED, un solo
// uso: verificada en esta misma request contra la Runtime DB efectiva).
// Genera movimientos RETURN_OUT para revertir inventario (sin cambios).
//
// Permiso: requireAdmin + Clave de Supervisor.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { verifySupervisorPinForOperation } from "@/core/security/operational-authorization/operational-authorization";
import { readSupervisorPin } from "@/core/security/operational-authorization/run-supervisor-authorization";
import { OPERATIONAL_SCOPES } from "@/core/security/operational-authorization/scopes";
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

    const auth = await verifySupervisorPinForOperation(
      context,
      OPERATIONAL_SCOPES.PURCHASE_CANCEL_CONFIRMED,
      readSupervisorPin(formData),
    );
    if (!auth.ok) return auth;

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
