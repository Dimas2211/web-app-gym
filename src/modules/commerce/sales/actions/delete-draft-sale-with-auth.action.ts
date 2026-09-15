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
import { discardDraftSale } from "../services/sale.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type DeleteDraftSaleWithAuthState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export async function deleteDraftSaleWithAuthAction(
  _prev: DeleteDraftSaleWithAuthState,
  formData: FormData,
): Promise<DeleteDraftSaleWithAuthState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.sales", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(sessionUser, context.client, context.tenantId));
    if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

    const sale_id  = (formData.get("sale_id")      as string ?? "").trim();
    const email    = (formData.get("auth_email")    as string ?? "").trim();
    const password = (formData.get("auth_password") as string ?? "");

    if (!sale_id)            return { ok: false, error: "El ID de venta es requerido." };
    if (!email || !password) return { ok: false, error: "Correo y contraseña son requeridos." };

    const authResult = await verifyAdminDeleteCredentials(
      { email, password },
      context.tenantId,
    );

    if (!authResult.authorized) {
      return { ok: false, error: authResult.error };
    }

    const result = await discardDraftSale(sale_id, context.tenantId, location_id, context.client);

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/sales");

    return { ok: true };
  } finally {
    await dispose();
  }
}
