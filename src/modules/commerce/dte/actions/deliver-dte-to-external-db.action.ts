"use server";

// commerce/dte — deliver-dte-to-external-db.action.ts
//
// Server Action: entrega un DteOutgoingDocument ACCEPTED a la base MariaDB externa.
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id siempre desde sesión.
//   - No devuelve payload externo completo al cliente.
//   - No expone signed_jws, json_document completo ni credenciales MariaDB.
//   - Revalida /dashboard/sales al completar.

import { revalidatePath }         from "next/cache";
import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  deliverDteToExternalDb,
  type DeliverDteToExternalDbParams,
} from "../services/deliver-dte-to-external-db.service";
import type { DeliverDteToExternalDbResult } from "../types/external-dte-delivery.types";

export type { DeliverDteToExternalDbResult };

export async function deliverDteToExternalDbAction(
  dteDocumentId: string,
): Promise<DeliverDteToExternalDbResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)     return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id)   return { ok: false, error: "La sesión no tiene una location activa." };
  if (!dteDocumentId) return { ok: false, error: "El ID del documento DTE es requerido." };

  const params: DeliverDteToExternalDbParams = {
    dteDocumentId,
    userId:     sessionUser.id,
    tenantId:   tenant_id,
    locationId: location_id,
  };

  const result = await deliverDteToExternalDb(params);

  if (result.ok) {
    revalidatePath("/dashboard/sales");
  }

  // Devolver solo metadatos seguros — nunca payload externo completo
  if (result.ok) {
    return {
      ok:           true,
      insertId:     result.insertId,
      affectedRows: result.affectedRows,
    };
  }

  return { ok: false, error: result.error };
}
