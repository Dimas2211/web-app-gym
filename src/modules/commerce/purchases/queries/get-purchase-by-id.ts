// ─────────────────────────────────────────────────────────────────
// commerce/purchases — get-purchase-by-id.ts
//
// Detalle completo de una compra, incluyendo todas sus líneas.
// Solo lectura — no toca estado.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PurchaseDetail } from "../types/purchase.types";
import { buildDeliverySummary } from "@/modules/commerce/dte/outgoing/utils/dte-delivery-summary.utils";
import { mapSupplierToSujetoExcluido } from "@/modules/commerce/dte/utils/supplier-to-sujeto-excluido.mapper";
import { maskFiscalDocumentNumber } from "@/modules/commerce/dte/utils/mask-fiscal-document-number";

export async function getPurchaseById(
  id:          string,
  tenant_id:   string,
  location_id: string,
): Promise<PurchaseDetail | null> {
  const row = await prisma.purchase.findFirst({
    where: { id, tenant_id, location_id },
    select: {
      id:            true,
      tenant_id:     true,
      location_id:   true,
      supplier_id:   true,
      purchase_code: true,
      purchase_date: true,
      status:        true,
      notes:         true,
      subtotal:      true,
      tax_amount:    true,
      total_amount:  true,

      document_type:     true,
      document_series:   true,
      document_number:   true,
      payment_condition: true,
      cancellation_type: true,
      retention_1pct_applies: true,
      retention_1pct_amount:  true,
      payment_nature:                 true,
      income_tax_withholding_applies: true,
      income_tax_withholding_rate:    true,
      income_tax_withholding_amount:  true,
      income_tax_withholding_base:    true,

      // Campos DTE
      source_type:          true,
      generation_code:      true,
      control_number:       true,
      reception_stamp:      true,
      dte_environment_code: true,
      dte_processed_at:     true,

      // Auditoría de confirmación
      confirmed_at: true,
      confirmed_by: true,

      // Auditoría de cancelación (Etapa 12A)
      cancelled_at: true,
      cancelled_by: true,

      // Auditoría general
      created_at: true,
      created_by: true,
      updated_at: true,
      updated_by: true,

      // Relaciones de auditoría
      supplier: {
        select: {
          name:               true,
          legal_name:         true,
          nrc:                true,
          taxpayer_type:      true,
          person_type:        true,
          id_type_code:       true,
          nit:                true,
          dui:                true,
          other_document:     true,
          activity_code:      true,
          activity_name:      true,
          dept_code:          true,
          dept_name:          true,
          municipality_code:  true,
          municipality_name:  true,
          address_complement: true,
          phone:              true,
          email:              true,
        },
      },
      confirmed_by_user: { select: { first_name: true, last_name: true } },
      cancelled_by_user: { select: { first_name: true, last_name: true } },
      created_by_user:   { select: { first_name: true, last_name: true } },
      updated_by_user:   { select: { first_name: true, last_name: true } },

      // Documento FSE 14 más reciente vinculado a esta compra (si existe)
      dte_documents: {
        orderBy: { created_at: "desc" },
        take:    1,
        select: {
          id:                     true,
          dte_type_code:          true,
          generation_code:        true,
          control_number:         true,
          reception_stamp:        true,
          dte_status:             true,
          environment:            true,
          rejection_reason:       true,
          issued_at:              true,
          generated_at:           true,
          accepted_at:            true,
          rejected_at:            true,
          created_at:             true,
          issuer_config_id:       true,
          transmission_type_code: true,
          retry_count:            true,
          json_document:          true,
          mh_response:            true,
          observations:           true,
          issuer_config: {
            select: { cod_estable_mh: true, cod_punto_venta_mh: true },
          },
          transmission_logs: {
            orderBy: { created_at: "desc" },
            take:    30,
            select: {
              id:             true,
              operation_type: true,
              http_status:    true,
              error_message:  true,
              response_body:  true,
              created_at:     true,
            },
          },
        },
      },

      items: {
        orderBy: { created_at: "asc" },
        select: {
          id:            true,
          purchase_id:   true,
          product_id:    true,
          quantity:      true,
          unit_cost:     true,
          tax_amount:    true,
          line_subtotal: true,
          line_total:    true,
          notes:         true,
          created_at:    true,
          updated_at:    true,
          product: {
            select: {
              product_code: true,
              name:         true,
              product_type: true,
              is_stockable: true,
              unit:         { select: { symbol: true } },
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  // ── Snapshot fiscal del proveedor (bloque D — sujeto excluido) ──────
  // Reutiliza mapSupplierToSujetoExcluido, el mismo mapper que usa el
  // pipeline real de generación de JSON FSE. No se inventan reglas
  // nuevas de validación en el frontend/query.
  const isExcludedSubject = row.supplier.taxpayer_type === "EXCLUDED_SUBJECT";
  const sujetoExcluidoResult = isExcludedSubject
    ? mapSupplierToSujetoExcluido({
        name:               row.supplier.name,
        legal_name:         row.supplier.legal_name,
        id_type_code:       row.supplier.id_type_code,
        nit:                row.supplier.nit,
        dui:                row.supplier.dui,
        other_document:     row.supplier.other_document,
        activity_code:      row.supplier.activity_code,
        activity_name:      row.supplier.activity_name,
        dept_code:          row.supplier.dept_code,
        municipality_code:  row.supplier.municipality_code,
        address_complement: row.supplier.address_complement,
        phone:              row.supplier.phone,
        email:              row.supplier.email,
      })
    : null;

  const rawDocumentNumber = row.supplier.nit ?? row.supplier.dui ?? row.supplier.other_document ?? null;

  const supplierFiscal: PurchaseDetail["supplier_fiscal"] = {
    is_excluded_subject:    isExcludedSubject,
    taxpayer_type:          row.supplier.taxpayer_type,
    person_type:            row.supplier.person_type as PurchaseDetail["supplier_fiscal"]["person_type"],
    id_type_code:           row.supplier.id_type_code,
    masked_document_number: maskFiscalDocumentNumber(rawDocumentNumber),
    name:                   row.supplier.name,
    legal_name:             row.supplier.legal_name,
    activity_code:          row.supplier.activity_code,
    activity_name:          row.supplier.activity_name,
    dept_name:              row.supplier.dept_name,
    municipality_name:      row.supplier.municipality_name,
    address_complement:     row.supplier.address_complement,
    phone:                  row.supplier.phone,
    email:                  row.supplier.email,
    validation_ok:          !isExcludedSubject ? false : (sujetoExcluidoResult?.ok ?? false),
    missing_fields:         sujetoExcluidoResult && !sujetoExcluidoResult.ok ? sujetoExcluidoResult.missingFields : [],
  };

  return {
    id:            row.id,
    tenant_id:     row.tenant_id,
    location_id:   row.location_id,
    supplier_id:   row.supplier_id,
    supplier_name: row.supplier.name,
    purchase_code: row.purchase_code,
    purchase_date: row.purchase_date,
    purchase_date_label: row.purchase_date.toLocaleDateString("es-CL"),
    status:        row.status,
    notes:         row.notes,
    subtotal:      Number(row.subtotal),
    tax_amount:    Number(row.tax_amount),
    total_amount:  Number(row.total_amount),

    document_type:     row.document_type,
    document_series:   row.document_series,
    document_number:   row.document_number,
    payment_condition: row.payment_condition,
    cancellation_type: row.cancellation_type,
    supplier_nrc:      row.supplier.nrc,
    retention_1pct_applies: row.retention_1pct_applies,
    retention_1pct_amount:  Number(row.retention_1pct_amount),
    net_to_pay: Number(row.total_amount) - Number(row.retention_1pct_amount),
    payment_nature: row.payment_nature as PurchaseDetail["payment_nature"],
    income_tax_withholding_applies: row.income_tax_withholding_applies,
    income_tax_withholding_rate:    row.income_tax_withholding_rate == null ? null : Number(row.income_tax_withholding_rate),
    income_tax_withholding_amount:  Number(row.income_tax_withholding_amount),
    income_tax_withholding_base:    Number(row.income_tax_withholding_base),

    dte_document: row.dte_documents[0]
      ? {
          id:               row.dte_documents[0].id,
          dte_type_code:    row.dte_documents[0].dte_type_code,
          generation_code:  row.dte_documents[0].generation_code,
          control_number:   row.dte_documents[0].control_number,
          reception_stamp:  row.dte_documents[0].reception_stamp,
          dte_status:       row.dte_documents[0].dte_status,
          environment:      row.dte_documents[0].environment,
          rejection_reason: row.dte_documents[0].rejection_reason,
          issued_at:        row.dte_documents[0].issued_at,
          generated_at:     row.dte_documents[0].generated_at,
          accepted_at:      row.dte_documents[0].accepted_at,
          rejected_at:      row.dte_documents[0].rejected_at,
          created_at:       row.dte_documents[0].created_at,

          issuer_config_id:       row.dte_documents[0].issuer_config_id,
          transmission_type_code: row.dte_documents[0].transmission_type_code,
          retry_count:            row.dte_documents[0].retry_count,
          json_document:          row.dte_documents[0].json_document,
          mh_estado:       (row.dte_documents[0].mh_response as { mhEstado?: string } | null)?.mhEstado ?? null,
          codigo_msg:      (row.dte_documents[0].mh_response as { codigoMsg?: string } | null)?.codigoMsg ?? null,
          descripcion_msg: (row.dte_documents[0].mh_response as { descripcionMsg?: string } | null)?.descripcionMsg ?? null,
          observations:    row.dte_documents[0].observations,
          cod_estable_mh:     row.dte_documents[0].issuer_config?.cod_estable_mh ?? null,
          cod_punto_venta_mh: row.dte_documents[0].issuer_config?.cod_punto_venta_mh ?? null,
        }
      : null,
    external_delivery: buildDeliverySummary(
      (row.dte_documents[0]?.transmission_logs ?? []).filter((l) => l.operation_type === "EXTERNAL_DELIVERY"),
    ),
    dte_transmission_logs: (row.dte_documents[0]?.transmission_logs ?? []).map((log) => {
      const body = log.response_body as { mhEstado?: string; codigoMsg?: string; descripcionMsg?: string } | null;
      return {
        id:              log.id,
        operation_type:  log.operation_type,
        http_status:     log.http_status,
        created_at:      log.created_at,
        mh_estado:       body?.mhEstado ?? null,
        codigo_msg:      body?.codigoMsg ?? null,
        descripcion_msg: body?.descripcionMsg ?? null,
        error_message:   log.error_message,
      };
    }),
    supplier_fiscal: supplierFiscal,

    // Campos DTE
    source_type:          row.source_type,
    generation_code:      row.generation_code,
    control_number:       row.control_number,
    reception_stamp:      row.reception_stamp,
    dte_environment_code: row.dte_environment_code,
    dte_processed_at:     row.dte_processed_at,

    // Confirmación
    confirmed_at:       row.confirmed_at,
    confirmed_at_label: row.confirmed_at
      ? row.confirmed_at.toLocaleString("es-CL")
      : null,
    confirmed_by:      row.confirmed_by,
    confirmed_by_name: row.confirmed_by_user
      ? `${row.confirmed_by_user.first_name} ${row.confirmed_by_user.last_name}`
      : null,

    // Cancelación
    cancelled_at:       row.cancelled_at,
    cancelled_at_label: row.cancelled_at
      ? row.cancelled_at.toLocaleString("es-CL")
      : null,
    cancelled_by:      row.cancelled_by,
    cancelled_by_name: row.cancelled_by_user
      ? `${row.cancelled_by_user.first_name} ${row.cancelled_by_user.last_name}`
      : null,

    // Auditoría de creación y modificación
    created_at:       row.created_at,
    created_at_label: row.created_at.toLocaleString("es-CL"),
    created_by:       row.created_by,
    created_by_name:  row.created_by_user
      ? `${row.created_by_user.first_name} ${row.created_by_user.last_name}`
      : null,
    updated_at:       row.updated_at,
    updated_at_label: row.updated_at.toLocaleString("es-CL"),
    updated_by:       row.updated_by,
    updated_by_name:  row.updated_by_user
      ? `${row.updated_by_user.first_name} ${row.updated_by_user.last_name}`
      : null,

    items: row.items.map((item) => ({
      id:           item.id,
      purchase_id:  item.purchase_id,
      product_id:   item.product_id,
      product_code: item.product.product_code,
      product_name: item.product.name,
      product_type: item.product.product_type,
      is_stockable: item.product.is_stockable,
      unit_symbol:  item.product.unit.symbol,
      quantity:      Number(item.quantity),
      unit_cost:     Number(item.unit_cost),
      tax_amount:    Number(item.tax_amount),
      line_subtotal: Number(item.line_subtotal),
      line_total:    Number(item.line_total),
      notes:         item.notes,
      created_at:    item.created_at,
      updated_at:    item.updated_at,
    })),
  };
}
