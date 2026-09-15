"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — toggle-supplier-status.action.ts
//
// Activa o inactiva un proveedor del tenant. Sin borrado físico.
//
// Permiso: requireAdmin (super_admin | branch_admin).
//
// Regla de negocio prospectiva:
//   Un proveedor inactivo no puede seleccionarse en nuevas compras.
//   El historial de compras existente no se altera.
//   La restricción la aplica getSuppliersForLookup(activeOnly=true)
//   en el flujo de purchases — no aquí.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { str } from "@/lib/utils/form-data-parsers";
import { toggleSupplierStatusSchema } from "../schemas/toggle-supplier-status.schema";
import { toggleSupplierStatus } from "../services/supplier.service";

export type ToggleSupplierStatusState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

export async function toggleSupplierStatusAction(
  _prev: ToggleSupplierStatusState,
  formData: FormData,
): Promise<ToggleSupplierStatusState> {
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

    // 2. Parseo de FormData (solo id y status)
    const raw = {
      id:     str(formData.get("id")),
      status: str(formData.get("status")),
    };

    // 3. Validación Zod
    const parsed = toggleSupplierStatusSchema.safeParse(raw);
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }

    // 4. Delegación al service
    const result = await toggleSupplierStatus(context.tenantId, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      return result.field
        ? { errors: { [result.field]: [result.error] } }
        : { error: result.error };
    }

    // 5. Revalidación del listado y del detalle
    revalidatePath("/dashboard/suppliers");
    revalidatePath(`/dashboard/suppliers/${parsed.data.id}`);
  } finally {
    await dispose();
  }
}
