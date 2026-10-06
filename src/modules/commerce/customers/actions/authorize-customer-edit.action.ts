"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — authorize-customer-edit.action.ts
//
// Autoriza la edición de UN cliente del maestro Commerce Customers con
// la Clave de Supervisor tenant-level. Emite grant CUSTOMER_EDIT ligado
// a tenant + usuario + cliente; las actions de edición (cabecera y
// pestañas) lo exigen server-side. No aplica al módulo legacy GYM
// `clients`.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import {
  readSupervisorPin,
  runSupervisorAuthorization,
} from "@/core/security/operational-authorization/run-supervisor-authorization";
import { OPERATIONAL_SCOPES } from "@/core/security/operational-authorization/scopes";
import type { SupervisorAuthActionState } from "@/core/security/operational-authorization/messages";

export async function authorizeCustomerEditAction(
  _prev: SupervisorAuthActionState,
  formData: FormData,
): Promise<SupervisorAuthActionState> {
  const sessionUser = await requireAdmin();

  return runSupervisorAuthorization(sessionUser, {
    scope: OPERATIONAL_SCOPES.CUSTOMER_EDIT,
    module: "core.customers",
    entityId: formData.get("entity_id") as string | null,
    pin: readSupervisorPin(formData),
    assertEntity: async (db, tenantId, customerId) => {
      const customer = await db.customer.findFirst({
        where: { id: customerId, tenant_id: tenantId },
        select: { id: true },
      });
      return customer ? null : "El cliente no fue encontrado.";
    },
  });
}
