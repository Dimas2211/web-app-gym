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
import { requireAdmin } from "@/lib/permissions/guards";
import { verifyAdminDeleteCredentials } from "@/lib/permissions/delete-authorization";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { cancelConfirmedPurchase } from "../services/purchase.service";

export type CancelConfirmedPurchaseState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export async function cancelConfirmedPurchaseAction(
  _prev: CancelConfirmedPurchaseState,
  formData: FormData,
): Promise<CancelConfirmedPurchaseState> {
  const sessionUser = await requireAdmin();

  if (!sessionUser.tenant_id) {
    return { ok: false, error: "La sesión no tiene un tenant activo." };
  }

  const location_id = await getEffectiveLocationId(sessionUser);
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
    sessionUser.tenant_id,
  );

  if (!auth.authorized) {
    return { ok: false, error: auth.error };
  }

  const result = await cancelConfirmedPurchase(
    purchase_id,
    sessionUser.tenant_id,
    location_id,
    sessionUser.id,
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/dashboard/purchases/${purchase_id}`);
  revalidatePath("/dashboard/purchases");

  return { ok: true };
}
