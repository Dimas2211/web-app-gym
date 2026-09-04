"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/inventory — create-product-location.action.ts
//
// Server action para crear el registro operativo inicial de un
// producto en la location de sesión. Capa HTTP/form fina:
// parsea FormData, valida con Zod, delega lógica al service.
//
// Lógica de negocio: services/product-location.service.ts
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se extraen de sesión — nunca del form.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { createProductLocationSchema } from "../schemas/create-product-location.schema";
import { createProductLocation } from "../services/product-location.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// ── Estado de retorno ─────────────────────────────────────────────

export type CreateProductLocationState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ── Helpers de parseo FormData ────────────────────────────────────

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value as string | null;
  if (s === null || s === undefined) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

function strNullable(value: FormDataEntryValue | null): string | undefined {
  const s = value as string | null;
  if (!s || s.trim() === "") return undefined;
  return s.trim();
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

export async function createProductLocationAction(
  _prev: CreateProductLocationState,
  formData: FormData,
): Promise<CreateProductLocationState> {
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

  const raw = {
    tenant_id,
    location_id,
    product_id:       str(formData.get("product_id")),
    min_stock:        parseDecimal(formData.get("min_stock")),
    reorder_quantity: parseDecimal(formData.get("reorder_quantity")),
    warehouse:        strNullable(formData.get("warehouse")),
    shelf:            strNullable(formData.get("shelf")),
    position:         strNullable(formData.get("position")),
    is_active:        parseBool(formData.get("is_active")),
    created_by:       sessionUser.id,
  };

  const parsed = createProductLocationSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const result = await createProductLocation(
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

  revalidatePath("/dashboard/inventory");
}
