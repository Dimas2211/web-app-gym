"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — delete-draft-sale-with-auth.action.ts
//
// Descarta físicamente una venta DRAFT previa verificación de
// credenciales administrativas. Sigue el mismo patrón de
// autorización que edit-sale-auth.action.ts.
//
// Retorna:
//   { ok: true }                       — borrador eliminado
//   { ok: false; error: string }       — credenciales inválidas o fallo
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { verifyAdminDeleteCredentials } from "@/lib/permissions/delete-authorization";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { discardDraftSale } from "../services/sale.service";

export type DeleteDraftSaleWithAuthState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export async function deleteDraftSaleWithAuthAction(
  _prev: DeleteDraftSaleWithAuthState,
  formData: FormData,
): Promise<DeleteDraftSaleWithAuthState> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return { ok: false, error: RUNTIME_READONLY_MESSAGE };
  }

  const sale_id  = (formData.get("sale_id")      as string ?? "").trim();
  const email    = (formData.get("auth_email")    as string ?? "").trim();
  const password = (formData.get("auth_password") as string ?? "");

  if (!sale_id)            return { ok: false, error: "El ID de venta es requerido." };
  if (!email || !password) return { ok: false, error: "Correo y contraseña son requeridos." };

  const authResult = await verifyAdminDeleteCredentials(
    { email, password },
    tenant_id,
  );

  if (!authResult.authorized) {
    return { ok: false, error: authResult.error };
  }

  const result = await discardDraftSale(sale_id, tenant_id, location_id);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/sales");

  return { ok: true };
}
