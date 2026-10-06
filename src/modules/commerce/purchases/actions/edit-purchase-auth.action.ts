"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — edit-purchase-auth.action.ts
//
// Autoriza la edición de UNA compra DRAFT con la Clave de Supervisor
// tenant-level (Runtime DB efectiva). Emite grant PURCHASE_EDIT ligado
// a tenant + usuario + compra. /dashboard/purchases/[id]/edit y todas
// las mutaciones de cabecera/líneas lo exigen server-side.
//
// Reemplaza el esquema anterior de correo + contraseña administrativa.
//
// Retorna:
//   { ok: true }                       — autorizado, proceder
//   { ok: false; error: string }       — no autorizado
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import {
  readSupervisorPin,
  runSupervisorAuthorization,
} from "@/core/security/operational-authorization/run-supervisor-authorization";
import { OPERATIONAL_SCOPES } from "@/core/security/operational-authorization/scopes";
import type { SupervisorAuthActionState } from "@/core/security/operational-authorization/messages";

export async function editPurchaseAuthAction(
  _prev: SupervisorAuthActionState,
  formData: FormData,
): Promise<SupervisorAuthActionState> {
  const sessionUser = await requireAdmin();

  return runSupervisorAuthorization(sessionUser, {
    scope: OPERATIONAL_SCOPES.PURCHASE_EDIT,
    module: "commerce.purchases",
    entityId: formData.get("entity_id") as string | null,
    pin: readSupervisorPin(formData),
    assertEntity: async (db, tenantId, purchaseId) => {
      const purchase = await db.purchase.findFirst({
        where: { id: purchaseId, tenant_id: tenantId },
        select: { status: true },
      });
      if (!purchase) return "La compra no existe o no pertenece a este tenant.";
      if (purchase.status !== "DRAFT") return "Solo las compras en borrador pueden editarse.";
      return null;
    },
  });
}
