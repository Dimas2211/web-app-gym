// ─────────────────────────────────────────────────────────────────
// commerce/dte — reopen-signed-dte-for-resign.service.ts
//
// Reabre un DteOutgoingDocument SIGNED — NUNCA transmitido — para
// generar una nueva firma con el firmador actualmente en servicio.
// Caso de uso: la firma existente se generó con un firmador/
// certificado que después se corrigió (ej. reinicio de
// FIRMADOR-SERVICE tras reemplazar el .crt), y el documento todavía
// no se intentó enviar a MH, así que no hay ningún rechazo que
// reabrir por la vía de reopen-rejected-dte-for-resign.service.ts.
//
// Guardas estrictas — todas deben cumplirse:
//   - dte_status === "SIGNED"
//   - reception_stamp === null (nunca aceptado por MH)
//   - sent_at === null (nunca hubo NI SIQUIERA un intento de envío;
//     si ya se intentó y fue rechazado, ese caso usa
//     reopen-rejected-dte-for-resign.service.ts, no este)
//   - signed_jws existente (hay algo que sustituir)
//   - json_document existente
//
// NO crea documento nuevo. NO genera json_document nuevo. NO cambia
// control_number/generation_code/sale_id. NO transmite. NO reserva
// correlativo. Reutiliza el firmador real vía signDteDocument
// (sign-dte-document.service.ts, sin modificar) — no implementa un
// segundo sistema de firma.
//
// Trazabilidad: calcula y persiste el SHA256 del signed_jws anterior
// en un nuevo DteTransmissionLog ("RESIGN_PREPARE") ANTES de
// sustituirlo — nunca se pierde la evidencia de auditoría, a
// diferencia de la ronda anterior donde el hash previo no se capturó.
// No borra ni sobreescribe ningún log existente.
// ─────────────────────────────────────────────────────────────────

import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";

export interface ReopenSignedDteForResignParams {
  dteDocumentId: string;
  tenantId:      string;
  locationId:    string;
  userId:        string;
}

export type ReopenSignedDteForResignResult =
  | { ok: true; previousJwsSha256: string }
  | { ok: false; error: string };

class ReopenSignedDteBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReopenSignedDteBusinessError";
  }
}

export async function reopenSignedDteForResign(
  params: ReopenSignedDteForResignParams,
): Promise<ReopenSignedDteForResignResult> {
  const { dteDocumentId, tenantId, locationId, userId } = params;

  try {
    const previousJwsSha256 = await prisma.$transaction(async (tx) => {
      const dteDoc = await tx.dteOutgoingDocument.findFirst({
        where: { id: dteDocumentId, tenant_id: tenantId, location_id: locationId },
        select: {
          id:              true,
          dte_status:      true,
          reception_stamp: true,
          sent_at:         true,
          json_document:   true,
          signed_jws:      true,
          control_number:  true,
          generation_code: true,
        },
      });

      if (!dteDoc) {
        throw new ReopenSignedDteBusinessError(
          "El documento DTE no existe o no pertenece a la location activa.",
        );
      }
      if (dteDoc.dte_status !== "SIGNED") {
        throw new ReopenSignedDteBusinessError(
          `Solo se puede re-firmar un documento en estado SIGNED. Estado actual: ${dteDoc.dte_status}.`,
        );
      }
      if (dteDoc.reception_stamp) {
        throw new ReopenSignedDteBusinessError(
          "El documento ya tiene sello de recepción MH — no se puede re-firmar.",
        );
      }
      if (dteDoc.sent_at) {
        throw new ReopenSignedDteBusinessError(
          "El documento ya registra un intento de transmisión — si fue rechazado por firma inválida " +
          "(MH 802), use reopen-rejected-dte-for-resign en su lugar.",
        );
      }
      if (!dteDoc.signed_jws) {
        throw new ReopenSignedDteBusinessError(
          "El documento no tiene una firma actual que sustituir.",
        );
      }
      if (!dteDoc.json_document) {
        throw new ReopenSignedDteBusinessError(
          "El documento no tiene JSON generado.",
        );
      }

      const previousHash = createHash("sha256").update(dteDoc.signed_jws).digest("hex");

      await tx.dteOutgoingDocument.update({
        where: { id: dteDocumentId },
        data: {
          dte_status: "SCHEMA_VALIDATED",
          signed_jws: null,
          signed_at:  null,
          updated_by: userId,
        },
      });

      await tx.dteTransmissionLog.create({
        data: {
          dte_document_id: dteDocumentId,
          // 0 — marcador informativo: reapertura administrativa, no un
          // intento de comunicación con MH/firmador.
          attempt_number: 0,
          operation_type: "RESIGN_PREPARE",
          error_message:  null,
          response_body: {
            note: "Documento SIGNED (nunca transmitido) reabierto para re-firma tras reinicio de " +
                  "FIRMADOR-SERVICE con certificado reemplazado. Mismo sale_id/control_number/" +
                  "codigoGeneracion/json_document — sin nuevo correlativo ni documento.",
            previous_jws_sha256:      previousHash,
            previous_control_number:  dteDoc.control_number,
            previous_generation_code: dteDoc.generation_code,
          },
        },
      });

      return previousHash;
    });

    return { ok: true, previousJwsSha256: previousJwsSha256 };
  } catch (error) {
    if (error instanceof ReopenSignedDteBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
