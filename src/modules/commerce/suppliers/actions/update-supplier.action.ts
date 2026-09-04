"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — update-supplier.action.ts
//
// Actualiza la ficha completa de un proveedor existente.
//
// Permiso: requireAdmin (super_admin | branch_admin).
//
// Semántica de update: full-form, no partial.
// El formulario siempre envía todos los campos (incluyendo opcionales
// con valor vacío). Un campo en blanco → strNullable devuelve null
// → el service actualiza el campo a null (borra el valor existente).
// Este comportamiento es correcto para un formulario de edición
// completa donde el usuario ve y puede modificar todos los datos.
//
// Si en el futuro se implementa un sub-formulario parcial (e.g.,
// editar solo datos de contacto), crear una action específica.
// Ese caso requeriría distinguir null (limpiar) de undefined (no tocar).
//
// No editable aquí: supplier_code (clave de negocio, excluido del schema).
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { str, strNullable } from "@/lib/utils/form-data-parsers";
import { updateSupplierSchema } from "../schemas/update-supplier.schema";
import { updateSupplier } from "../services/supplier.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type SupplierUpdateActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function updateSupplierAction(
  _prev: SupplierUpdateActionState,
  formData: FormData,
): Promise<SupplierUpdateActionState> {
  // 1. Sesión y permisos
  const sessionUser = await requireAdmin();
  const tenantId    = sessionUser.tenant_id;
  if (!tenantId) return { error: "La sesión no tiene un tenant activo." };

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) return { error: RUNTIME_READONLY_MESSAGE };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenantId);
    assertOrganizationModule(commercialCtx, "commerce.suppliers");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  // 2. Parseo de FormData
  const raw = {
    // Identidad del registro — requerido por updateSupplierSchema
    id: str(formData.get("id")),

    // Obligatorios en update (no pueden quedar vacíos)
    name:          str(formData.get("name")),
    taxpayer_type: str(formData.get("taxpayer_type")),
    person_type:   strNullable(formData.get("person_type")),

    // supplier_code excluido — clave de negocio inmutable

    // Identidad opcional
    account_code: strNullable(formData.get("account_code")),
    legal_name:   strNullable(formData.get("legal_name")),

    // Documentación
    id_type_code:   strNullable(formData.get("id_type_code")),
    dui:            strNullable(formData.get("dui")),
    nit:            strNullable(formData.get("nit")),
    nrc:            strNullable(formData.get("nrc")),
    other_document: strNullable(formData.get("other_document")),

    // Giro económico
    activity_code: strNullable(formData.get("activity_code")),
    activity_name: strNullable(formData.get("activity_name")),

    // Dirección
    dept_code:          strNullable(formData.get("dept_code")),
    dept_name:          strNullable(formData.get("dept_name")),
    municipality_code:  strNullable(formData.get("municipality_code")),
    municipality_name:  strNullable(formData.get("municipality_name")),
    country_code:       strNullable(formData.get("country_code")),
    country_name:       strNullable(formData.get("country_name")),
    address_complement: strNullable(formData.get("address_complement")),

    // Contacto
    contact_name: strNullable(formData.get("contact_name")),
    contact_role: strNullable(formData.get("contact_role")),
    phone:        strNullable(formData.get("phone")),
    phone_alt:    strNullable(formData.get("phone_alt")),
    email:        strNullable(formData.get("email")),
    whatsapp:     strNullable(formData.get("whatsapp")),
  };

  // 3. Validación Zod
  const parsed = updateSupplierSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  // 4. Delegación al service
  const result = await updateSupplier(tenantId, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { errors: { [result.field]: [result.error] } }
      : { error: result.error };
  }

  // 5. Revalidación del listado y del detalle
  revalidatePath("/dashboard/suppliers");
  revalidatePath(`/dashboard/suppliers/${parsed.data.id}`);
}
