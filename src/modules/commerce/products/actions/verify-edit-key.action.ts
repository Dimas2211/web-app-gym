"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/products — verify-edit-key.action.ts
//
// Autoriza la edición de UN producto con la Clave de Supervisor
// tenant-level (Runtime DB efectiva). Emite un grant PRODUCT_EDIT
// ligado a tenant + usuario + producto; updateProductAction lo exige
// server-side.
//
// EDIT_CATALOG_PIN (variable de entorno del modelo "un deploy por
// cliente") quedó ELIMINADO: no hay fallback a .env ni clave default.
//
// Seguridad: el cliente solo recibe { ok } o { ok:false, error }.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import {
  readSupervisorPin,
  runSupervisorAuthorization,
} from "@/core/security/operational-authorization/run-supervisor-authorization";
import { OPERATIONAL_SCOPES } from "@/core/security/operational-authorization/scopes";
import type { SupervisorAuthActionState } from "@/core/security/operational-authorization/messages";

export async function verifyEditKeyAction(
  _prev: SupervisorAuthActionState,
  formData: FormData,
): Promise<SupervisorAuthActionState> {
  const sessionUser = await requireAdmin();

  return runSupervisorAuthorization(sessionUser, {
    scope: OPERATIONAL_SCOPES.PRODUCT_EDIT,
    module: "commerce.products",
    entityId: formData.get("entity_id") as string | null,
    pin: readSupervisorPin(formData),
    assertEntity: async (db, tenantId, productId) => {
      const product = await db.product.findFirst({
        where: { id: productId, tenant_id: tenantId },
        select: { id: true },
      });
      return product ? null : "El producto no existe o no pertenece a este tenant.";
    },
  });
}
