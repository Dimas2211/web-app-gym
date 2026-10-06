"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — delete-draft-sale-with-auth.action.ts
//
// Descarta físicamente una venta DRAFT previa verificación de la
// Clave de Supervisor (SALE_DELETE_DRAFT, un solo uso: verificada en
// esta misma request contra la Runtime DB efectiva — context.client).
//
// Retorna:
//   { ok: true }                       — borrador eliminado
//   { ok: false; error: string }       — clave inválida o fallo
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { discardDraftSale } from "../services/sale.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import {
  revokeOperationalGrants,
  verifySupervisorPinForOperation,
} from "@/core/security/operational-authorization/operational-authorization";
import { readSupervisorPin } from "@/core/security/operational-authorization/run-supervisor-authorization";
import {
  OPERATIONAL_SCOPES,
  SALE_DRAFT_WRITE_SCOPES,
} from "@/core/security/operational-authorization/scopes";

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

    const sale_id = ((formData.get("sale_id") as string) ?? "").trim();
    if (!sale_id) return { ok: false, error: "El ID de venta es requerido." };

    const auth = await verifySupervisorPinForOperation(
      context,
      OPERATIONAL_SCOPES.SALE_DELETE_DRAFT,
      readSupervisorPin(formData),
    );
    if (!auth.ok) return auth;

    const result = await discardDraftSale(sale_id, context.tenantId, location_id, context.client);

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    await revokeOperationalGrants(SALE_DRAFT_WRITE_SCOPES, sale_id);
    revalidatePath("/dashboard/sales");

    return { ok: true };
  } finally {
    await dispose();
  }
}
