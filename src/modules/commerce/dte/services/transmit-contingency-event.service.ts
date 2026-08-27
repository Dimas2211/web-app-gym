// commerce/dte — transmit-contingency-event.service.ts
//
// Transmite un DteContingencyEvent en estado SIGNED al MH.
// Endpoint: POST /fesv/contingencia
//
// Flujo: SIGNED → SENT → ACCEPTED | REJECTED
//
// Reglas:
//   - Solo opera sobre DteContingencyEvent.status === "SIGNED".
//   - signed_jws debe existir.
//   - Error técnico: revierte a SIGNED. Registra log.
//   - Éxito con estado que no indique rechazo: ACCEPTED + accepted_at.
//   - Éxito con estado de rechazo: REJECTED + rejected_at.
//   - Registra DteTransmissionLog en todos los casos.
//   - NO transmite el/los DTE asociados a /recepciondte — eso es Bloque C.
//   - No expone signed_jws ni token.

import { prisma }  from "@/lib/db/prisma";
import { Prisma }  from "@prisma/client";
import { normalizeNitForDte } from "../utils/fiscal-id.utils";
import { MhContingencyTransmissionAdapter } from "../adapters/dte-contingency-transmission.adapter";

// ── Tipos públicos ────────────────────────────────────────────────

export interface TransmitContingencyEventParams {
  contingencyEventId: string;
  tenantId:           string;
  locationId:         string;
}

export type TransmitContingencyEventResult =
  | {
      ok:            true;
      eventStatus:   "ACCEPTED" | "REJECTED";
      mhEstado:      string;
      mensaje:       string | null;
      selloRecibido: string | null;
      observaciones: unknown[] | null;
    }
  | { ok: false; error: string };

// ── Error de negocio interno ────────────────────────────────────────

class TransmitContingencyBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransmitContingencyBusinessError";
  }
}

// Heurística tolerante: el manual documenta el shape de la respuesta
// ({ estado, fechaHora, mensaje, selloRecibido, observaciones }) pero no
// enumera los literales exactos de "estado" para contingencia (a
// diferencia de invalidación, que documenta PROCESADO/RECHAZADO). Se
// interpreta cualquier "estado" que contenga "RECHAZ" como rechazo; el
// resto (ej. RECIBIDO, PROCESADO, ACEPTADO) como aceptación. Si la
// respuesta real de MH TEST contradice esta heurística, se ajustará con
// evidencia (ver sección 14 del prompt de implementación).
function isRejectedEstado(estado: string): boolean {
  return estado.toUpperCase().includes("RECHAZ");
}

// ── Función principal ─────────────────────────────────────────────

