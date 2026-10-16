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
// Permiso: requireCommerceOperator + rol LIVE canOperateCommerce.
//
// Reemplaza el esquema anterior de correo + contraseña administrativa
// (que además consultaba Prisma global por no recibir context.client).
//
// Retorna:
//   { ok: true }                       — autorizado, proceder
//   { ok: false; error: string }       — no autorizado
// ─────────────────────────────────────────────────────────────────

import { requireCommerceOperator } from "@/lib/permissions/guards";
import { canOperateCommerce } from "@/core/permissions/commerce-access";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { assertCommerceOperatorAccess } from "@/modules/commerce/shared/require-commerce-operator-context";
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
  const sessionUser = await requireCommerceOperator();

  return runSupervisorAuthorization(sessionUser, {
    scope: OPERATIONAL_SCOPES.SALE_EDIT,
    module: "commerce.sales",
    entityId: formData.get("entity_id") as string | null,
    pin: readSupervisorPin(formData),
    // Operadores de ventas (incl. reception) pueden SOLICITAR la
    // autorización; la Clave de Supervisor sigue siendo el control.
    isRoleAllowed: canOperateCommerce,
    // Sales es location-scoped: el grant solo se emite para ventas de la
    // sucursal EFECTIVA. Roles no globales: su sucursal fija (contexto
    // operacional). super_admin: sucursal activa validada contra la DB
    // efectiva — mismo criterio que el resto de actions de ventas.
    assertEntity: async (db, tenantId, saleId, scope) => {
      // No globales: la sucursal de la sesión debe seguir siendo su
      // asignación actual (User.branch_id) — sin grant para la sede anterior.
      const denied = await assertCommerceOperatorAccess({
        db,
        tenantId,
        userId: sessionUser.id,
        role: scope.effectiveRole,
        locationId: scope.locationId,
      });
      if (denied) return denied;

      const location_id =
        scope.locationId ??
        (getCapabilities(scope.effectiveRole).isGlobal
          ? await getEffectiveLocationId(sessionUser, db, tenantId)
          : null);
      if (!location_id) return "La sesión no tiene una location activa.";

      const sale = await db.sale.findFirst({
        where: { id: saleId, tenant_id: tenantId, location_id },
        select: { status: true },
      });
      // Mismo mensaje para "no existe" y "otra sucursal": no revela ventas ajenas.
      if (!sale) return "La venta no existe o no pertenece a esta sucursal.";
      if (sale.status !== "DRAFT") return "Solo las ventas en borrador pueden editarse.";
      return null;
    },
  });
}
