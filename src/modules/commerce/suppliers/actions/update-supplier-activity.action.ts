"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — update-supplier-activity.action.ts
//
// Actualiza solo el giro económico del proveedor desde la pestaña
// Giro del maestro (S10F). No toca ningún otro campo.
//
// Enviar activity_code vacío / null → limpia el giro.
// Coherencia: si hay activity_code debe existir activity_name.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// Éxito:   undefined
// Error:   { error: string }
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { str, strNullable } from "@/lib/utils/form-data-parsers";
import { updateSupplierActivity } from "../services/supplier.service";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type UpdateSupplierActivityState =
  | { error: string }
  | undefined;

export async function updateSupplierActivityAction(
  _prev: UpdateSupplierActivityState,
  formData: FormData,
): Promise<UpdateSupplierActivityState> {
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
  const id            = str(formData.get("id"));
  const activity_code = strNullable(formData.get("activity_code"));
  const activity_name = strNullable(formData.get("activity_name"));

  if (!id) return { error: "ID del proveedor requerido." };

  // 3. Coherencia code / name
  if (activity_code && !activity_name) {
    return { error: "Si se asigna un código de actividad, el nombre es requerido." };
  }

  // 4. Delegación al service
  const result = await updateSupplierActivity(tenantId, sessionUser.id, {
    id,
    activity_code,
    activity_name,
  });

  if (!result.ok) return { error: result.error };

  // 5. Revalidación del listado y detalle
  revalidatePath("/dashboard/suppliers");
}
