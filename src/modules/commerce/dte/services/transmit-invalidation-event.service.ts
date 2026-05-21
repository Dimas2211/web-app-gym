// commerce/dte — transmit-invalidation-event.service.ts
//
// Transmite un DteInvalidationEvent en estado SIGNED al MH.
// Endpoint: POST /fesv/anulardte
//
// Flujo: SIGNED → [SENT/INVALIDATION_PENDING] → ACCEPTED | REJECTED
//
// Reglas:
//   - Solo opera sobre DteInvalidationEvent.status === "SIGNED".
//   - DTE original debe estar en ACCEPTED con reception_stamp presente.
//   - Error técnico: mantiene SIGNED y ACCEPTED. Registra log.
//   - PROCESADO: marca evento ACCEPTED, DTE original INVALIDATED.
//   - RECHAZADO: marca evento REJECTED, revierte DTE a ACCEPTED.
//   - Registra DteTransmissionLog en todos los casos.
//   - No expone signed_jws ni token.

import { prisma }                             from "@/lib/db/prisma";
import { Prisma }                             from "@prisma/client";
import { getDteMhConfig }                      from "../config/dte-mh.config";
import { MhInvalidationTransmissionAdapter }  from "../adapters/dte-invalidation-transmission.adapter";

// ── Tipos públicos ────────────────────────────────────────────────

export interface TransmitInvalidationEventParams {
  invalidationEventId: string;
  /** ID del usuario que ejecuta la operación. null cuando se llama desde scripts o procesos sin sesión. */
  userId:              string | null;
  tenantId:            string;
  locationId:          string;
}

export type TransmitInvalidationEventResult =
  | {
      ok:             true;
      eventStatus:    "ACCEPTED" | "REJECTED";
      mhEstado:       string;
      descripcionMsg: string | null;
      selloRecibido:  string | null;
      codigoMsg:      string | null;
      observaciones:  unknown[] | null;
    }
  | { ok: false; error: string };

// ── Error de negocio ──────────────────────────────────────────────

class TransmitInvalidationBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransmitInvalidationBusinessError";
  }
}

// ── Helper URL ────────────────────────────────────────────────────

function buildAnularUrl(environment: string): string {
  if (environment === "PRODUCTION") {
    return process.env["DTE_MH_ANULAR_URL_PROD"] ?? "https://api.dtes.mh.gob.sv/fesv/anulardte";
  }
  return process.env["DTE_MH_ANULAR_URL_TEST"] ?? "https://apitest.dtes.mh.gob.sv/fesv/anulardte";
}

// ── Función principal ─────────────────────────────────────────────

