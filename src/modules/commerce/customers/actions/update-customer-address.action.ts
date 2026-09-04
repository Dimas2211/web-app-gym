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
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { str, strNullable } from "@/lib/utils/form-data-parsers";
import { prisma } from "@/lib/db/prisma";
import { updateCustomer } from "../services/customer.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type UpdateCustomerAddressState =
  | { error: string }
  | undefined;

export async function updateCustomerAddressAction(
  _prev: UpdateCustomerAddressState,
  formData: FormData,
): Promise<UpdateCustomerAddressState> {
  const sessionUser = await requireAdmin();
  const tenantId    = sessionUser.tenant_id;
  if (!tenantId) return { error: "La sesión no tiene un tenant activo." };

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) return { error: RUNTIME_READONLY_MESSAGE };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenantId);
    assertOrganizationModule(commercialCtx, "core.customers");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { error: err.userMessage };
    throw err;
  }

  const id                 = str(formData.get("id"));
  const dept_code          = strNullable(formData.get("dept_code"));
  const municipality_code  = strNullable(formData.get("municipality_code"));
  const address_complement = strNullable(formData.get("address_complement"));

  if (!id) return { error: "ID del cliente requerido." };

  if (municipality_code && !dept_code) {
    return { error: "Si se asigna un municipio, el departamento es requerido." };
  }

  // Validar que la combinación departamento/municipio exista en el catálogo DTE
  if (dept_code && municipality_code) {
    const mun = await prisma.municipality.findUnique({
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

  const result = await updateCustomer(id, tenantId, sessionUser.id, {
    dept_code,
    municipality_code,
    address_complement,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard/customers");
}
