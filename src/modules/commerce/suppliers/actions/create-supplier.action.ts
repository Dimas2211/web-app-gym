"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — create-supplier.action.ts
//
// Crea un proveedor nuevo en el maestro del tenant.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// Razón: el maestro de proveedores es catálogo tenant-level;
// solo administradores pueden crear y modificar proveedores.
//
// La validación de negocio (unicidad de supplier_code, catálogos
// DTE-críticos) se delega al service. La action solo parsea FormData,
// valida el schema Zod y mapea el resultado.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { str, strNullable } from "@/lib/utils/form-data-parsers";
import { createSupplierSchema } from "../schemas/create-supplier.schema";
import { createSupplier } from "../services/supplier.service";

// ── Tipo de retorno ───────────────────────────────────────────────

export type SupplierActionState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ── Action ────────────────────────────────────────────────────────

export async function createSupplierAction(
  _prev: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  // 1. Sesión y permisos
  const sessionUser = await requireAdmin();
  const tenantId    = sessionUser.tenant_id;

  // Guard defensivo: tenant_id es string en el contrato de sesión,
  // pero un JWT malformado podría producir string vacío.
  if (!tenantId) return { error: "La sesión no tiene un tenant activo." };

  // 2. Parseo de FormData
  const raw = {
    // Identidad — obligatorios
    supplier_code: str(formData.get("supplier_code")),
    name:          str(formData.get("name")),
    taxpayer_type: str(formData.get("taxpayer_type")),

    // Identidad — opcionales
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
  const parsed = createSupplierSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  // 4. Delegación al service
  const result = await createSupplier(tenantId, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { errors: { [result.field]: [result.error] } }
      : { error: result.error };
  }

  // 5. Revalidación del listado
  revalidatePath("/dashboard/suppliers");

  // undefined = éxito — el dialog/componente cierra al recibir este valor
}
