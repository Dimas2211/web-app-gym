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
import type { UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { str, strNullable } from "@/lib/utils/form-data-parsers";
import { updateSupplierActivity } from "../services/supplier.service";

export type UpdateSupplierActivityState =
  | { error: string }
  | undefined;

export async function updateSupplierActivityAction(
  _prev: UpdateSupplierActivityState,
  formData: FormData,
): Promise<UpdateSupplierActivityState> {
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
    const id            = str(formData.get("id"));
    const activity_code = strNullable(formData.get("activity_code"));
    const activity_name = strNullable(formData.get("activity_name"));

    if (!id) return { error: "ID del proveedor requerido." };

    // 3. Coherencia code / name
    if (activity_code && !activity_name) {
      return { error: "Si se asigna un código de actividad, el nombre es requerido." };
    }

    // 4. Delegación al service
    const result = await updateSupplierActivity(context.tenantId, context.effectiveUser.id, {
      id,
      activity_code,
      activity_name,
    }, context.client);

    if (!result.ok) return { error: result.error };

    // 5. Revalidación del listado y detalle
    revalidatePath("/dashboard/suppliers");
  } finally {
    await dispose();
  }
}
