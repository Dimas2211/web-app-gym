"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — update-purchase-header.action.ts
//
// Edita la cabecera (proveedor, fecha, correlativo, notas) de una
// compra en estado DRAFT. Solo admins con location activa.
//
// Retorna:
//   { ok: true }
//   { ok: false; error: string; field?: string }
// ─────────────────────────────────────────────────────────────────

import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { updatePurchaseHeader }   from "../services/purchase.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type UpdatePurchaseHeaderState =
  | { ok: true }
  | { ok: false; error: string; field?: string }
  | undefined;

export async function updatePurchaseHeaderAction(
  purchaseId: string,
  _prev: UpdatePurchaseHeaderState,
  formData: FormData,
): Promise<UpdatePurchaseHeaderState> {
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

    const supplier_id   = (formData.get("supplier_id")   as string ?? "").trim();
    const purchase_date = (formData.get("purchase_date") as string ?? "").trim();
    const purchase_code = (formData.get("purchase_code") as string ?? "").trim();
    const notes         = (formData.get("notes")         as string ?? "").trim();

    if (!supplier_id)   return { ok: false, field: "supplier_id",   error: "El proveedor es requerido." };
    if (!purchase_date) return { ok: false, field: "purchase_date", error: "La fecha es requerida." };
    if (!purchase_code || !/^\d+$/.test(purchase_code)) {
      return { ok: false, field: "purchase_code", error: "El correlativo debe ser un número entero positivo." };
    }

    return await updatePurchaseHeader(
      purchaseId,
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      {
        supplier_id,
        purchase_date,
        purchase_code,
        notes: notes || null,
      },
      context.client,
    );
  } finally {
    await dispose();
  }
}
