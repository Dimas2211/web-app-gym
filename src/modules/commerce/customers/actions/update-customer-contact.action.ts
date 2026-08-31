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
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
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
  const tenantId    = sessionUser.tenant_id;
  if (!tenantId) return { error: "La sesión no tiene un tenant activo." };

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) return { error: RUNTIME_READONLY_MESSAGE };

  const id    = str(formData.get("id"));
  const phone = strNullable(formData.get("phone"));
  const email = strNullable(formData.get("email"));

  if (!id) return { error: "ID del cliente requerido." };

  if (email && !EMAIL_REGEX.test(email)) {
    return { error: "El correo electrónico no tiene un formato válido." };
  }

  const result = await updateCustomer(id, tenantId, sessionUser.id, {
    phone,
    email,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard/customers");
}
