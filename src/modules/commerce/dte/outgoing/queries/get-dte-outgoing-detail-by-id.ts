// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — get-dte-outgoing-detail-by-id.ts
//
// Detalle seguro de un DteOutgoingDocument para la vista global fiscal.
// Scoping obligatorio: WHERE id AND tenant_id AND location_id.
//
// NUNCA retorna: signed_jws, json_document, mh_response, observations,
//               event_json, signed_jws (invalidación), mh_observaciones,
//               response_body (logs delivery).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { DteOutgoingDetail, DteOutgoingRelationSummary } from "../types";
import type { DteOutgoingStatus, DteEnvironment } from "../../types/dte.types";
import type { DteInvalidationStatus } from "../../types/dte-invalidation.types";
import { buildDeliverySummary } from "../utils/dte-delivery-summary.utils";
import { computeDteOutgoingActionAvailability } from "../utils/dte-action-availability.utils";

// ─────────────────────────────────────────────────────────────────

export async function getDteOutgoingDetailById(params: {
  dteId:      string;
  tenantId:   string;
  locationId: string;
  client?:    PrismaClient;
}): Promise<DteOutgoingDetail | null> {
  const { dteId, tenantId, locationId, client = prisma } = params;

  // Queries paralelas: documento principal + todos los logs de transmisión
  const [row, allLogs] = await Promise.all([

    client.dteOutgoingDocument.findFirst({
      where: { id: dteId, tenant_id: tenantId, location_id: locationId },
      select: {
        id:               true,
        sale_id:          true,
        purchase_id:      true,
        dte_type_code:    true,
        dte_status:       true,
        environment:      true,
        control_number:   true,
        generation_code:  true,
        reception_stamp:  true,
        issued_at:        true,
        sent_at:          true,
        accepted_at:      true,
        rejected_at:      true,
        invalidated_at:   true,
        rejection_reason: true,
        created_at:       true,
        updated_at:       true,
        // EXCLUIDOS: signed_jws, json_document, mh_response, observations

        // Venta relacionada con datos fiscales y receptor
        sale: {
          select: {
            sale_code:    true,
            status:       true,
            subtotal:     true,
            tax_amount:   true,
            total_amount: true,
            customer: {
              select: {
                name:          true,
                id_type_code:  true,
                nit:           true,
                nrc:           true,
                dui:           true,
                email:         true,
                phone:         true,
              },
            },
          },
        },

        // Logs de delivery externo con response_body — solo para cómputo interno.
        // response_body NO se retorna al cliente.
        transmission_logs: {
          where:   { operation_type: { in: ["EXTERNAL_DELIVERY", "EXTERNAL_INVALIDATION_DELIVERY"] } },
          orderBy: { created_at: "desc" },
          select: {
            operation_type: true,
            response_body:  true,  // interno — computar delivery summary; no va al frontend
            error_message:  true,
            http_status:    true,
            created_at:     true,
          },
        },

        // Eventos de invalidación — sin event_json, sin signed_jws, sin mh_observaciones
        invalidation_events: {
          orderBy: { created_at: "desc" },
          take:    5,
          select: {
            id:                     true,
            invalidation_type_code: true,
            reason:                 true,
            status:                 true,
            mh_estado:              true,
            mh_sello_recibido:      true,
            mh_codigo_msg:          true,
            mh_descripcion_msg:     true,
            sent_at:                true,
            accepted_at:            true,
            rejected_at:            true,
            last_error:             true,
            created_at:             true,
            // EXCLUIDOS: event_json, signed_jws, mh_observaciones
          },
        },

        // NC 05 que creditó este DTE (si es CCFE 03 referenciado)
        related_in_relations: {
          where:  { relation_type: "CREDIT_NOTE_OF" },
          take:   1,
          select: {
            source_document: {
              select: {
                id:              true,
                dte_type_code:   true,
                control_number:  true,
                generation_code: true,
                dte_status:      true,
                reception_stamp: true,
                accepted_at:     true,
                created_at:      true,
              },
            },
          },
        },

        // CCFE 03 al que esta NC 05 creditó (si este DTE es NC 05)
        source_relations: {
          where:  { relation_type: "CREDIT_NOTE_OF" },
          take:   1,
          select: {
            related_document: {
              select: {
                id:              true,
                dte_type_code:   true,
                control_number:  true,
                generation_code: true,
                dte_status:      true,
                reception_stamp: true,
                accepted_at:     true,
                created_at:      true,
              },
            },
          },
        },
      },
    }),

    // Logs completos sin response_body — para sección de auditoría
    client.dteTransmissionLog.findMany({
      where:   { dte_document_id: dteId },
      orderBy: { created_at: "asc" },
      select: {
        id:             true,
        operation_type: true,
        attempt_number: true,
        request_url:    true,
        http_status:    true,
        error_message:  true,
        created_at:     true,
        // EXCLUIDO: response_body
      },
    }),

  ]);

  // Documento no existe o no pertenece al tenant/location → null
  if (!row) return null;

  // ── Delivery externo — cómputo interno; response_body nunca sale ──

  const deliveryLogs    = row.transmission_logs.filter(
    (l) => l.operation_type === "EXTERNAL_DELIVERY",
  );
  const invDeliveryLogs = row.transmission_logs.filter(
    (l) => l.operation_type === "EXTERNAL_INVALIDATION_DELIVERY",
  );

  const delivery             = buildDeliverySummary(deliveryLogs);
  const invalidation_delivery = buildDeliverySummary(invDeliveryLogs);

  // ── Receptor desde sale.customer ─────────────────────────────────

  const customer = row.sale?.customer ?? null;
  const receptor_id_number = customer?.nit ?? customer?.dui ?? null;

  // ── Totales fiscales desde sale ───────────────────────────────────

  const subtotal   = row.sale ? Number(row.sale.subtotal)     : null;
  const tax_amount = row.sale ? Number(row.sale.tax_amount)   : null;
  const total      = row.sale ? Number(row.sale.total_amount) : 0;

  // ── NC 05 relacionada (este DTE es el CCFE 03 referenciado) ───────

  const ncSourceDoc = row.related_in_relations[0]?.source_document ?? null;
  const related_nc: DteOutgoingRelationSummary | null = ncSourceDoc
    ? {
        id:              ncSourceDoc.id,
        dte_type_code:   ncSourceDoc.dte_type_code,
        control_number:  ncSourceDoc.control_number,
        generation_code: ncSourceDoc.generation_code,
        dte_status:      ncSourceDoc.dte_status as DteOutgoingStatus,
        reception_stamp: ncSourceDoc.reception_stamp,
        accepted_at:     ncSourceDoc.accepted_at,
        created_at:      ncSourceDoc.created_at,
      }
    : null;

  // ── CCFE 03 creditado (este DTE es la NC 05) ──────────────────────

  const ccfeRelDoc = row.source_relations[0]?.related_document ?? null;
  const is_credit_note_of: DteOutgoingRelationSummary | null = ccfeRelDoc
    ? {
        id:              ccfeRelDoc.id,
        dte_type_code:   ccfeRelDoc.dte_type_code,
        control_number:  ccfeRelDoc.control_number,
        generation_code: ccfeRelDoc.generation_code,
        dte_status:      ccfeRelDoc.dte_status as DteOutgoingStatus,
        reception_stamp: ccfeRelDoc.reception_stamp,
        accepted_at:     ccfeRelDoc.accepted_at,
        created_at:      ccfeRelDoc.created_at,
      }
    : null;

  // ── Invalidación más reciente — sin event_json ni signed_jws ─────

  const inv = row.invalidation_events[0] ?? null;
  const latest_invalidation = inv
    ? {
        id:                     inv.id,
        invalidation_type_code: inv.invalidation_type_code,
        reason:                 inv.reason,
        status:                 inv.status as DteInvalidationStatus,
        mh_estado:              inv.mh_estado,
        mh_sello_recibido:      inv.mh_sello_recibido,
        mh_codigo_msg:          inv.mh_codigo_msg,
        mh_descripcion_msg:     inv.mh_descripcion_msg,
        sent_at:                inv.sent_at,
        accepted_at:            inv.accepted_at,
        rejected_at:            inv.rejected_at,
        last_error:             inv.last_error,
        created_at:             inv.created_at,
      }
    : null;

  // ── Disponibilidad de acciones contextuales (servidor) ───────────
  // Calculada internamente — el cliente solo lee el resultado.
  // Ningún campo sensible es necesario para este cálculo.

  const action_availability = computeDteOutgoingActionAvailability({
    dte_status:            row.dte_status,
    dte_type_code:         row.dte_type_code,
    reception_stamp:       row.reception_stamp,
    related_nc,
    latest_invalidation,
    delivery,
    invalidation_delivery,
  });

  // ── Resultado ─────────────────────────────────────────────────────

  return {
    id:               row.id,
    sale_id:          row.sale_id,
    purchase_id:      row.purchase_id,
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
    created_at:       row.created_at,
    updated_at:       row.updated_at,
    rejection_reason: row.rejection_reason,

    sale_code:    row.sale?.sale_code ?? null,
    sale_status:  row.sale?.status    ?? null,
    total_amount: Number(row.sale?.total_amount ?? 0),
    currency:     "USD",
    customer_name: customer?.name ?? null,

    receptor_name:         customer?.name         ?? null,
    receptor_id_type_code: customer?.id_type_code ?? null,
    receptor_id_number,
    receptor_nrc:          customer?.nrc          ?? null,
    receptor_email:        customer?.email        ?? null,
    receptor_phone:        customer?.phone        ?? null,

    subtotal,
    tax_amount,
    total,

    related_nc,
    is_credit_note_of,
    latest_invalidation,
    delivery,
    invalidation_delivery,

    logs: allLogs.map((l) => ({
      id:             l.id,
      operation_type: l.operation_type,
      attempt_number: l.attempt_number,
      request_url:    l.request_url,
      http_status:    l.http_status,
      error_message:  l.error_message,
      created_at:     l.created_at,
    })),

    action_availability,
  };
}
