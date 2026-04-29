"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — save-purchase-header.action.ts
//
// Acción unificada de guardado de cabecera de compra:
//   - Si purchase_id está en formData → actualiza cabecera DRAFT existente
//   - Si purchase_id está ausente → crea nueva compra DRAFT
//
// Diseñada para useActionState con un solo action fijo en PurchaseFormClient.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { createPurchaseSchema }   from "../schemas/create-purchase.schema";
import { createPurchase, updatePurchaseHeader } from "../services/purchase.service";
import {
  VALID_DOCUMENT_TYPES,
  VALID_PAYMENT_CONDITIONS,
  VALID_CANCELLATION_TYPES,
} from "../constants/purchase-document.constants";

export type SavePurchaseHeaderState =
  | { ok: true;  id: string; created: boolean }
  | { ok: false; error: string; field?: string }
  | undefined;

function str(v: FormDataEntryValue | null): string | undefined {
  const s = (v as string | null)?.trim();
  return s || undefined;
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = (v as string | null)?.trim();
  return s || null;
}

export async function savePurchaseHeaderAction(
  _prev: SavePurchaseHeaderState,
  formData: FormData,
): Promise<SavePurchaseHeaderState> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "Sesión sin tenant activo." };
  if (!location_id) return { ok: false, error: "Sesión sin location activa." };

  const purchase_id = str(formData.get("purchase_id"));

  const supplier_id        = str(formData.get("supplier_id"));
  const purchase_date      = str(formData.get("purchase_date"));
  const purchase_code_raw  = str(formData.get("purchase_code"));
  const notes              = strOrNull(formData.get("notes"));
  const document_type_raw  = str(formData.get("document_type"));
  const document_series    = str(formData.get("document_series"));
  const document_number    = str(formData.get("document_number"));
  const payment_cond_raw   = str(formData.get("payment_condition"));
  const cancel_type_raw    = str(formData.get("cancellation_type"));

  // ── Validación estricta de campos documentales ───────────────────
  // Si el campo viene vacío → null (opcional). Si viene con valor → debe ser válido.
  // Nunca se convierte un valor inválido a null silenciosamente.

  if (!supplier_id) {
    return { ok: false, field: "supplier_id", error: "El proveedor es requerido." };
  }
  if (!purchase_date) {
    return { ok: false, field: "purchase_date", error: "La fecha es requerida." };
  }
  if (!purchase_code_raw) {
    return { ok: false, field: "purchase_code", error: "El correlativo es requerido." };
  }
  if (!/^\d+$/.test(purchase_code_raw)) {
    return { ok: false, field: "purchase_code", error: "El correlativo debe ser solo numérico." };
  }

  if (!document_type_raw) {
    return { ok: false, field: "document_type", error: "El tipo de documento es requerido." };
  }
  if (!(VALID_DOCUMENT_TYPES as readonly string[]).includes(document_type_raw)) {
    return { ok: false, field: "document_type", error: `Tipo de documento no válido: "${document_type_raw}".` };
  }
  if (!payment_cond_raw) {
    return { ok: false, field: "payment_condition", error: "La forma de pago es requerida." };
  }
  if (!(VALID_PAYMENT_CONDITIONS as readonly string[]).includes(payment_cond_raw)) {
    return { ok: false, field: "payment_condition", error: `Forma de pago no válida: "${payment_cond_raw}".` };
  }
  if (!cancel_type_raw) {
    return { ok: false, field: "cancellation_type", error: "El tipo de cancelación es requerido." };
  }
  if (!(VALID_CANCELLATION_TYPES as readonly string[]).includes(cancel_type_raw)) {
    return { ok: false, field: "cancellation_type", error: `Tipo de cancelación no válido: "${cancel_type_raw}".` };
  }

  if (!document_series) {
    return { ok: false, field: "document_series", error: "La serie del documento es requerida." };
  }
  if (!document_number) {
    return { ok: false, field: "document_number", error: "El número de documento es requerido." };
  }

  // All required fields guaranteed non-null at this point
  const purchase_code     = purchase_code_raw;
  const document_type     = document_type_raw!;
  const payment_condition = payment_cond_raw!;
  const cancellation_type = cancel_type_raw!;

  if (purchase_id) {
    // ── UPDATE existing DRAFT ────────────────────────────────────
    const result = await updatePurchaseHeader(
      purchase_id,
      tenant_id,
      location_id,
      sessionUser.id,
      {
        supplier_id,
        purchase_date,
        purchase_code,
        notes,
        document_type,
        document_series,
        document_number,
        payment_condition,
        cancellation_type,
      },
    );
    if (!result.ok) return result;
    return { ok: true, id: purchase_id, created: false };
  } else {
    // ── CREATE new DRAFT ─────────────────────────────────────────
    // notes: convert null → undefined so Zod's .optional() (string | undefined) accepts it.
    // The service normalizes undefined → null for the DB column.
    const raw = { supplier_id, purchase_date, purchase_code, notes: notes ?? undefined, document_type, document_series, document_number, payment_condition, cancellation_type };
    const parsed = createPurchaseSchema.safeParse(raw);
    if (!parsed.success) {
      const first = Object.entries(parsed.error.flatten().fieldErrors)[0];
      return first
        ? { ok: false, field: first[0], error: first[1][0] }
        : { ok: false, error: "Datos inválidos." };
    }

    const result = await createPurchase(tenant_id, location_id, sessionUser.id, parsed.data);
    if (!result.ok) return result;
    return { ok: true, id: result.id, created: true };
  }
}
