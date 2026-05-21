// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — list-dte-outgoing-global.ts
//
// Query global paginada de DteOutgoingDocument por tenant/location.
// Scoping obligatorio: WHERE tenant_id AND location_id.
// NUNCA selecciona: signed_jws, json_document, mh_response,
//                   observations, event_json, response_body (frontend).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  DteOutgoingGlobalFilters,
  DteOutgoingGlobalListItem,
  DteOutgoingGlobalResult,
} from "../types";
import type { DteOutgoingStatus, DteEnvironment } from "../../types/dte.types";
import type { DteInvalidationStatus } from "../../types/dte-invalidation.types";
import {
  computeExternalDeliveryStatus,
} from "../utils/dte-delivery-summary.utils";

// ─────────────────────────────────────────────────────────────────

const DEFAULT_SORT_FIELD = "created_at" as const;
const DEFAULT_SORT_DIR   = "desc" as const;
const DEFAULT_PAGE       = 1;
const DEFAULT_PAGE_SIZE  = 50;

// ─────────────────────────────────────────────────────────────────

export async function listDteOutgoingGlobal(
  filters: DteOutgoingGlobalFilters,
): Promise<DteOutgoingGlobalResult> {
  const {
    tenantId,
    locationId,
    search,
    dteType,
    status,
    environment,
    dateFrom,
    dateTo,
    sortField = DEFAULT_SORT_FIELD,
    sortDir   = DEFAULT_SORT_DIR,
    page      = DEFAULT_PAGE,
    pageSize  = DEFAULT_PAGE_SIZE,
  } = filters;

  // ── Cláusula WHERE ──────────────────────────────────────────────
  // tenant_id + location_id son obligatorios (scoping de seguridad).

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    tenant_id:   tenantId,
    location_id: locationId,
  };

  if (dteType && dteType !== "ALL") {
    where.dte_type_code = dteType;
  }

  if (status && status !== "ALL") {
    where.dte_status = status;
  }

  if (environment && environment !== "ALL") {
    where.environment = environment;
  }

  // Filtro de fechas sobre issued_at.
  // Documentos sin issued_at (ej: PENDING_GENERATION) no aparecen en filtro por fecha,
  // lo cual es correcto para un listado fiscal filtrado por fecha de emisión.
  if (dateFrom || dateTo) {
    where.issued_at = {};
    if (dateFrom) where.issued_at.gte = new Date(dateFrom);
    if (dateTo)   where.issued_at.lte = new Date(dateTo + "T23:59:59.999Z");
  }

  // Búsqueda por control_number, generation_code, sale_code, nombre receptor.
  // receptor_name se resuelve desde sale.customer.name — no se lee json_document.
  if (search && search.trim().length > 0) {
    const term = search.trim();
    where.OR = [
      { control_number:  { contains: term, mode: "insensitive" } },
      { generation_code: { contains: term, mode: "insensitive" } },
      { sale: { sale_code: { contains: term, mode: "insensitive" } } },
      { sale: { customer: { name: { contains: term, mode: "insensitive" } } } },
    ];
  }

  // ── Paginación ──────────────────────────────────────────────────

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  // ── Ordenación ──────────────────────────────────────────────────

  const orderBy = { [sortField]: sortDir };

  // ── Queries paralelas: listado + conteo ─────────────────────────

  const [rows, total] = await Promise.all([
    prisma.dteOutgoingDocument.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id:               true,
        sale_id:          true,
        dte_type_code:    true,
        control_number:   true,
        generation_code:  true,
        reception_stamp:  true,
        environment:      true,
        dte_status:       true,
        issued_at:        true,
        sent_at:          true,
        accepted_at:      true,
        rejected_at:      true,
        invalidated_at:   true,
        rejection_reason: true,
        created_at:       true,
        updated_at:       true,
        // ── EXCLUIDOS (sensibles): signed_jws, json_document, mh_response, observations ──

        // Venta relacionada → sale_code, total_amount, nombre receptor
        sale: {
          select: {
            sale_code:    true,
            total_amount: true,
            customer: {
              select: { name: true },
            },
          },
        },

        // Logs de delivery externo — response_body solo para cómputo interno,
        // NO se retorna al cliente en la lista.
        transmission_logs: {
          where:   { operation_type: { in: ["EXTERNAL_DELIVERY", "EXTERNAL_INVALIDATION_DELIVERY"] } },
          orderBy: { created_at: "desc" },
          select: {
            operation_type: true,
            http_status:    true,
            error_message:  true,
            response_body:  true,  // interno — computeExternalDeliveryStatus; no va al frontend
            created_at:     true,
          },
        },

        // NC 05 relacionada — via relación CREDIT_NOTE_OF
        // related_in_relations: relaciones donde este DTE es el `related_document` (el CCFE 03 creditado)
        // source_document: la NC 05 emitida
        related_in_relations: {
          where:  { relation_type: "CREDIT_NOTE_OF" },
          take:   1,
          select: {
            source_document: {
              select: { dte_status: true },
            },
          },
        },

        // Evento de invalidación más reciente (solo status — sin event_json ni signed_jws)
        invalidation_events: {
          orderBy: { created_at: "desc" },
          take:    1,
          select:  { status: true },
        },
      },
    }),

    prisma.dteOutgoingDocument.count({ where }),
  ]);

  // ── Mapeo a tipos seguros del frontend ──────────────────────────

  const items: DteOutgoingGlobalListItem[] = rows.map((row) => {
    // Separar logs por tipo de operación
    const deliveryLogs    = row.transmission_logs.filter(
      (l) => l.operation_type === "EXTERNAL_DELIVERY",
    );
    const invDeliveryLogs = row.transmission_logs.filter(
      (l) => l.operation_type === "EXTERNAL_INVALIDATION_DELIVERY",
    );

    // NC 05 relacionada
    const ncRelation           = row.related_in_relations[0];
    const hasCreditNote        = row.related_in_relations.length > 0;
    const relatedCreditNoteStatus =
      (ncRelation?.source_document?.dte_status ?? null) as DteOutgoingStatus | null;

    // Invalidación (evento más reciente)
    const hasInvalidation  = row.invalidation_events.length > 0;
    const invalidationStatus =
      (row.invalidation_events[0]?.status ?? null) as DteInvalidationStatus | null;

    return {
      id:               row.id,
      sale_id:          row.sale_id,
      dte_type_code:    row.dte_type_code,
      dte_status:       row.dte_status as DteOutgoingStatus,
      environment:      row.environment as DteEnvironment,
      control_number:   row.control_number,
      generation_code:  row.generation_code,
      reception_stamp:  row.reception_stamp,
      issued_at:        row.issued_at,
      sent_at:          row.sent_at,
      accepted_at:      row.accepted_at,
      rejected_at:      row.rejected_at,
      invalidated_at:   row.invalidated_at,
      rejection_reason: row.rejection_reason,
      created_at:       row.created_at,
      updated_at:       row.updated_at,

      // Venta
      sale_code:    row.sale?.sale_code ?? null,
      receptor_name: row.sale?.customer?.name ?? null,
      total_amount: Number(row.sale?.total_amount ?? 0),

      // NC
      has_credit_note:            hasCreditNote,
      related_credit_note_status: relatedCreditNoteStatus,

      // Invalidación
      has_invalidation:    hasInvalidation,
      invalidation_status: invalidationStatus,

      // Delivery externo — calculado internamente; response_body NO sale al cliente
      external_delivery_status:              computeExternalDeliveryStatus(deliveryLogs),
      external_invalidation_delivery_status: computeExternalDeliveryStatus(invDeliveryLogs),
    };
  });

  return { items, total, page, pageSize };
}
