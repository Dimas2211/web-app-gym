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
import type { UserRole } from "@prisma/client";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { createProductLocationSchema } from "../schemas/create-product-location.schema";
import { createProductLocation } from "../services/product-location.service";

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

    // location: la del usuario runtime (LIVE-validada, ver ETAPA E) o,
    // para identidades tenant-wide (location_id null), la seleccionada
    // vía cookie — validada contra la DB EFECTIVA, nunca contra global.
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as UserRole } as SessionUser,
        context.client,
        context.tenantId,
      ));
    if (!location_id) return { error: "La sesión no tiene una location activa." };

    const raw = {
      tenant_id: context.tenantId,
      location_id,
      product_id:       str(formData.get("product_id")),
      min_stock:        parseDecimal(formData.get("min_stock")),
      reorder_quantity: parseDecimal(formData.get("reorder_quantity")),
      warehouse:        strNullable(formData.get("warehouse")),
      shelf:            strNullable(formData.get("shelf")),
      position:         strNullable(formData.get("position")),
      is_active:        parseBool(formData.get("is_active")),
      created_by:       context.effectiveUser.id,
    };

    const parsed = createProductLocationSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    const result = await createProductLocation(
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

    revalidatePath("/dashboard/inventory");
  } finally {
    await dispose();
  }
}
