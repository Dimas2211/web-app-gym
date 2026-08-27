// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-contingency-event.service.ts
//
// createContingencyEvent — crea un DteContingencyEvent en estado DRAFT
// junto con sus DteContingencyEventItem, de forma atómica.
//
// Reglas críticas:
//   - 1..1000 DTE, tipos "01"/"03" únicamente.
//   - Todos los DTE deben pertenecer al mismo tenant/location del evento.
//   - Todos deben tener transmission_type_code === "2".
//   - Todos deben tener contingency_type_code === contingencyTypeCode del evento.
//   - Ninguno puede estar ACCEPTED por MH.
//   - Ninguno puede tener generation_code null.
//   - No se aceptan IDs duplicados en el input.
//   - Ningún DTE puede pertenecer ya a otro evento de contingencia activo
//     (cualquier estado salvo REJECTED).
//   - El período (fInicio/hInicio → fFin/hFin) debe ser válido (inicio <= fin)
//     y cada DTE reportado debe haber sido emitido (fecEmi/horEmi fiscal del
//     propio json_document, NO created_at) dentro de ese período.
//   - no_item se asigna 1..N según el orden de dteDocumentIds recibido.
//   - Genera eventGenerationCode con crypto.randomUUID().toUpperCase() y lo
//     persiste en generation_code (idempotencia/trazabilidad del Evento).
//   - NO construye event_json aquí — eso ocurre en
//     buildAndPersistContingencyEventJson (paso separado, sección 9).
//   - NO firma. NO transmite. NO toca DteOutgoingDocument.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { prisma }     from "@/lib/db/prisma";
import type { ContingencyResponsable } from "../types/dte-contingency-event-json.types";

// ── Tipos públicos ────────────────────────────────────────────────

export interface CreateContingencyEventParams {
  dteDocumentIds:      string[];
  contingencyTypeCode: "1" | "2" | "3" | "4" | "5";
  reason?:             string | null;
  periodStartDate:     Date; // fecha pura (YYYY-MM-DD) — hora en periodStartTime
  periodStartTime:     string; // "HH:MM:SS"
  periodEndDate:       Date;
  periodEndTime:       string;
  responsable:         ContingencyResponsable;
  userId:              string;
  tenantId:            string;
  locationId:          string;
}

export type CreateContingencyEventResult =
  | {
      ok:                  true;
      contingencyEventId:  string;
      status:              "DRAFT";
      eventGenerationCode: string;
      itemCount:           number;
    }
  | { ok: false; message: string };

// ── Constantes ─────────────────────────────────────────────────────

const CONTINGENCY_ELIGIBLE_DTE_TYPES = new Set(["01", "03"]);

// Cualquier estado salvo REJECTED bloquea reutilizar el mismo DTE en un
// nuevo evento (ver sección 8 del prompt: "un DTE no debe poder formar
// parte de dos eventos de contingencia no rechazados/no finalizados
// simultáneamente").
const ACTIVE_CONTINGENCY_EVENT_STATUSES = [
  "DRAFT",
  "PENDING_SIGNATURE",
  "SIGNED",
  "SENT",
  "ACCEPTED",
] as const;

// ── Error de negocio interno ────────────────────────────────────────

class ContingencyEventBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContingencyEventBusinessError";
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function dbDateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface FiscalJsonDocument {
  identificacion?: { fecEmi?: string; horEmi?: string };
}

