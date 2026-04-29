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
import { requireAdmin } from "@/lib/permissions/guards";
import { cancelPurchase } from "../services/purchase.service";

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
  const tenant_id   = sessionUser.tenant_id;
  const location_id = sessionUser.location_id;

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "La sesión no tiene una location activa." };

  const purchase_id = str(formData.get("purchase_id"));
  if (!purchase_id) return { error: "purchase_id es requerido." };

  const result = await cancelPurchase(
    purchase_id,
    tenant_id,
    location_id,
    sessionUser.id,
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/dashboard/purchases/${purchase_id}`);
  revalidatePath("/dashboard/purchases");
}
