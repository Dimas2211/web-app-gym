"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — update-customer-address.action.ts
//
// Actualiza solo los campos de dirección del cliente desde la
// pestaña Dirección del maestro.
// No toca identificación, actividad, contacto ni estado.
//
// Enviar todos los campos vacíos → limpia la dirección completa.
// Coherencia: si hay municipality_code debe existir dept_code.
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

export type UpdateCustomerAddressState =
  | { error: string }
  | undefined;

export async function updateCustomerAddressAction(
  _prev: UpdateCustomerAddressState,
  formData: FormData,
): Promise<UpdateCustomerAddressState> {
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

    const id                 = str(formData.get("id"));
    const dept_code          = strNullable(formData.get("dept_code"));
    const municipality_code  = strNullable(formData.get("municipality_code"));
    const address_complement = strNullable(formData.get("address_complement"));

    if (!id) return { error: "ID del cliente requerido." };

    if (municipality_code && !dept_code) {
      return { error: "Si se asigna un municipio, el departamento es requerido." };
    }

    // Validar que la combinación departamento/municipio exista en el
    // catálogo DTE — FASE VI-D2: contra la DB EFECTIVA (runtime propia
    // para RUNTIME_CLIENT), nunca Prisma global.
    if (dept_code && municipality_code) {
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

    const result = await updateCustomer(id, context.tenantId, context.effectiveUser.id, {
      dept_code,
      municipality_code,
      address_complement,
    }, context.client);

    if (!result.ok) return { error: result.error };

    revalidatePath("/dashboard/customers");
  } finally {
    await dispose();
  }
}
