"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — update-customer-contact.action.ts
//
// Actualiza solo los campos de contacto del cliente desde la
// pestaña Contacto del maestro.
// No toca identificación, actividad, dirección ni estado.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// Éxito:   undefined
// Error:   { error: string }
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { str, strNullable } from "@/lib/utils/form-data-parsers";
import { updateCustomer } from "../services/customer.service";

export type UpdateCustomerContactState =
  | { error: string }
  | undefined;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateCustomerContactAction(
  _prev: UpdateCustomerContactState,
  formData: FormData,
): Promise<UpdateCustomerContactState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "core.customers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
      return { error: "Sin permisos para esta operación." };
    }

    const id    = str(formData.get("id"));
    const phone = strNullable(formData.get("phone"));
    const email = strNullable(formData.get("email"));

    if (!id) return { error: "ID del cliente requerido." };

    if (email && !EMAIL_REGEX.test(email)) {
      return { error: "El correo electrónico no tiene un formato válido." };
    }

    const result = await updateCustomer(id, context.tenantId, context.effectiveUser.id, {
      phone,
      email,
    }, context.client);

    if (!result.ok) return { error: result.error };

    revalidatePath("/dashboard/customers");
  } finally {
    await dispose();
  }
}
