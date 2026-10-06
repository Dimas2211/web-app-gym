"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — delete-draft-purchase-with-auth.action.ts
//
// Elimina físicamente una compra DRAFT previa verificación de la
// Clave de Supervisor (PURCHASE_DELETE_DRAFT, un solo uso: la clave se
// verifica en esta misma request). Reemplaza DELETE /api/purchases/:id,
// que quedó deshabilitado para no ser un bypass.
//
// Retorna:
//   { ok: true }                       — borrador eliminado
//   { ok: false; error: string }       — clave inválida o fallo
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { deleteDraftPurchase } from "../services/purchase.service";
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
  PURCHASE_DRAFT_WRITE_SCOPES,
} from "@/core/security/operational-authorization/scopes";
import type { SupervisorAuthActionState } from "@/core/security/operational-authorization/messages";

export async function deleteDraftPurchaseWithAuthAction(
  _prev: SupervisorAuthActionState,
  formData: FormData,
): Promise<SupervisorAuthActionState> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.purchases", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
        context.client,
        context.tenantId,
      ));
    if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

    const purchase_id = ((formData.get("purchase_id") as string) ?? "").trim();
    if (!purchase_id) return { ok: false, error: "purchase_id es requerido." };

    const auth = await verifySupervisorPinForOperation(
      context,
      OPERATIONAL_SCOPES.PURCHASE_DELETE_DRAFT,
      readSupervisorPin(formData),
    );
    if (!auth.ok) return auth;

    const result = await deleteDraftPurchase(purchase_id, context.tenantId, location_id, context.client);
    if (!result.ok) return { ok: false, error: result.error };

    await revokeOperationalGrants(PURCHASE_DRAFT_WRITE_SCOPES, purchase_id);
    revalidatePath("/dashboard/purchases");

    return { ok: true };
  } finally {
    await dispose();
  }
}
