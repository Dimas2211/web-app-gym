"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — update-customer-activity.action.ts
//
// Actualiza solo el giro económico del cliente desde la pestaña
// Actividad económica del maestro.
// No toca identificación, dirección, contacto ni estado.
//
// Enviar activity_code vacío → limpia la actividad.
// Coherencia: si hay activity_code debe existir activity_name.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// Éxito:   undefined
// Error:   { error: string }
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { str, strNullable } from "@/lib/utils/form-data-parsers";
import { updateCustomer } from "../services/customer.service";

export type UpdateCustomerActivityState =
  | { error: string }
  | undefined;

export async function updateCustomerActivityAction(
  _prev: UpdateCustomerActivityState,
  formData: FormData,
): Promise<UpdateCustomerActivityState> {
  const sessionUser = await requireAdmin();
  const tenantId    = sessionUser.tenant_id;
  if (!tenantId) return { error: "La sesión no tiene un tenant activo." };

  const id            = str(formData.get("id"));
  const activity_code = strNullable(formData.get("activity_code"));
  const activity_name = strNullable(formData.get("activity_name"));

  if (!id) return { error: "ID del cliente requerido." };

  if (activity_code && !activity_name) {
    return { error: "Si se asigna un código de actividad, el nombre es requerido." };
  }

  const result = await updateCustomer(id, tenantId, sessionUser.id, {
    activity_code,
    activity_name,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard/customers");
}
