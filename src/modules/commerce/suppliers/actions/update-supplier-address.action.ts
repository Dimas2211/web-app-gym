"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — update-supplier-address.action.ts
//
// Actualiza solo los campos de dirección del proveedor desde la
// pestaña Dirección del maestro (S10G). No toca ningún otro campo.
//
// Enviar todos los campos vacíos / null → limpia la dirección completa.
// Coherencia: si hay municipality_code deben existir dept_code,
//   dept_name y municipality_name. Si hay country_code debe existir
//   country_name.
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
import { updateSupplierAddress } from "../services/supplier.service";

export type UpdateSupplierAddressState =
  | { error: string }
  | undefined;

export async function updateSupplierAddressAction(
  _prev: UpdateSupplierAddressState,
  formData: FormData,
): Promise<UpdateSupplierAddressState> {
  // 1. Sesión y permisos
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.suppliers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
      return { error: "Sin permisos para esta operación." };
    }

    // 2. Parseo de FormData
    const id                = str(formData.get("id"));
    const dept_code         = strNullable(formData.get("dept_code"));
    const dept_name         = strNullable(formData.get("dept_name"));
    const municipality_code = strNullable(formData.get("municipality_code"));
    const municipality_name = strNullable(formData.get("municipality_name"));
    const country_code      = strNullable(formData.get("country_code"));
    const country_name      = strNullable(formData.get("country_name"));
    const address_complement = strNullable(formData.get("address_complement"));

    if (!id) return { error: "ID del proveedor requerido." };

    // 3. Coherencia municipio
    if (municipality_code) {
      if (!dept_code)         return { error: "Si se asigna un municipio, el departamento es requerido." };
      if (!dept_name)         return { error: "Si se asigna un municipio, el nombre del departamento es requerido." };
      if (!municipality_name) return { error: "Si se asigna un código de municipio, el nombre del municipio es requerido." };

      // Validar que la combinación departamento/municipio exista en el
      // catálogo DTE — FASE VI-D2: contra la DB EFECTIVA, nunca Prisma global.
      const mun = await context.client.municipality.findUnique({
        where: { dept_code_code: { dept_code, code: municipality_code } },
        select: { id: true },
      });
      if (!mun) {
        return {
          error:
            "La combinación departamento/municipio no existe en el catálogo DTE. Seleccione un distrito válido.",
        };
      }
    }

    // 4. Coherencia país
    if (country_code && !country_name) {
      return { error: "Si se asigna un código de país, el nombre del país es requerido." };
    }

    // 5. Delegación al service
    const result = await updateSupplierAddress(context.tenantId, context.effectiveUser.id, {
      id,
      dept_code,
      dept_name,
      municipality_code,
      municipality_name,
      country_code,
      country_name,
      address_complement,
    }, context.client);

    if (!result.ok) return { error: result.error };

    // 6. Revalidación
    revalidatePath("/dashboard/suppliers");
  } finally {
    await dispose();
  }
}
