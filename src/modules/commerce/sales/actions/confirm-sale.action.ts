"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — confirm-sale.action.ts
//
// Confirma una venta DRAFT → CONFIRMED.
// Fase 4G: sin DTE real, sin SALE_OUT, sin movimientos de inventario.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { confirmSale } from "../services/sale.service";

export type ConfirmSaleActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function confirmSaleAction(
  sale_id: string,
): Promise<ConfirmSaleActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)       return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)     return { ok: false, error: "La sesión no tiene una location activa." };
  if (!sale_id?.trim()) return { ok: false, error: "El ID de venta es requerido." };

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return { ok: false, error: RUNTIME_READONLY_MESSAGE };
  }

  const result = await confirmSale(sale_id, tenant_id, location_id, sessionUser.id);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/sales/new");

  return { ok: true };
}
