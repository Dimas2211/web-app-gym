"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — manage-purchase-items.action.ts
//
// Gestión de líneas de una compra en estado DRAFT:
//   addPurchaseItemAction    — agrega una línea
//   updatePurchaseItemAction — edita una línea existente
//   removePurchaseItemAction — elimina una línea
//
// Permiso: requireAdmin.
// purchase_id viene del form; tenant_id y location_id desde sesión.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  addPurchaseItemSchema,
  updatePurchaseItemSchema,
} from "../schemas/purchase-item.schema";
import {
  addPurchaseItem,
  updatePurchaseItem,
  removePurchaseItem,
} from "../services/purchase.service";
import { getPurchaseById } from "../queries/get-purchase-by-id";
import type { PurchaseDetail } from "../types/purchase.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type PurchaseItemState =
  | { ok: true; detail: PurchaseDetail }
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ── Helpers ───────────────────────────────────────────────────────

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value as string | null;
  if (s === null || s === undefined) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

function dec(value: FormDataEntryValue | null): number | undefined {
  const s = (value as string | null)?.trim();
  if (!s) return undefined;
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

// ── Agregar línea ─────────────────────────────────────────────────

export async function addPurchaseItemAction(
  _prev: PurchaseItemState,
  formData: FormData,
): Promise<PurchaseItemState> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "La sesión no tiene una location activa." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.purchases");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  const purchase_id = str(formData.get("purchase_id"));
  if (!purchase_id) return { error: "purchase_id es requerido." };

  const raw = {
    product_id: str(formData.get("product_id")),
    quantity:   dec(formData.get("quantity")),
    unit_cost:  dec(formData.get("unit_cost")),
    tax_amount: dec(formData.get("tax_amount")),
    notes:      str(formData.get("notes")),
  };

  const parsed = addPurchaseItemSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const result = await addPurchaseItem(
    purchase_id,
    tenant_id,
    location_id,
    sessionUser.id,
    parsed.data,
  );

  if (!result.ok) {
    return result.field
      ? { errors: { [result.field]: [result.error] } }
      : { error: result.error };
  }

  revalidatePath(`/dashboard/purchases/${purchase_id}/edit`);

  const detail = await getPurchaseById(purchase_id, tenant_id, location_id);
  if (!detail) return { error: "No se pudo recargar el detalle de la compra." };
  return { ok: true as const, detail };
}

// ── Editar línea ──────────────────────────────────────────────────

export async function updatePurchaseItemAction(
  _prev: PurchaseItemState,
  formData: FormData,
): Promise<PurchaseItemState> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "La sesión no tiene una location activa." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.purchases");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  const purchase_id = str(formData.get("purchase_id"));
  const item_id     = str(formData.get("item_id"));
  if (!purchase_id) return { error: "purchase_id es requerido." };
  if (!item_id)     return { error: "item_id es requerido." };

  const raw = {
    quantity:   dec(formData.get("quantity")),
    unit_cost:  dec(formData.get("unit_cost")),
    tax_amount: dec(formData.get("tax_amount")),
    notes:      str(formData.get("notes")),
  };

  const parsed = updatePurchaseItemSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const result = await updatePurchaseItem(
    item_id,
    purchase_id,
    tenant_id,
    location_id,
    sessionUser.id,
    parsed.data,
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/dashboard/purchases/${purchase_id}/edit`);
}

// ── Eliminar línea ────────────────────────────────────────────────

export async function removePurchaseItemAction(
  _prev: PurchaseItemState,
  formData: FormData,
): Promise<PurchaseItemState> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "La sesión no tiene una location activa." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.purchases");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  const purchase_id = str(formData.get("purchase_id"));
  const item_id     = str(formData.get("item_id"));
  if (!purchase_id) return { error: "purchase_id es requerido." };
  if (!item_id)     return { error: "item_id es requerido." };

  const result = await removePurchaseItem(
    item_id,
    purchase_id,
    tenant_id,
    location_id,
    sessionUser.id,
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/dashboard/purchases/${purchase_id}/edit`);

  const detail = await getPurchaseById(purchase_id, tenant_id, location_id);
  if (!detail) return { error: "No se pudo recargar el detalle de la compra." };
  return { ok: true as const, detail };
}
