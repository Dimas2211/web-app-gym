"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — create-purchase.action.ts
//
// Crea una compra nueva en estado DRAFT.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del form.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { createPurchaseSchema } from "../schemas/create-purchase.schema";
import { createPurchase } from "../services/purchase.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type CreatePurchaseState =
  | { errors?: Record<string, string[]>; error?: string; id?: string }
  | undefined;

// ── Helpers de parseo FormData ────────────────────────────────────

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value as string | null;
  if (s === null || s === undefined) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

// ── Action ────────────────────────────────────────────────────────

export async function createPurchaseAction(
  _prev: CreatePurchaseState,
  formData: FormData,
): Promise<CreatePurchaseState> {
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

    const raw = {
      supplier_id:   str(formData.get("supplier_id")),
      purchase_date: str(formData.get("purchase_date")),
      purchase_code: str(formData.get("purchase_code")),
      notes:         str(formData.get("notes")),
    };

    const parsed = createPurchaseSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const result = await createPurchase(
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      parsed.data,
      context.client,
    );

    if (!result.ok) {
      return result.field
        ? { errors: { [result.field]: [result.error] } }
        : { error: result.error };
    }

    revalidatePath("/dashboard/purchases");
    // Retorna el id para que el cliente pueda redirigir al detalle
    return { id: result.id };
  } finally {
    await dispose();
  }
}
