"use server";

// commerce/dte — deliver-invalidation-to-external-db.action.ts
//
// Server Action: entrega un DteInvalidationEvent ACCEPTED a la base MariaDB externa.
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id siempre desde sesión.
//   - No devuelve payload externo completo al cliente.
//   - No expone signed_jws, event_json completo ni credenciales MariaDB.
//   - Revalida /dashboard/sales al completar.

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  deliverInvalidationToExternalDb,
  type DeliverInvalidationToExternalDbParams,
} from "../services/deliver-invalidation-to-external-db.service";
import type { DeliverInvalidationToExternalDbResult } from "../types/external-dte-delivery.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type { DeliverInvalidationToExternalDbResult };

export async function deliverInvalidationToExternalDbAction(
  invalidationEventId: string,
): Promise<DeliverInvalidationToExternalDbResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)            return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)          return { ok: false, error: "La sesión no tiene una location activa." };
  if (!invalidationEventId)  return { ok: false, error: "El ID del evento de invalidación es requerido." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const params: DeliverInvalidationToExternalDbParams = {
    invalidationEventId,
    userId:     sessionUser.id,
    tenantId:   tenant_id,
    locationId: location_id,
  };

  const result = await deliverInvalidationToExternalDb(params);

  if (result.ok) {
    revalidatePath("/dashboard/sales");
  }

  // Devolver solo metadatos seguros — nunca payload externo completo
  if (result.ok) {
    return {
      ok:                  true,
      insertId:            result.insertId,
      affectedRows:        result.affectedRows,
      invalidationEventId: result.invalidationEventId,
      dteDocumentId:       result.dteDocumentId,
    };
  }

  return { ok: false, error: result.error };
}
