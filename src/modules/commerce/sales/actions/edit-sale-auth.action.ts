"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — edit-sale-auth.action.ts
//
// Autoriza la edición de UNA venta DRAFT con la Clave de Supervisor
// tenant-level (Runtime DB efectiva vía context.client — nunca Prisma
// global). Emite grant SALE_EDIT ligado a tenant + usuario + venta;
// /dashboard/sales/new?sale_id= y las mutaciones de cabecera/líneas lo
// exigen server-side.
//
// Reemplaza el esquema anterior de correo + contraseña administrativa
// (que además consultaba Prisma global por no recibir context.client).
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

export async function editSaleAuthAction(
  _prev: SupervisorAuthActionState,
  formData: FormData,
): Promise<SupervisorAuthActionState> {
  const sessionUser = await requireAdmin();

  return runSupervisorAuthorization(sessionUser, {
    scope: OPERATIONAL_SCOPES.SALE_EDIT,
    module: "commerce.sales",
    entityId: formData.get("entity_id") as string | null,
    pin: readSupervisorPin(formData),
    assertEntity: async (db, tenantId, saleId) => {
      const sale = await db.sale.findFirst({
        where: { id: saleId, tenant_id: tenantId },
        select: { status: true },
      });
      if (!sale) return "La venta no existe o no pertenece a este tenant.";
      if (sale.status !== "DRAFT") return "Solo las ventas en borrador pueden editarse.";
      return null;
    },
  });
}
