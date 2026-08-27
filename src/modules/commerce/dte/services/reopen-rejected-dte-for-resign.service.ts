// ─────────────────────────────────────────────────────────────────
// commerce/dte — reopen-rejected-dte-for-resign.service.ts
//
// Reabre un DteOutgoingDocument REJECTED para re-firma, SIN crear un
// documento nuevo, SIN reservar otro correlativo y SIN cambiar
// numeroControl/codigoGeneracion/sale_id/json_document.
//
// Alcance deliberadamente estrecho: solo aplica a rechazos de MH por
// firma inválida (codigoMsg CAT "802"), confirmado leyendo el último
// DteTransmissionLog operation_type="SEND" — nunca solo el texto libre
// `rejection_reason`. Cualquier otro motivo de rechazo (datos fiscales,
// numeroControl duplicado, etc.) NO es reintentable por esta vía: ese
// tipo de rechazo requiere revisión manual/nuevo documento, no una
// re-firma técnica.
//
// Transición: REJECTED → SCHEMA_VALIDATED (limpia signed_jws/signed_at/
// sent_at/rejected_at/rejection_reason). El documento queda exactamente
// en el estado que `signDteDocument` (sign-dte-document.service.ts, sin
// modificar) ya sabe firmar — no se duplica lógica de firma aquí.
//
// Trazabilidad: el log del rechazo original (SEND, codigoMsg 802) NUNCA
// se borra ni se sobreescribe. Esta operación agrega un nuevo
// DteTransmissionLog operation_type="RETRY_PREPARE" documentando la
// reapertura, quién y cuándo.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

// Códigos MH (CAT de errores de recepción) considerados reintentables
// por re-firma técnica. Deliberadamente restringido — no ampliar sin
// revisar caso por caso.
const RESIGNABLE_MH_CODES = new Set(["802"]);

export interface ReopenRejectedDteForResignParams {
  dteDocumentId: string;
  tenantId:      string;
  locationId:    string;
  userId:        string;
}

export type ReopenRejectedDteForResignResult =
  | { ok: true }
  | { ok: false; error: string };

class ReopenRejectedDteBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReopenRejectedDteBusinessError";
  }
}

export async function reopenRejectedDteForResign(
  params: ReopenRejectedDteForResignParams,
): Promise<ReopenRejectedDteForResignResult> {
  const { dteDocumentId, tenantId, locationId, userId } = params;

  try {
    await prisma.$transaction(async (tx) => {
      const dteDoc = await tx.dteOutgoingDocument.findFirst({
        where: { id: dteDocumentId, tenant_id: tenantId, location_id: locationId },
        select: {
          id:              true,
          dte_status:      true,
          reception_stamp: true,
          json_document:   true,
          control_number:  true,
          generation_code: true,
        },
      });

      if (!dteDoc) {
        throw new ReopenRejectedDteBusinessError(
          "El documento DTE no existe o no pertenece a la location activa.",
        );
      }
      if (dteDoc.dte_status !== "REJECTED") {
        throw new ReopenRejectedDteBusinessError(
          `Solo se puede reabrir un documento en estado REJECTED. Estado actual: ${dteDoc.dte_status}.`,
        );
      }
      if (dteDoc.reception_stamp) {
        throw new ReopenRejectedDteBusinessError(
          "El documento tiene sello de recepción MH — no corresponde a un rechazo técnico de firma.",
        );
      }
      if (!dteDoc.json_document) {
        throw new ReopenRejectedDteBusinessError(
          "El documento no tiene JSON generado. No se puede reabrir para re-firma.",
        );
      }

      // Confirmar el motivo real del rechazo desde el log de transmisión,
      // no desde el texto libre `rejection_reason`.
      const lastSendLog = await tx.dteTransmissionLog.findFirst({
        where:   { dte_document_id: dteDocumentId, operation_type: "SEND" },
        orderBy: { created_at: "desc" },
        select:  { response_body: true },
      });

      const codigoMsg = (lastSendLog?.response_body as { codigoMsg?: unknown } | null)?.codigoMsg;
      if (typeof codigoMsg !== "string" || !RESIGNABLE_MH_CODES.has(codigoMsg)) {
        throw new ReopenRejectedDteBusinessError(
          `Este rechazo no es reintentable automáticamente por firma inválida (codigoMsg registrado: ${
            typeof codigoMsg === "string" ? codigoMsg : "desconocido"
          }). Requiere revisión manual.`,
        );
      }

      await tx.dteOutgoingDocument.update({
        where: { id: dteDocumentId },
        data: {
          dte_status:       "SCHEMA_VALIDATED",
          signed_jws:       null,
          signed_at:        null,
          sent_at:          null,
          rejected_at:      null,
          rejection_reason: null,
          updated_by:       userId,
        },
      });

      await tx.dteTransmissionLog.create({
        data: {
          dte_document_id: dteDocumentId,
          // 0 — marcador informativo: esta entrada documenta una reapertura
          // administrativa, no un intento de comunicación con MH/firmador.
          attempt_number:  0,
          operation_type:  "RETRY_PREPARE",
          error_message:   null,
          response_body: {
            note: "Documento reabierto para re-firma tras rechazo MH 802 (firma no válida). " +
                  "Mismo sale_id/control_number/codigoGeneracion — sin nuevo correlativo ni documento.",
            previous_control_number:  dteDoc.control_number,
            previous_generation_code: dteDoc.generation_code,
          },
        },
      });
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof ReopenRejectedDteBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
