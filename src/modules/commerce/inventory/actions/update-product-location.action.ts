"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/inventory — update-product-location.action.ts
//
// Server action para actualizar parámetros operativos y ubicación
// física de un ProductLocation. Capa HTTP/form fina:
// parsea FormData, valida con Zod, delega lógica al service.
//
// Lógica de negocio: services/product-location.service.ts
// Permiso: requireAdmin (super_admin | branch_admin).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { updateProductLocationSchema } from "../schemas/update-product-location.schema";
import { updateProductLocationFields } from "../services/product-location.service";

// ── Estado de retorno ─────────────────────────────────────────────

export type UpdateProductLocationState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ── Helpers de parseo FormData ────────────────────────────────────

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value as string | null;
  if (s === null || s === undefined) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

function parseBool(value: FormDataEntryValue | null): boolean | undefined {
  const s = (value as string | null)?.trim();
  if (s === "true")  return true;
  if (s === "false") return false;
  return undefined;
}

function parseDecimal(value: FormDataEntryValue | null): number | undefined {
  const s = (value as string | null)?.trim();
  if (!s) return undefined;
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

// ── Action ────────────────────────────────────────────────────────

export async function updateProductLocationAction(
  _prev: UpdateProductLocationState,
  formData: FormData,
): Promise<UpdateProductLocationState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.inventory", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
      return { error: "Sin permisos para esta operación." };
    }

    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as UserRole } as SessionUser,
        context.client,
        context.tenantId,
      ));
    if (!location_id) return { error: "La sesión no tiene una location activa." };

    const id = (formData.get("id") as string | null)?.trim();
    if (!id) return { error: "Falta el identificador del registro a actualizar." };

    const raw = {
      min_stock:        parseDecimal(formData.get("min_stock")),
      reorder_quantity: parseDecimal(formData.get("reorder_quantity")),
      warehouse:        str(formData.get("warehouse")),
      shelf:            str(formData.get("shelf")),
      position:         str(formData.get("position")),
      is_active:        parseBool(formData.get("is_active")),
      updated_by:       context.effectiveUser.id,
    };

    const parsed = updateProductLocationSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const result = await updateProductLocationFields(
      id,
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      parsed.data,
      context.client,
    );

    if (!result.ok) return { error: result.error };

    revalidatePath("/dashboard/inventory");
  } finally {
    await dispose();
  }
}
