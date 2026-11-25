// ─────────────────────────────────────────────────────────────────
// commerce/dte — transmit-return-event.service.ts
//
// MH20 (Fase 6, IMP20-022) — transmisión del Evento de Retorno.
//
// BLOQUEADA (MT-GAP-001): el registro de especificaciones marca
// transmissionBlocked para (MH_2_0, "18"). El servicio comprueba el
// bloqueo ANTES de resolver cualquier adaptador; ni siquiera un adaptador
// inyectado (mock) se invoca mientras el bloqueo exista. No hay bypass por
// variable de entorno.
//
// applyReturnTransmissionResult define el ciclo fiscal que se usará cuando
// exista el endpoint (y se prueba hoy con resultados simulados):
//   PROCESADO → ACCEPTED + sello (40)        RECHAZADO → REJECTED
//   incierto (timeout tras enviar)  → SIGNED + last_error REQUIRES_RECONCILIATION
//                                     (nunca retransmitir sin consultar)
//   error técnico sin envío         → SIGNED + last_error (reintentable)
// El DTE original NUNCA cambia de estado (el Retorno no invalida).
// ─────────────────────────────────────────────────────────────────

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { dteSpecTransmissionBlockedError } from "../spec/dte-spec-registry";
import type { MhEventTransmissionResult } from "../adapters/dte-return-transmission.adapter";

export interface TransmitReturnEventParams {
  returnEventId: string;
  userId:        string | null;
  tenantId:      string;
  locationId:    string;
}

export type TransmitReturnEventResult =
  | { ok: true; status: "ACCEPTED" | "REJECTED" }
  | { ok: false; error: string; code?: "MT-GAP-001" | "REQUIRES_RECONCILIATION" | "NOT_SIGNED" | "NOT_FOUND" | "TECHNICAL" };

export async function transmitReturnEvent(
  params: TransmitReturnEventParams,
  db: PrismaClient = prisma,
): Promise<TransmitReturnEventResult> {
  const ev = await db.dteReturnEvent.findFirst({
    where:  { id: params.returnEventId, tenant_id: params.tenantId, location_id: params.locationId },
    select: { id: true, status: true, signed_jws: true },
  });
  if (!ev) return { ok: false, code: "NOT_FOUND", error: "El Evento de Retorno no existe o no pertenece a la location activa." };
  if (ev.status !== "SIGNED" || !ev.signed_jws) {
    return { ok: false, code: "NOT_SIGNED", error: `Solo se transmiten Retornos firmados. Estado actual: "${ev.status}".` };
  }
  const blocked = dteSpecTransmissionBlockedError("MH_2_0", "18");
  if (blocked) return { ok: false, code: "MT-GAP-001", error: blocked };
  // Inalcanzable mientras MT-GAP-001 siga abierto: no existe adaptador
  // productivo con URL. Cuando MH publique el endpoint se implementará
  // aquí la llamada y se aplicará applyReturnTransmissionResult.
  return { ok: false, code: "MT-GAP-001", error: "Transmisión del Evento de Retorno no implementada (MT-GAP-001)." };
}

/** Ciclo fiscal del Retorno tras una respuesta (simulada hoy). Solo actualiza el evento. */
export async function applyReturnTransmissionResult(
  db: Pick<PrismaClient, "dteReturnEvent">,
  params: { returnEventId: string; userId: string | null; result: MhEventTransmissionResult; now?: Date },
): Promise<TransmitReturnEventResult> {
  const { returnEventId, userId, result } = params;
  const now = params.now ?? new Date();
  if (!result.ok) {
    await db.dteReturnEvent.update({
      where: { id: returnEventId },
      data:  {
        status:     "SIGNED",
        last_error: result.uncertain ? `REQUIRES_RECONCILIATION: ${result.message}` : result.message,
        updated_by: userId,
      },
    });
    return result.uncertain
      ? { ok: false, code: "REQUIRES_RECONCILIATION", error: "Respuesta incierta: consultar el estado en MH antes de cualquier reenvío." }
      : { ok: false, code: "TECHNICAL", error: result.message };
  }
  const observations = result.observaciones != null ? (result.observaciones as Prisma.InputJsonValue) : Prisma.JsonNull;
  if (result.mhEstado === "PROCESADO" && result.selloRecibido && /^[A-Z0-9]{40}$/.test(result.selloRecibido)) {
    await db.dteReturnEvent.update({
      where: { id: returnEventId },
      data:  {
        status: "ACCEPTED", mh_estado: result.mhEstado, mh_sello_recibido: result.selloRecibido,
        mh_codigo_msg: result.codigoMsg, mh_descripcion_msg: result.descripcionMsg, mh_observaciones: observations,
        sent_at: now, accepted_at: now, last_error: null, updated_by: userId,
      },
    });
    return { ok: true, status: "ACCEPTED" };
  }
  if (result.mhEstado === "RECHAZADO") {
    await db.dteReturnEvent.update({
      where: { id: returnEventId },
      data:  {
        status: "REJECTED", mh_estado: result.mhEstado, mh_codigo_msg: result.codigoMsg,
        mh_descripcion_msg: result.descripcionMsg, mh_observaciones: observations,
        rejected_at: now, last_error: result.descripcionMsg ?? "MH rechazó el evento.", updated_by: userId,
      },
    });
    return { ok: true, status: "REJECTED" };
  }
  await db.dteReturnEvent.update({
    where: { id: returnEventId },
    data:  { status: "SIGNED", last_error: `REQUIRES_RECONCILIATION: respuesta MH no concluyente (${result.mhEstado})`, updated_by: userId },
  });
  return { ok: false, code: "REQUIRES_RECONCILIATION", error: "Respuesta MH no concluyente: conciliar antes de reenviar." };
}
