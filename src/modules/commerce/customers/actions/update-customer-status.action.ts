"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — update-customer-status.action.ts
//
// Activa / desactiva un cliente (solo el campo status). Separado de
// updateCustomerAction porque la edición del maestro exige grant
// CUSTOMER_EDIT (Clave de Supervisor) y el cambio de estado no — mismo
// criterio que products (update-product-status.action, sin clave).
//
// Permiso: requireAdmin (super_admin | branch_admin), rol LIVE.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { updateCustomer } from "../services/customer.service";

export type UpdateCustomerStatusActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateCustomerStatusAction(
  customer_id: string,
  status:      "active" | "inactive",
): Promise<UpdateCustomerStatusActionResult> {
  const sessionUser = await requireAdmin();

  if (!customer_id?.trim()) return { ok: false, error: "El ID del cliente es requerido." };
  if (status !== "active" && status !== "inactive") {
    return { ok: false, error: "Estado no válido." };
  }

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "core.customers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
      return { ok: false, error: "Sin permisos para esta operación." };
    }

    const result = await updateCustomer(customer_id, context.tenantId, context.effectiveUser.id, { status }, context.client);
    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath("/dashboard/customers");
    return { ok: true };
  } finally {
    await dispose();
  }
}