export async function transmitContingencyEvent(
  params: TransmitContingencyEventParams,
): Promise<TransmitContingencyEventResult> {
  const { contingencyEventId, tenantId, locationId } = params;

  try {
    // 1. Cargar evento con scope tenant/location
    const event = await prisma.dteContingencyEvent.findFirst({
      where: { id: contingencyEventId, tenant_id: tenantId, location_id: locationId },
      select: {
        id:         true,
        status:     true,
        signed_jws: true,
        items: {
          take: 1,
          select: {
            dte_document_id: true,
            dte_document: { select: { issuer_config_id: true } },
          },
        },
      },
    });

    if (!event) {
      throw new TransmitContingencyBusinessError(
        "El Evento de Contingencia no existe o no pertenece a la location activa.",
      );
    }
    if (event.status !== "SIGNED") {
      throw new TransmitContingencyBusinessError(
        `Solo se pueden transmitir eventos firmados. Estado actual: ${event.status}.`,
      );
    }
    if (!event.signed_jws) {
      throw new TransmitContingencyBusinessError("El evento no tiene JWS firmado.");
    }
    const refItem = event.items[0];
    if (!refItem?.dte_document.issuer_config_id) {
      throw new TransmitContingencyBusinessError(
        "El Evento de Contingencia no tiene un documento DTE con issuer_config_id asociado.",
      );
    }

    // 2. Cargar emisor (nit + environment)
    const issuerConfig = await prisma.dteIssuerConfig.findFirst({
      where:  { id: refItem.dte_document.issuer_config_id },
      select: { nit: true, environment: true },
    });
    if (!issuerConfig?.nit) {
      throw new TransmitContingencyBusinessError(
        "No se encontró la configuración del emisor DTE asociada al Evento.",
      );
    }
    const nit = normalizeNitForDte(issuerConfig.nit) ?? issuerConfig.nit;
    const environment = issuerConfig.environment as "TEST" | "PRODUCTION";

    // Contar intentos previos para attempt_number en el log
    const previousAttempts = await prisma.dteTransmissionLog.count({
      where: { dte_document_id: refItem.dte_document_id, operation_type: "CONTINGENCY_TRANSMIT" },
    });
    const attemptNumber = previousAttempts + 1;

    // 3. Marcar estado optimista antes de llamar a MH
    await prisma.dteContingencyEvent.update({
      where: { id: contingencyEventId },
      data:  { status: "SENT", sent_at: new Date() },
    });

    // 4. Transmitir a MH
    const adapter = new MhContingencyTransmissionAdapter();
    const result  = await adapter.transmit({ environment, nit, signedJws: event.signed_jws });

    const contingenciaUrl = environment === "PRODUCTION"
      ? (process.env["DTE_MH_CONTINGENCIA_URL_PROD"] ?? "https://api.dtes.mh.gob.sv/fesv/contingencia")
      : (process.env["DTE_MH_CONTINGENCIA_URL_TEST"] ?? "https://apitest.dtes.mh.gob.sv/fesv/contingencia");

    // ── Caso: error técnico ───────────────────────────────────────
    if (!result.ok) {
      await prisma.$transaction([
        prisma.dteContingencyEvent.update({
          where: { id: contingencyEventId },
          data:  { status: "SIGNED", sent_at: null },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: refItem.dte_document_id,
            attempt_number:  attemptNumber,
            operation_type:  "CONTINGENCY_TRANSMIT",
            request_url:     contingenciaUrl,
            http_status:     result.httpStatus ?? null,
            error_message:   result.message,
            response_body: {
              errorCode:   result.errorCode,
              message:     result.message,
              httpStatus:  result.httpStatus ?? null,
              rawResponse: result.rawResponse ?? null,
            },
          },
        }),
      ]);

      return { ok: false, error: result.message };
    }

    // ── Respuesta fiscal recibida ─────────────────────────────────

    const sanitizedResponse = {
      mhEstado:      result.mhEstado,
      mensaje:       result.mensaje       ?? null,
      selloRecibido: result.selloRecibido ?? null,
      observaciones: result.observaciones ?? null,
      httpStatus:    result.httpStatus,
    };

    const rejected = isRejectedEstado(result.mhEstado);
    const now = new Date();

    await prisma.$transaction([
      prisma.dteContingencyEvent.update({
        where: { id: contingencyEventId },
        data: rejected
          ? {
              status:             "REJECTED",
              mh_estado:          result.mhEstado,
              mh_descripcion_msg: result.mensaje ?? null,
              mh_observaciones:   result.observaciones != null
                ? (result.observaciones as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              rejected_at: now,
            }
          : {
              status:             "ACCEPTED",
              mh_estado:          result.mhEstado,
              mh_sello_recibido:  result.selloRecibido ?? null,
              mh_descripcion_msg: result.mensaje ?? null,
              mh_observaciones:   result.observaciones != null
                ? (result.observaciones as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              accepted_at: now,
            },
      }),
      prisma.dteTransmissionLog.create({
        data: {
          dte_document_id: refItem.dte_document_id,
          attempt_number:  attemptNumber,
          operation_type:  "CONTINGENCY_TRANSMIT",
          request_url:     contingenciaUrl,
          http_status:     result.httpStatus,
          response_body:   sanitizedResponse as Prisma.InputJsonValue,
          error_message:   rejected ? (result.mensaje ?? "RECHAZADO") : null,
        },
      }),
    ]);

    return {
      ok:            true,
      eventStatus:   rejected ? "REJECTED" : "ACCEPTED",
      mhEstado:      result.mhEstado,
      mensaje:       result.mensaje       ?? null,
      selloRecibido: result.selloRecibido ?? null,
      observaciones: result.observaciones ?? null,
    };

  } catch (error) {
    if (error instanceof TransmitContingencyBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
