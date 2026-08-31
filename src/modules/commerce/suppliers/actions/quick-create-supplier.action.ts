"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — quick-create-supplier.action.ts
//
// Alta rápida de proveedor desde el flujo de compras,
// sin salir del documento de compra.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// Solo 2 campos del usuario: name y taxpayer_type.
// supplier_code se genera automáticamente en el service.
//
// Diferencia clave respecto al create normal:
//   - Solo 2 campos (no 25)
//   - Devuelve { id, supplier_code } en el estado de éxito
//     para que purchases pueda auto-seleccionar el proveedor
//     recién creado sin una navegación adicional
//
// Contrato con la UI de purchases:
//   El componente debe observar que el estado tiene { id } definido
//   para disparar la selección automática del proveedor en el form.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { str } from "@/lib/utils/form-data-parsers";
import { quickCreateSupplierSchema } from "../schemas/quick-create-supplier.schema";
import { quickCreateSupplier } from "../services/supplier.service";

export type QuickCreateSupplierState =
  | {
      id?:            string;
      supplier_code?: string;
      errors?:        Record<string, string[]>;
      error?:         string;
    }
  | undefined;

export async function quickCreateSupplierAction(
  _prev: QuickCreateSupplierState,
  formData: FormData,
): Promise<QuickCreateSupplierState> {
  // 1. Sesión y permisos
  const sessionUser = await requireAdmin();
  const tenantId    = sessionUser.tenant_id;
  if (!tenantId) return { error: "La sesión no tiene un tenant activo." };

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) return { error: RUNTIME_READONLY_MESSAGE };

  // 2. Parseo de FormData (solo los 2 campos del usuario)
  const raw = {
    name:          str(formData.get("name")),
    taxpayer_type: str(formData.get("taxpayer_type")),
  };

  // 3. Validación Zod
  const parsed = quickCreateSupplierSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  // 4. Delegación al service
  const result = await quickCreateSupplier(tenantId, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { errors: { [result.field]: [result.error] } }
      : { error: result.error };
  }

  // 5. Revalidación del maestro de proveedores en background.
  //    No bloquea el flujo de purchases — el componente ya tiene el id.
  revalidatePath("/dashboard/suppliers");

  // Devuelve id y supplier_code para que purchases auto-seleccione el proveedor
  return { id: result.id, supplier_code: result.supplier_code };
}
