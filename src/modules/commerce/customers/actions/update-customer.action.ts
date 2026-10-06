"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — update-customer.action.ts
//
// Actualiza datos de un cliente existente.
//
// Permiso: requireAdmin (super_admin | branch_admin) + grant CUSTOMER_EDIT
//          del cliente (Clave de Supervisor). El cambio de estado
//          activo/inactivo vive en update-customer-status.action.
// tenant_id se inyecta desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { updateCustomerSchema } from "../schemas/customer.schemas";
import { updateCustomer } from "../services/customer.service";
import type { UpdateCustomerInput } from "../schemas/customer.schemas";
import { checkOperationalGrant } from "@/core/security/operational-authorization/operational-authorization";
import { OPERATIONAL_SCOPES } from "@/core/security/operational-authorization/scopes";

export type UpdateCustomerActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function updateCustomerAction(
  customer_id: string,
  input:        UpdateCustomerInput,
): Promise<UpdateCustomerActionResult> {
  const sessionUser = await requireAdmin();

  if (!customer_id?.trim()) {
    return { ok: false, error: "El ID del cliente es requerido." };
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

    // Autorización Operativa: grant CUSTOMER_EDIT para ESTE cliente.
    const grant = await checkOperationalGrant(context, [OPERATIONAL_SCOPES.CUSTOMER_EDIT], customer_id);
    if (!grant.ok) return { ok: false, error: grant.error };

    const parsed = updateCustomerSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok:     false,
        error:  "Datos de cliente no válidos.",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const result = await updateCustomer(customer_id, context.tenantId, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      return result.field
        ? { ok: false, field: result.field, error: result.error }
        : { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${customer_id}`);

    return { ok: true };
  } finally {
    await dispose();
  }
}
