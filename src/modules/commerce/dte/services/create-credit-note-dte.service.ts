// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-credit-note-dte.service.ts
//
// createCreditNoteDteFromAcceptedCcfe — crea un DteOutgoingDocument
// tipo "05" (Nota de Crédito) en estado PENDING_GENERATION y registra
// la relación documental CREDIT_NOTE_OF hacia el CCFE 03 original.
//
// Reglas críticas:
//   - Solo puede partir de un DTE tipo "03" en estado "ACCEPTED".
//   - Bloquea duplicado: no permite una segunda NC activa sobre el mismo
//     CCFE (se verifica por DteDocumentRelation existente con NC activa).
//   - NO genera el JSON DTE.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO toca inventario ni caja (V2).
//   - NO toca Sale.status.
//   - NO toca Prisma schema.
//   - El correlativo tipo "05" se reserva de forma atómica dentro
//     de la misma transacción Prisma (rollback si algo falla).
// ─────────────────────────────────────────────────────────────────

import { randomUUID }        from "crypto";
import { Prisma }            from "@prisma/client";
import { prisma }            from "@/lib/db/prisma";
import { buildControlNumber } from "../utils/dte-control-number";

export interface CreateCreditNoteDteInput {
  sourceDteDocumentId: string;
  reasonCode?:         string;
  reasonText:          string;
  userId:              string;
  tenantId:            string;
  locationId:          string;
}

export type CreateCreditNoteDteResult =
  | {
      ok:             true;
      creditNoteDteId: string;
      controlNumber:   string;
      generationCode:  string;
      dteStatus:       "PENDING_GENERATION";
    }
  | { ok: false; message: string };

class CreditNoteBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditNoteBusinessError";
  }
}

