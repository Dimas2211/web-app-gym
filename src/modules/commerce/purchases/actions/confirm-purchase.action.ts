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
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { confirmPurchase }        from "../services/purchase.service";

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
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "La sesión no tiene una location activa." };

  const purchase_id = str(formData.get("purchase_id"));
  if (!purchase_id) return { error: "purchase_id es requerido." };

  const result = await confirmPurchase(
    purchase_id,
    tenant_id,
    location_id,
    sessionUser.id,
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/dashboard/purchases/${purchase_id}`);
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/inventory");
}