function extractFiscalEmissionMs(jsonDocument: unknown): number | null {
  const doc = jsonDocument as FiscalJsonDocument | null;
  const fecEmi = doc?.identificacion?.fecEmi;
  const horEmi = doc?.identificacion?.horEmi;
  if (!fecEmi || !horEmi) return null;
  const ms = new Date(`${fecEmi}T${horEmi}Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ── Función principal ─────────────────────────────────────────────

export async function createContingencyEvent(
  params: CreateContingencyEventParams,
): Promise<CreateContingencyEventResult> {
  const {
    dteDocumentIds,
    contingencyTypeCode,
    reason,
    periodStartDate,
    periodStartTime,
    periodEndDate,
    periodEndTime,
    responsable,
    userId,
    tenantId,
    locationId,
  } = params;

  try {
    // ── 1. Validar cantidad e IDs duplicados ───────────────────────
    if (dteDocumentIds.length < 1 || dteDocumentIds.length > 1000) {
      throw new ContingencyEventBusinessError(
        "El Evento debe reportar entre 1 y 1000 documentos DTE.",
      );
    }
    const uniqueIds = new Set(dteDocumentIds);
    if (uniqueIds.size !== dteDocumentIds.length) {
      throw new ContingencyEventBusinessError(
        "La lista de documentos DTE contiene IDs duplicados.",
      );
    }

    // ── 2. Validar tipoContingencia / motivo ───────────────────────
    const tipoContingencia = Number(contingencyTypeCode);
    if (!Number.isInteger(tipoContingencia) || tipoContingencia < 1 || tipoContingencia > 5) {
      throw new ContingencyEventBusinessError(
        `contingencyTypeCode inválido: "${contingencyTypeCode}".`,
      );
    }
    if (tipoContingencia === 5 && (!reason || reason.trim().length < 1)) {
      throw new ContingencyEventBusinessError(
        "Para tipoContingencia 5, el motivo es obligatorio.",
      );
    }
    if (reason && reason.trim().length > 500) {
      throw new ContingencyEventBusinessError(
        "El motivo no puede superar los 500 caracteres.",
      );
    }

    // ── 3. Validar período ──────────────────────────────────────────
    const fInicio  = dbDateToYmd(periodStartDate);
    const fFin     = dbDateToYmd(periodEndDate);
    const startMs  = new Date(`${fInicio}T${periodStartTime}Z`).getTime();
    const endMs    = new Date(`${fFin}T${periodEndTime}Z`).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw new ContingencyEventBusinessError(
        "El período de contingencia tiene fecha/hora inválida.",
      );
    }
    if (startMs > endMs) {
      throw new ContingencyEventBusinessError(
        "El período de contingencia tiene inicio posterior al fin.",
      );
    }

    // ── 4. Validar responsable ──────────────────────────────────────
    if (!responsable.nombre || responsable.nombre.trim().length < 5) {
      throw new ContingencyEventBusinessError(
        "nombreResponsable debe tener al menos 5 caracteres.",
      );
    }
    if (!responsable.tipoDocumento) {
      throw new ContingencyEventBusinessError("tipoDocResponsable es obligatorio.");
    }
    if (!responsable.numeroDocumento || responsable.numeroDocumento.trim().length < 5) {
      throw new ContingencyEventBusinessError(
        "numeroDocResponsable debe tener al menos 5 caracteres.",
      );
    }

    // ── 5. Cargar DTE con scope tenant/location ─────────────────────
    const dteDocs = await prisma.dteOutgoingDocument.findMany({
      where: {
        id:          { in: dteDocumentIds },
        tenant_id:   tenantId,
        location_id: locationId,
      },
      select: {
        id:                     true,
        dte_type_code:          true,
        dte_status:             true,
        generation_code:        true,
        transmission_type_code: true,
        contingency_type_code:  true,
        json_document:          true,
      },
    });

    if (dteDocs.length !== dteDocumentIds.length) {
      const foundIds = new Set(dteDocs.map((d) => d.id));
      const missing  = dteDocumentIds.filter((id) => !foundIds.has(id));
      throw new ContingencyEventBusinessError(
        `Los siguientes documentos DTE no existen o no pertenecen a la location activa: ${missing.join(", ")}.`,
      );
    }

    // Reordenar según el orden de entrada para asignar no_item estable
    const docsById = new Map(dteDocs.map((d) => [d.id, d]));
    const orderedDocs = dteDocumentIds.map((id) => docsById.get(id)!);

    // ── 6. Validar cada DTE ──────────────────────────────────────────
    for (const doc of orderedDocs) {
      if (!CONTINGENCY_ELIGIBLE_DTE_TYPES.has(doc.dte_type_code)) {
        throw new ContingencyEventBusinessError(
          `El documento DTE ${doc.id} tiene tipo "${doc.dte_type_code}", no habilitado para contingencia en esta microfase (solo 01/03).`,
        );
      }
      if (doc.dte_status === "ACCEPTED") {
        throw new ContingencyEventBusinessError(
          `El documento DTE ${doc.id} ya fue ACCEPTED por MH — no puede reportarse en un Evento de Contingencia.`,
        );
      }
      if (doc.transmission_type_code !== "2") {
        throw new ContingencyEventBusinessError(
          `El documento DTE ${doc.id} no es de transmisión por contingencia (transmission_type_code="${doc.transmission_type_code}").`,
        );
      }
      if (!doc.contingency_type_code) {
        throw new ContingencyEventBusinessError(
          `El documento DTE ${doc.id} no tiene contingency_type_code persistido.`,
        );
      }
      if (doc.contingency_type_code !== contingencyTypeCode) {
        throw new ContingencyEventBusinessError(
          `El documento DTE ${doc.id} tiene contingency_type_code="${doc.contingency_type_code}", distinto al del Evento ("${contingencyTypeCode}").`,
        );
      }
      if (!doc.generation_code) {
        throw new ContingencyEventBusinessError(
          `El documento DTE ${doc.id} no tiene codigoGeneracion.`,
        );
      }

      const fiscalMs = extractFiscalEmissionMs(doc.json_document);
      if (fiscalMs === null) {
        throw new ContingencyEventBusinessError(
          `El documento DTE ${doc.id} no tiene identificacion.fecEmi/horEmi en su json_document — no se puede validar el período.`,
        );
      }
      if (fiscalMs < startMs || fiscalMs > endMs) {
        throw new ContingencyEventBusinessError(
          `El documento DTE ${doc.id} fue emitido fuera del período de contingencia reportado.`,
        );
      }
    }

    // ── 7. Bloquear DTE ya en otro evento activo ────────────────────
    const conflictingItems = await prisma.dteContingencyEventItem.findMany({
      where: {
        dte_document_id:  { in: dteDocumentIds },
        contingency_event: { status: { in: [...ACTIVE_CONTINGENCY_EVENT_STATUSES] } },
      },
      select: { dte_document_id: true, contingency_event_id: true },
    });
    if (conflictingItems.length > 0) {
      const ids = conflictingItems.map((c) => c.dte_document_id).join(", ");
      throw new ContingencyEventBusinessError(
        `Los siguientes documentos DTE ya pertenecen a un Evento de Contingencia activo: ${ids}.`,
      );
    }

    // ── 8. Generar eventGenerationCode ──────────────────────────────
    const eventGenerationCode = randomUUID().toUpperCase();
    const now = new Date();

    // ── 9. Persistir DteContingencyEvent + Items en transacción ─────
    const created = await prisma.$transaction(async (tx) => {
      const event = await tx.dteContingencyEvent.create({
        data: {
          tenant_id:             tenantId,
          location_id:           locationId,
          contingency_type_code: contingencyTypeCode,
          reason:                reason?.trim() ?? "",
          generation_code:       eventGenerationCode,
          period_start_date:     periodStartDate,
          period_start_time:     periodStartTime,
          period_end_date:       periodEndDate,
          period_end_time:       periodEndTime,
          status:                "DRAFT",
          requested_by:          userId,
          requested_at:          now,
        },
        select: { id: true },
      });

      await tx.dteContingencyEventItem.createMany({
        data: orderedDocs.map((doc, index) => ({
          contingency_event_id: event.id,
          dte_document_id:      doc.id,
          no_item:               index + 1,
        })),
      });

      return event;
    });

    return {
      ok:                  true,
      contingencyEventId:  created.id,
      status:              "DRAFT",
      eventGenerationCode,
      itemCount:           orderedDocs.length,
    };

  } catch (err) {
    if (err instanceof ContingencyEventBusinessError) {
      return { ok: false, message: err.message };
    }
    console.error("[createContingencyEvent] Error inesperado:", err);
    return {
      ok:      false,
      message: "Error interno al crear el Evento de Contingencia.",
    };
  }
}
