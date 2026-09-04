"use server";

// commerce/dte — deliver-dte-to-external-db.action.ts
//
// Server Action: entrega un DteOutgoingDocument ACCEPTED a la base MariaDB externa.
//
// Reglas:
//   - Sin sesión runtime activa: comportamiento sin cambios — requireAdmin(),
//     tenant_id/location_id de la sesión normal, Prisma global.
//   - Con sesión runtime "Operar como cliente" activa: runtime-aware vía
//     requireRuntimeDteWriteAccess("DELIVER_EXTERNAL") — exige super_admin +
//     `confirmed: true` explícito desde el diálogo de confirmación en UI, y
//     lee/escribe el documento DTE contra la base del cliente runtime
//     (nunca contra Prisma global). Registra auditoría en control plane.
//   - El delivery externo (MariaDB) en sí es siempre el mismo, configurado
//     por variables de entorno — no cambia con el modo runtime.
//   - No devuelve payload externo completo al cliente.
//   - No expone signed_jws, json_document completo ni credenciales MariaDB.
//   - Revalida /dashboard/sales al completar.

import { revalidatePath } from "next/cache";
import {
  requireRuntimeDteWriteAccess,
  recordRuntimeDteWriteAudit,
} from "../runtime/require-runtime-dte-write-access";
import {
  deliverDteToExternalDb,
  type DeliverDteToExternalDbParams,
} from "../services/deliver-dte-to-external-db.service";
import type { DeliverDteToExternalDbResult } from "../types/external-dte-delivery.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type { DeliverDteToExternalDbResult };

export async function deliverDteToExternalDbAction(
  dteDocumentId: string,
  options?: { confirmed?: boolean },
): Promise<DeliverDteToExternalDbResult> {
  if (!dteDocumentId) return { ok: false, error: "El ID del documento DTE es requerido.", targetTable: null };

  const access = await requireRuntimeDteWriteAccess({
    action:    "DELIVER_EXTERNAL",
    confirmed: options?.confirmed ?? false,
  });

  if (!access.ok) {
    return { ok: false, error: access.error, targetTable: null };
  }

  const { tenantId, locationId, client, userId, isRuntimeWrite, runtimeInfo, dispose } = access.context;

  // Bloque B — el tenant efectivo ya viene resuelto por
  // requireRuntimeDteWriteAccess (sesión normal o runtime "operar como
  // cliente"), así que un super_admin en modo runtime queda sujeto al
  // contrato comercial del CLIENTE, no al suyo.
  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenantId);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    await dispose();
    if (err instanceof CommercialEnforcementError) {
      return { ok: false, error: err.userMessage, targetTable: null };
    }
    throw err;
  }

  let result: DeliverDteToExternalDbResult;
  try {
    const params: DeliverDteToExternalDbParams = {
      dteDocumentId,
      userId,
      tenantId,
      locationId,
      client,
    };

    result = await deliverDteToExternalDb(params);
  } finally {
    await dispose();
  }

  if (isRuntimeWrite && runtimeInfo) {
    await recordRuntimeDteWriteAudit({
      organizationId: runtimeInfo.organizationId,
      triggeredBy:    userId,
      action:         "DELIVER_EXTERNAL",
      dteDocumentId,
      ok:             result.ok,
      detail:         result.ok ? undefined : result.error,
    });
  }

  if (result.ok) {
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/purchases");
    revalidatePath("/dashboard/dte/outgoing");

    // Devolver solo metadatos seguros — nunca payload externo completo.
    // ok: true confirma INSERT + affectedRows >= 1 + commit. No se requiere SELECT.
    return {
      ok:           true,
      insertId:     result.insertId,
      affectedRows: result.affectedRows,
      targetTable:  result.targetTable,
    };
  }

  return {
    ok:          false,
    error:       result.error,
    targetTable: result.targetTable,
    errorCode:   result.errorCode,
  };
}
