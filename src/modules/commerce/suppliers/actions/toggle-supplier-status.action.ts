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
import { requireAdmin } from "@/lib/permissions/guards";
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
  const tenantId    = sessionUser.tenant_id;
  if (!tenantId) return { error: "La sesión no tiene un tenant activo." };

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
  const result = await toggleSupplierStatus(tenantId, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { errors: { [result.field]: [result.error] } }
      : { error: result.error };
  }

  // 5. Revalidación del listado y del detalle
  revalidatePath("/dashboard/suppliers");
  revalidatePath(`/dashboard/suppliers/${parsed.data.id}`);
}
