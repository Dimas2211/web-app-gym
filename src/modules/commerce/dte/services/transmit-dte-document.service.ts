// ─────────────────────────────────────────────────────────────────
// commerce/dte — transmit-dte-document.service.ts
//
// Transmite un DteOutgoingDocument en estado SIGNED al MH.
//
// Flujo: SIGNED → adapter.transmit() → ACCEPTED | OBSERVED | REJECTED
//
// Reglas:
//   - Solo opera sobre dte_status === "SIGNED".
//   - Nunca pasa a ACCEPTED si no hay mhEstado === "PROCESADO" explícito.
//   - Error técnico: mantiene SIGNED, incrementa retry_count, registra log.
//   - Estado inesperado de MH: mantiene SIGNED, registra log, devuelve error.
//   - Registra DteTransmissionLog en todos los casos.
//   - No expone signed_jws ni token.
// ─────────────────────────────────────────────────────────────────

import { prisma }                    from "@/lib/db/prisma";
import { Prisma }                    from "@prisma/client";
import { getDteMhConfig }             from "../config/dte-mh.config";
import { MhDteTransmissionAdapter }  from "../adapters/dte-transmission.adapter";
import type {
  DteTransmissionSuccessResult,
} from "../types/dte-transmission.types";

// ── Tipos públicos ────────────────────────────────────────────────

export interface TransmitDteDocumentParams {
  dteDocumentId: string;
  userId:        string;
  tenantId:      string;
  locationId:    string;
}

export type TransmitDteDocumentResult =
  | {
      ok:            true;
      dteStatus:     "ACCEPTED" | "OBSERVED" | "REJECTED";
      mhEstado:      string;
      descripcionMsg: string | null;
      selloRecibido: string | null;
    }
  | { ok: false; error: string };

// ── Error de negocio interno ──────────────────────────────────────

class TransmitDteBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransmitDteBusinessError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────

const SUPPORTED_TYPE_CODES = new Set(["01", "03"]);

function dteTypeCodeToVersion(code: string): number {
  return code === "03" ? 3 : 1;
}

/**
 * Determina el estado Prisma final a partir de la respuesta normalizada del adapter.
 * Devuelve null si mhEstado es inesperado (no PROCESADO ni RECHAZADO).
 */
function determineFinalStatus(
  result: DteTransmissionSuccessResult,
): "ACCEPTED" | "OBSERVED" | "REJECTED" | null {
  if (result.mhEstado === "RECHAZADO") return "REJECTED";

  if (result.mhEstado === "PROCESADO") {
    const hasObs = Array.isArray(result.observaciones) && result.observaciones.length > 0;
    const descObs = result.descripcionMsg?.toLowerCase().includes("observaci") ?? false;
    return hasObs || descObs ? "OBSERVED" : "ACCEPTED";
  }

  return null;
}

function buildReceptionUrl(environment: string): string {
  const config = getDteMhConfig();
  if (environment === "PRODUCTION") {
    return process.env["DTE_MH_RECEPTION_URL_PROD"] ?? config.receptionUrl;
  }
  return process.env["DTE_MH_RECEPTION_URL_TEST"] ?? config.receptionUrl;
}

// ── Función principal ─────────────────────────────────────────────

