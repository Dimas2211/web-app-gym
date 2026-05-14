"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — update-customer-identification.action.ts
//
// Actualiza solo los campos de identificación del cliente desde
// la pestaña Identificación del maestro.
// No toca actividad, dirección, contacto ni estado.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// Éxito:   undefined
// Error:   { error: string }
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { str, strNullable } from "@/lib/utils/form-data-parsers";
import { updateCustomer } from "../services/customer.service";

export type UpdateCustomerIdentificationState =
  | { error: string }
  | undefined;

const TAXPAYER_TYPES = ["FINAL_CONSUMER", "REGISTERED_TAXPAYER", "EXCLUDED_SUBJECT"] as const;
type TaxpayerType = typeof TAXPAYER_TYPES[number];

export async function updateCustomerIdentificationAction(
  _prev: UpdateCustomerIdentificationState,
  formData: FormData,
): Promise<UpdateCustomerIdentificationState> {
  const sessionUser = await requireAdmin();
  const tenantId    = sessionUser.tenant_id;
  if (!tenantId) return { error: "La sesión no tiene un tenant activo." };

  const id            = str(formData.get("id"));
  const name          = str(formData.get("name"));
  const legal_name    = strNullable(formData.get("legal_name"));
  const taxpayer_type = str(formData.get("taxpayer_type"));
  const id_type_code  = strNullable(formData.get("id_type_code"));
  const nit           = strNullable(formData.get("nit"));
  const nrc           = strNullable(formData.get("nrc"));
  const dui           = strNullable(formData.get("dui"));

  if (!id)            return { error: "ID del cliente requerido." };
  if (!name)          return { error: "El nombre es requerido." };
  if (!taxpayer_type) return { error: "El tipo de contribuyente es requerido." };

  if (!TAXPAYER_TYPES.includes(taxpayer_type as TaxpayerType)) {
    return { error: "Tipo de contribuyente no válido." };
  }

  const result = await updateCustomer(id, tenantId, sessionUser.id, {
    name,
    legal_name,
    taxpayer_type: taxpayer_type as TaxpayerType,
    id_type_code,
    nit,
    nrc,
    dui,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard/customers");
}
