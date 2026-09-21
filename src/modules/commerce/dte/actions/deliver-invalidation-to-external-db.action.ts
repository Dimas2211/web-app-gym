"use server";

// commerce/dte — deliver-invalidation-to-external-db.action.ts
//
// Server Action: entrega un DteInvalidationEvent ACCEPTED a la base MariaDB externa.
//
// Reglas:
//   - Sin sesión runtime activa: comportamiento sin cambios — requireAdmin(),
//     tenant_id/location_id de la sesión normal, Prisma global.
//   - Con sesión runtime "Operar como cliente" activa: runtime-aware vía
//     requireRuntimeDteWriteAccess("DELIVER_EXTERNAL") — mismo guard y misma
//     allowlist que deliver-dte-to-external-db.action.ts (FASE VI-E7, cierre
//     de la deuda documentada en VI-E6B: el servicio ya aceptaba `client`
//     runtime, pero este entry point todavía no lo resolvía).
//   - El delivery externo (MariaDB) en sí es siempre el mismo, configurado
//     por variables de entorno — no cambia con el modo runtime.
//   - No devuelve payload externo completo al cliente.
//   - No expone signed_jws, event_json completo ni credenciales MariaDB.
//   - Revalida /dashboard/sales al completar.

import { revalidatePath } from "next/cache";
import {
  requireRuntimeDteWriteAccess,
  recordRuntimeDteWriteAudit,
} from "../runtime/require-runtime-dte-write-access";
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
  options?: { confirmed?: boolean },
): Promise<DeliverInvalidationToExternalDbResult> {
  if (!invalidationEventId) return { ok: false, error: "El ID del evento de invalidación es requerido." };

  const access = await requireRuntimeDteWriteAccess({
    action:    "DELIVER_EXTERNAL",
    confirmed: options?.confirmed ?? false,
  });

  if (!access.ok) {
    return { ok: false, error: access.error };
  }

  const { tenantId, locationId, client, userId, isRuntimeWrite, runtimeInfo, dispose } = access.context;

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenantId);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    await dispose();
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  let result: DeliverInvalidationToExternalDbResult;
  try {
    const params: DeliverInvalidationToExternalDbParams = {
      invalidationEventId,
      userId,
      tenantId,
      locationId,
      client,
    };

    result = await deliverInvalidationToExternalDb(params);
  } finally {
    await dispose();
  }

  if (isRuntimeWrite && runtimeInfo) {
    await recordRuntimeDteWriteAudit({
      organizationId: runtimeInfo.organizationId,
      triggeredBy:    userId,
      action:         "DELIVER_EXTERNAL",
      dteDocumentId:  invalidationEventId,
      ok:             result.ok,
      detail:         result.ok ? undefined : result.error,
    });
  }

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