export async function transmitInvalidationEvent(
  params: TransmitInvalidationEventParams,
): Promise<TransmitInvalidationEventResult> {
  const { invalidationEventId, userId, tenantId, locationId } = params;

  try {
    // 1. Cargar evento con scope tenant/location
    const event = await prisma.dteInvalidationEvent.findFirst({
      where: {
        id:          invalidationEventId,
        tenant_id:   tenantId,
        location_id: locationId,
      },
      select: {
        id:             true,
        status:         true,
        signed_jws:     true,
        event_json:     true,
        dte_document_id: true,
      },
    });

    if (!event) {
      throw new TransmitInvalidationBusinessError(
        "El evento de invalidación no existe o no pertenece a la location activa.",
      );
    }

    // 2. Validar estado del evento
    if (event.status !== "SIGNED") {
      throw new TransmitInvalidationBusinessError(
        `Solo se pueden transmitir eventos firmados. Estado actual: ${event.status}.`,
      );
    }

    if (!event.signed_jws) {
      throw new TransmitInvalidationBusinessError("El evento no tiene JWS firmado.");
    }

    if (!event.event_json) {
      throw new TransmitInvalidationBusinessError("El evento no tiene event_json.");
    }

    // 3. Cargar DTE original
    const dteDoc = await prisma.dteOutgoingDocument.findFirst({
      where: {
        id:          event.dte_document_id,
        tenant_id:   tenantId,
        location_id: locationId,
      },
      select: {
        id:              true,
        dte_status:      true,
        reception_stamp: true,
        invalidated_at:  true,
        environment:     true,
      },
    });

    if (!dteDoc) {
      throw new TransmitInvalidationBusinessError(
        "El documento DTE original no existe o no pertenece a la location activa.",
      );
    }

    // 4. Validar estado del DTE original
    if (dteDoc.dte_status !== "ACCEPTED") {
      throw new TransmitInvalidationBusinessError(
        `El DTE original debe estar en ACCEPTED. Estado actual: ${dteDoc.dte_status}.`,
      );
    }

    if (dteDoc.invalidated_at !== null) {
      throw new TransmitInvalidationBusinessError(
        "El DTE original ya fue invalidado previamente.",
      );
    }

    if (!dteDoc.reception_stamp) {
      throw new TransmitInvalidationBusinessError(
        "El DTE original no tiene sello de recibido MH (reception_stamp). No se puede invalidar.",
      );
    }

    // 5. Determinar ambiente y URL para el log
    const environment  = dteDoc.environment as "TEST" | "PRODUCTION";
    const anularUrl    = buildAnularUrl(environment);
    const config       = getDteMhConfig();
    void config;

    // Contar intentos previos para attempt_number en el log
    const previousAttempts = await prisma.dteTransmissionLog.count({
      where: {
        dte_document_id: event.dte_document_id,
        operation_type:  "INVALIDATE",
      },
    });
    const attemptNumber = previousAttempts + 1;

    const now = new Date();

    // 6. Marcar estados optimistas antes de llamar a MH
    await prisma.$transaction([
      prisma.dteInvalidationEvent.update({
        where: { id: invalidationEventId },
        data:  { status: "SENT", sent_at: now },
      }),
      prisma.dteOutgoingDocument.update({
        where: { id: event.dte_document_id },
        data:  { dte_status: "INVALIDATION_PENDING", updated_by: userId ?? undefined },
      }),
    ]);

    // 7. Transmitir a MH
    const adapter = new MhInvalidationTransmissionAdapter();
    const result  = await adapter.transmit({
      environment,
      signedJws: event.signed_jws,
      version:   2,
    });

    // ── Caso: error técnico ───────────────────────────────────────
    if (!result.ok) {
      // Revertir estados optimistas
      await prisma.$transaction([
        prisma.dteInvalidationEvent.update({
          where: { id: invalidationEventId },
          data:  {
            status:     "SIGNED",
            sent_at:    null,
            last_error: result.message,
          },
        }),
        prisma.dteOutgoingDocument.update({
          where: { id: event.dte_document_id },
          data:  { dte_status: "ACCEPTED", updated_by: userId ?? undefined },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: event.dte_document_id,
            attempt_number:  attemptNumber,
            operation_type:  "INVALIDATE",
            request_url:     anularUrl,
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
      mhEstado:       result.mhEstado,
      codigoMsg:      result.codigoMsg      ?? null,
      descripcionMsg: result.descripcionMsg ?? null,
      httpStatus:     result.httpStatus,
      idEnvio:        result.idEnvio,
    };

    // ── PROCESADO ─────────────────────────────────────────────────
    if (result.mhEstado === "PROCESADO") {
      const acceptedAt = new Date();

      await prisma.$transaction([
        prisma.dteInvalidationEvent.update({
          where: { id: invalidationEventId },
          data:  {
            status:             "ACCEPTED",
            mh_estado:          result.mhEstado,
            mh_sello_recibido:  result.selloRecibido  ?? null,
            mh_codigo_msg:      result.codigoMsg      ?? null,
            mh_descripcion_msg: result.descripcionMsg ?? null,
            mh_observaciones:   result.observaciones != null
              ? (result.observaciones as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            sent_at:            now,
            accepted_at:        acceptedAt,
            last_error:         null,
          },
        }),
        prisma.dteOutgoingDocument.update({
          where: { id: event.dte_document_id },
          data:  {
            dte_status:     "INVALIDATED",
            invalidated_at: acceptedAt,
            updated_by:     userId ?? undefined,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: event.dte_document_id,
            attempt_number:  attemptNumber,
            operation_type:  "INVALIDATE",
            request_url:     anularUrl,
            http_status:     result.httpStatus,
            response_body:   sanitizedResponse,
            error_message:   null,
          },
        }),
      ]);

      return {
        ok:             true,
        eventStatus:    "ACCEPTED",
        mhEstado:       result.mhEstado,
        descripcionMsg: result.descripcionMsg ?? null,
        selloRecibido:  result.selloRecibido  ?? null,
        codigoMsg:      result.codigoMsg      ?? null,
        observaciones:  result.observaciones  ?? null,
      };
    }

    // ── RECHAZADO ─────────────────────────────────────────────────
    if (result.mhEstado === "RECHAZADO") {
      const rejectedAt = new Date();

      await prisma.$transaction([
        prisma.dteInvalidationEvent.update({
          where: { id: invalidationEventId },
          data:  {
            status:             "REJECTED",
            mh_estado:          result.mhEstado,
            mh_codigo_msg:      result.codigoMsg      ?? null,
            mh_descripcion_msg: result.descripcionMsg ?? null,
            mh_observaciones:   result.observaciones != null
              ? (result.observaciones as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            rejected_at:        rejectedAt,
            last_error:         result.descripcionMsg ?? "MH rechazó el evento.",
          },
        }),
        // Revertir DTE original a ACCEPTED
        prisma.dteOutgoingDocument.update({
          where: { id: event.dte_document_id },
          data:  {
            dte_status:     "ACCEPTED",
            invalidated_at: null,
            updated_by:     userId ?? undefined,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: event.dte_document_id,
            attempt_number:  attemptNumber,
            operation_type:  "INVALIDATE",
            request_url:     anularUrl,
            http_status:     result.httpStatus,
            error_message:   result.descripcionMsg ?? "RECHAZADO",
            response_body:   sanitizedResponse,
          },
        }),
      ]);

      return {
        ok:             true,
        eventStatus:    "REJECTED",
        mhEstado:       result.mhEstado,
        descripcionMsg: result.descripcionMsg ?? null,
        selloRecibido:  null,
        codigoMsg:      result.codigoMsg      ?? null,
        observaciones:  result.observaciones  ?? null,
      };
    }

    // ── Estado MH inesperado: revertir y registrar ────────────────
    await prisma.$transaction([
      prisma.dteInvalidationEvent.update({
        where: { id: invalidationEventId },
        data:  {
          status:     "SIGNED",
          sent_at:    null,
          last_error: `Estado MH inesperado: ${result.mhEstado}`,
        },
      }),
      prisma.dteOutgoingDocument.update({
        where: { id: event.dte_document_id },
        data:  { dte_status: "ACCEPTED", updated_by: userId ?? undefined },
      }),
      prisma.dteTransmissionLog.create({
        data: {
          dte_document_id: event.dte_document_id,
          attempt_number:  attemptNumber,
          operation_type:  "INVALIDATE",
          request_url:     anularUrl,
          http_status:     result.httpStatus,
          error_message:   `Estado MH inesperado: ${result.mhEstado}`,
          response_body:   sanitizedResponse,
        },
      }),
    ]);

    return {
      ok:    false,
      error: `MH respondió con estado inesperado (${result.mhEstado}). El evento se mantiene en SIGNED para reintento.`,
    };

  } catch (error) {
    if (error instanceof TransmitInvalidationBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