export async function createCreditNoteDteFromAcceptedCcfe(
  input: CreateCreditNoteDteInput,
): Promise<CreateCreditNoteDteResult> {
  const { sourceDteDocumentId, reasonCode, reasonText, userId, tenantId, locationId } = input;

  try {
    const result = await prisma.$transaction(async (tx) => {

      // ── 1. Cargar DTE original con scope tenant/location ─────────
      const original = await tx.dteOutgoingDocument.findFirst({
        where:  { id: sourceDteDocumentId, tenant_id: tenantId, location_id: locationId },
        select: {
          id:               true,
          tenant_id:        true,
          location_id:      true,
          sale_id:          true,
          issuer_config_id: true,
          dte_type_code:    true,
          dte_status:       true,
          environment:      true,
          generation_code:  true,
          control_number:   true,
          reception_stamp:  true,
          json_document:    true,
        },
      });

      if (!original) {
        throw new CreditNoteBusinessError(
          "El documento DTE original no existe o no pertenece a la location activa.",
        );
      }

      // ── 2. Validar elegibilidad del DTE original ─────────────────
      if (original.dte_type_code !== "03") {
        throw new CreditNoteBusinessError(
          `La Nota de Crédito 05 solo puede emitirse sobre un CCFE tipo "03". ` +
          `El documento seleccionado es tipo "${original.dte_type_code}".`,
        );
      }

      if (original.dte_status !== "ACCEPTED") {
        throw new CreditNoteBusinessError(
          `El CCFE original debe estar en estado ACCEPTED para emitir una Nota de Crédito. ` +
          `Estado actual: "${original.dte_status}".`,
        );
      }

      if (!original.generation_code) {
        throw new CreditNoteBusinessError(
          "El CCFE original no tiene codigoGeneracion registrado. No se puede emitir NC.",
        );
      }

      if (!original.control_number) {
        throw new CreditNoteBusinessError(
          "El CCFE original no tiene numeroControl registrado. No se puede emitir NC.",
        );
      }

      if (!original.reception_stamp) {
        throw new CreditNoteBusinessError(
          "El CCFE original no tiene sello de recepción MH. No se puede emitir NC sin sello.",
        );
      }

      if (!original.json_document) {
        throw new CreditNoteBusinessError(
          "El CCFE original no tiene json_document registrado. No se puede emitir NC.",
        );
      }

      // ── 3. Bloquear duplicado: no permitir NC activa sobre el mismo CCFE ──
      const existingNcRelation = await tx.dteDocumentRelation.findFirst({
        where: {
          related_dte_document_id: sourceDteDocumentId,
          relation_type:           "CREDIT_NOTE_OF",
          source_document: {
            dte_status: { notIn: ["INVALIDATED"] },
          },
        },
        select: {
          id:              true,
          source_document: { select: { id: true, dte_status: true, control_number: true } },
        },
      });

      if (existingNcRelation) {
        const ncStatus = existingNcRelation.source_document.dte_status;
        const ncCn     = existingNcRelation.source_document.control_number ?? "(sin número)";
        throw new CreditNoteBusinessError(
          `Ya existe una Nota de Crédito activa (${ncCn}, estado: ${ncStatus}) ` +
          `para este CCFE. No se puede crear una segunda NC en V1.`,
        );
      }

      // ── 4. Cargar configuración del emisor ───────────────────────
      if (!original.issuer_config_id) {
        throw new CreditNoteBusinessError(
          "El CCFE original no tiene configuración de emisor DTE. No se puede emitir NC.",
        );
      }

      const issuerConfig = await tx.dteIssuerConfig.findFirst({
        where: {
          id:          original.issuer_config_id,
          tenant_id:   tenantId,
          location_id: locationId,
          is_active:   true,
        },
        select: {
          id:                 true,
          cod_estable_mh:     true,
          cod_punto_venta_mh: true,
        },
      });

      if (!issuerConfig) {
        throw new CreditNoteBusinessError(
          "La configuración DTE del emisor no existe, está inactiva o no corresponde a esta location.",
        );
      }

      if (!issuerConfig.cod_estable_mh || !issuerConfig.cod_punto_venta_mh) {
        throw new CreditNoteBusinessError(
          "Faltan códigos MH de establecimiento y punto de venta. " +
          "Configure cod_estable_mh y cod_punto_venta_mh en el emisor DTE.",
        );
      }

      // ── 5. Reservar correlativo tipo "05" de forma atómica ───────
      const year = new Date().getFullYear();

      let correlative: { last_sequence: number };
      try {
        correlative = await tx.dteCorrelative.update({
          where: {
            tenant_id_location_id_environment_dte_type_code_year: {
              tenant_id:     tenantId,
              location_id:   locationId,
              environment:   original.environment,
              dte_type_code: "05",
              year,
            },
          },
          data:   { last_sequence: { increment: 1 } },
          select: { last_sequence: true },
        });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2025") {
          throw new CreditNoteBusinessError(
            `No existe correlativo DTE activo para tipo "05" en el año ${year}. ` +
            `Configure el correlativo antes de generar la Nota de Crédito.`,
          );
        }
        throw err;
      }

      // ── 6. Generar codigoGeneracion y construir numeroControl ─────
      const generation_code = randomUUID().toUpperCase();
      const control_number  = buildControlNumber({
        dte_type_code:      "05",
        cod_estable_mh:     issuerConfig.cod_estable_mh,
        cod_punto_venta_mh: issuerConfig.cod_punto_venta_mh,
        sequence:           correlative.last_sequence,
      });

      // ── 7. Extraer monto total del CCFE para la relación documental ──
      // El json_document del CCFE contiene resumen.totalPagar con el total
      // del comprobante. Se extrae de forma defensiva; si falla, queda null.
      let relationAmount: Prisma.Decimal | null = null;
      try {
        const doc      = original.json_document as Record<string, unknown>;
        const resumen  = doc?.resumen as Record<string, unknown> | undefined;
        const rawTotal = resumen?.totalPagar;
        if (typeof rawTotal === "number" && rawTotal > 0) {
          relationAmount = new Prisma.Decimal(rawTotal);
        }
      } catch {
        // No es crítico — el monto queda null y se completa en generate-nc-json
      }

      // ── 8. Crear DteOutgoingDocument tipo "05" ────────────────────
      const ncDoc = await tx.dteOutgoingDocument.create({
        data: {
          tenant_id:        tenantId,
          location_id:      locationId,
          sale_id:          original.sale_id,   // trazabilidad con la venta origen
          issuer_config_id: original.issuer_config_id,
          dte_type_code:    "05",
          environment:      original.environment,
          generation_code,
          control_number,
          dte_status:       "PENDING_GENERATION",
          retry_count:      0,
          created_by:       userId,
          updated_by:       userId,
        },
        select: { id: true, control_number: true, generation_code: true, dte_status: true },
      });

      // ── 9. Crear DteDocumentRelation ─────────────────────────────
      await tx.dteDocumentRelation.create({
        data: {
          tenant_id:               tenantId,
          location_id:             locationId,
          source_dte_document_id:  ncDoc.id,
          related_dte_document_id: sourceDteDocumentId,
          relation_type:           "CREDIT_NOTE_OF",
          reason_code:             reasonCode  ?? null,
          reason_text:             reasonText,
          amount:                  relationAmount,
          created_by:              userId,
        },
      });

      return ncDoc;
    });

    return {
      ok:              true,
      creditNoteDteId: result.id,
      controlNumber:   result.control_number!,
      generationCode:  result.generation_code!,
      dteStatus:       "PENDING_GENERATION",
    };

  } catch (error) {
    if (error instanceof CreditNoteBusinessError) {
      return { ok: false, message: error.message };
    }

    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return {
        ok:      false,
        message: "Error de concurrencia al reservar la identidad fiscal del NC. Intente nuevamente.",
      };
    }

    throw error;
  }
}