export async function transmitDteDocument(
  params: TransmitDteDocumentParams,
): Promise<TransmitDteDocumentResult> {
  const { dteDocumentId, userId, tenantId, locationId } = params;

  try {
    // 1. Cargar documento con scope tenant/location
    const dteDoc = await prisma.dteOutgoingDocument.findFirst({
      where:  { id: dteDocumentId, tenant_id: tenantId, location_id: locationId },
      select: {
        id:              true,
        dte_status:      true,
        signed_jws:      true,
        generation_code: true,
        control_number:  true,
        dte_type_code:   true,
        environment:     true,
        retry_count:     true,
      },
    });

    if (!dteDoc) {
      throw new TransmitDteBusinessError(
        "El documento DTE no existe o no pertenece a la location activa.",
      );
    }

    // 2. Estado debe ser exactamente SIGNED
    if (dteDoc.dte_status !== "SIGNED") {
      throw new TransmitDteBusinessError(
        `Solo se pueden transmitir documentos firmados. Estado actual: ${dteDoc.dte_status}.`,
      );
    }

    // 3. Campos requeridos
    if (!dteDoc.signed_jws) {
      throw new TransmitDteBusinessError("El documento no tiene JWS firmado.");
    }
    if (!dteDoc.generation_code) {
      throw new TransmitDteBusinessError("El documento no tiene código de generación.");
    }
    if (!dteDoc.control_number) {
      throw new TransmitDteBusinessError("El documento no tiene número de control.");
    }
    if (!SUPPORTED_TYPE_CODES.has(dteDoc.dte_type_code)) {
      throw new TransmitDteBusinessError(
        `Tipo DTE no soportado para transmisión: ${dteDoc.dte_type_code}.`,
      );
    }

    // 4. Parámetros de transmisión
    const environment   = dteDoc.environment as "TEST" | "PRODUCTION";
    const dteTypeCode   = dteDoc.dte_type_code as "01" | "03";
    const version       = dteTypeCodeToVersion(dteTypeCode);
    const receptionUrl  = buildReceptionUrl(environment);
    const attemptNumber = dteDoc.retry_count + 1;

    // 5. Llamar al adapter de transmisión
    const adapter = new MhDteTransmissionAdapter();
    const result  = await adapter.transmit({
      environment,
      dteTypeCode,
      version,
      codigoGeneracion: dteDoc.generation_code,
      signedJws:        dteDoc.signed_jws,
    });

    const now = new Date();

    // ── Caso: error técnico ───────────────────────────────────────
    if (!result.ok) {
      await prisma.$transaction([
        prisma.dteOutgoingDocument.update({
          where: { id: dteDocumentId },
          data:  {
            retry_count: { increment: 1 },
            updated_by:  userId,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: dteDocumentId,
            attempt_number:  attemptNumber,
            operation_type:  "SEND",
            request_url:     receptionUrl,
            http_status:     result.httpStatus ?? null,
            error_message:   result.message,
            response_body:   {
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

    // ── Caso: respuesta fiscal ────────────────────────────────────
    const finalStatus = determineFinalStatus(result);

    // Sanitized payload para mh_response (sin signed_jws ni token)
    const mhResponseSanitized = {
      mhEstado:        result.mhEstado,
      codigoMsg:       result.codigoMsg       ?? null,
      descripcionMsg:  result.descripcionMsg  ?? null,
      fhProcesamiento: result.fhProcesamiento ?? null,
      httpStatus:      result.httpStatus,
      idEnvio:         result.idEnvio,
    };

    // Estado MH inesperado: mantener SIGNED
    if (!finalStatus) {
      await prisma.$transaction([
        prisma.dteOutgoingDocument.update({
          where: { id: dteDocumentId },
          data:  {
            mh_response: mhResponseSanitized,
            retry_count: { increment: 1 },
            updated_by:  userId,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: dteDocumentId,
            attempt_number:  attemptNumber,
            operation_type:  "SEND",
            request_url:     receptionUrl,
            http_status:     result.httpStatus,
            error_message:   `Estado MH inesperado: ${result.mhEstado}`,
            response_body:   mhResponseSanitized,
          },
        }),
      ]);

      return {
        ok:    false,
        error: `MH respondió con estado inesperado (${result.mhEstado}). El documento se mantiene en SIGNED para reintento.`,
      };
    }

    // ── Actualizar estado Prisma según resultado fiscal ────────────

    if (finalStatus === "ACCEPTED") {
      await prisma.$transaction([
        prisma.dteOutgoingDocument.update({
          where: { id: dteDocumentId },
          data:  {
            dte_status:      "ACCEPTED",
            mh_response:     mhResponseSanitized,
            reception_stamp: result.selloRecibido ?? null,
            sent_at:         now,
            accepted_at:     now,
            updated_by:      userId,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: dteDocumentId,
            attempt_number:  attemptNumber,
            operation_type:  "SEND",
            request_url:     receptionUrl,
            http_status:     result.httpStatus,
            response_body:   mhResponseSanitized,
          },
        }),
      ]);
    }

    if (finalStatus === "OBSERVED") {
      const observationsJson: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
        result.observaciones != null
          ? (result.observaciones as Prisma.InputJsonValue)
          : Prisma.JsonNull;

      const logBodyWithObs: Prisma.InputJsonValue = {
        mhEstado:        mhResponseSanitized.mhEstado,
        codigoMsg:       mhResponseSanitized.codigoMsg,
        descripcionMsg:  mhResponseSanitized.descripcionMsg,
        fhProcesamiento: mhResponseSanitized.fhProcesamiento,
        httpStatus:      mhResponseSanitized.httpStatus,
        idEnvio:         mhResponseSanitized.idEnvio,
        observaciones:   (result.observaciones ?? null) as Prisma.InputJsonValue,
      };

      await prisma.$transaction([
        prisma.dteOutgoingDocument.update({
          where: { id: dteDocumentId },
          data:  {
            dte_status:      "OBSERVED",
            mh_response:     mhResponseSanitized,
            reception_stamp: result.selloRecibido ?? null,
            observations:    observationsJson,
            sent_at:         now,
            observed_at:     now,
            updated_by:      userId,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: dteDocumentId,
            attempt_number:  attemptNumber,
            operation_type:  "SEND",
            request_url:     receptionUrl,
            http_status:     result.httpStatus,
            response_body:   logBodyWithObs,
          },
        }),
      ]);
    }

    if (finalStatus === "REJECTED") {
      await prisma.$transaction([
        prisma.dteOutgoingDocument.update({
          where: { id: dteDocumentId },
          data:  {
            dte_status:       "REJECTED",
            mh_response:      mhResponseSanitized,
            rejection_reason: result.descripcionMsg ?? null,
            sent_at:          now,
            rejected_at:      now,
            updated_by:       userId,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: dteDocumentId,
            attempt_number:  attemptNumber,
            operation_type:  "SEND",
            request_url:     receptionUrl,
            http_status:     result.httpStatus,
            error_message:   result.descripcionMsg ?? null,
            response_body:   mhResponseSanitized,
          },
        }),
      ]);
    }

    return {
      ok:            true,
      dteStatus:     finalStatus,
      mhEstado:      result.mhEstado,
      descripcionMsg: result.descripcionMsg ?? null,
      selloRecibido: result.selloRecibido   ?? null,
    };

  } catch (error) {
    if (error instanceof TransmitDteBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
