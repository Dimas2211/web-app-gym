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
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { updateProductLocationSchema } from "../schemas/update-product-location.schema";
import { updateProductLocationFields } from "../services/product-location.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

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
  const tenant_id   = sessionUser.tenant_id;
  const location_id = sessionUser.location_id;

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "La sesión no tiene una location activa." };

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) return { error: RUNTIME_READONLY_MESSAGE };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.inventory");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  const id = (formData.get("id") as string | null)?.trim();
  if (!id) return { error: "Falta el identificador del registro a actualizar." };

  const raw = {
    min_stock:        parseDecimal(formData.get("min_stock")),
    reorder_quantity: parseDecimal(formData.get("reorder_quantity")),
    warehouse:        str(formData.get("warehouse")),
    shelf:            str(formData.get("shelf")),
    position:         str(formData.get("position")),
    is_active:        parseBool(formData.get("is_active")),
    updated_by:       sessionUser.id,
  };

  const parsed = updateProductLocationSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const result = await updateProductLocationFields(
    id,
    tenant_id,
    location_id,
    sessionUser.id,
    parsed.data,
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard/inventory");
}
