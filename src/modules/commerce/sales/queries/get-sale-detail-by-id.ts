// ─────────────────────────────────────────────────────────────────
// commerce/sales — get-sale-detail-by-id.ts
//
// Detalle completo de una venta con todas sus líneas.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { SaleDetail } from "../types/sale.types";

export async function getSaleDetailById(
  id:          string,
  tenant_id:   string,
  location_id: string,
): Promise<SaleDetail | null> {
  const row = await prisma.sale.findFirst({
    where: { id, tenant_id, location_id },
    select: {
      id:                       true,
      tenant_id:                true,
      location_id:              true,
      customer_id:              true,
      sale_code:                true,
      sale_year:                true,
      sale_month:               true,
      sale_sequence:            true,
      sale_date:                true,
      status:                   true,
      payment_status:           true,
      primary_dte_type_code:    true,
      payment_method_code:      true,
      condition_operation_code: true,
      payment_term_code:        true,
      payment_term_value:       true,
      subtotal:                 true,
      discount_amount:          true,
      tax_amount:               true,
      total_amount:             true,
      inventory_moved:          true,
      cash_session_id:          true,
      notes:                    true,
      confirmed_at:             true,
      confirmed_by:             true,
      cancelled_at:             true,
      cancelled_by:             true,
      created_at:               true,
      created_by:               true,
      updated_at:               true,
      updated_by:               true,
      customer: {
        select: {
          name:          true,
          nit:           true,
          nrc:           true,
          dui:           true,
          taxpayer_type: true,
          activity_code: true,
        },
      },
      dte_documents: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: {
          id:              true,
          dte_type_code:   true,
          generation_code: true,
          control_number:  true,
          reception_stamp: true,
          dte_status:      true,
          environment:     true,
          created_at:      true,
        },
      },
      confirmed_by_user: { select: { first_name: true, last_name: true } },
      cancelled_by_user: { select: { first_name: true, last_name: true } },
      created_by_user:   { select: { first_name: true, last_name: true } },
      updated_by_user:   { select: { first_name: true, last_name: true } },
      items: {
        orderBy: { line_number: "asc" },
        select: {
          id:                    true,
          sale_id:               true,
          product_id:            true,
          line_number:           true,
          product_code_snapshot: true,
          product_name_snapshot: true,
          product_type_snapshot: true,
          is_stockable_snapshot: true,
          quantity:              true,
          unit_price:            true,
          discount_amount:       true,
          tax_rate_snapshot:     true,
          tax_amount:            true,
          line_subtotal:         true,
          line_total:            true,
          notes:                 true,
          created_at:            true,
          updated_at:            true,
        },
      },
    },
  });

  if (!row) return null;

  return {
    id:             row.id,
    tenant_id:      row.tenant_id,
    location_id:    row.location_id,
    customer_id:    row.customer_id,
    customer_name:  row.customer?.name ?? null,
    customer_nit:           row.customer?.nit           ?? null,
    customer_nrc:           row.customer?.nrc           ?? null,
    customer_dui:           row.customer?.dui           ?? null,
    customer_taxpayer_type: row.customer?.taxpayer_type ?? null,
    customer_activity_code: row.customer?.activity_code ?? null,
    sale_code:      row.sale_code,
    sale_year:      row.sale_year,
    sale_month:     row.sale_month,
    sale_sequence:  row.sale_sequence,
    sale_date:      row.sale_date,
    sale_date_label: row.sale_date.toLocaleDateString("es-CL"),
    status:         row.status as SaleDetail["status"],
    payment_status: row.payment_status as SaleDetail["payment_status"],
    primary_dte_type_code:    row.primary_dte_type_code,
    payment_method_code:      row.payment_method_code,
    condition_operation_code: row.condition_operation_code,
    payment_term_code:        row.payment_term_code,
    payment_term_value:       row.payment_term_value,
    subtotal:        Number(row.subtotal),
    discount_amount: Number(row.discount_amount),
    tax_amount:      Number(row.tax_amount),
    total_amount:    Number(row.total_amount),
    inventory_moved: row.inventory_moved,
    cash_session_id: row.cash_session_id,
    notes:           row.notes,

    confirmed_at: row.confirmed_at,
    confirmed_at_label: row.confirmed_at
      ? row.confirmed_at.toLocaleString("es-CL")
      : null,
    confirmed_by:      row.confirmed_by,
    confirmed_by_name: row.confirmed_by_user
      ? `${row.confirmed_by_user.first_name} ${row.confirmed_by_user.last_name}`
      : null,

    cancelled_at: row.cancelled_at,
    cancelled_at_label: row.cancelled_at
      ? row.cancelled_at.toLocaleString("es-CL")
      : null,
    cancelled_by:      row.cancelled_by,
    cancelled_by_name: row.cancelled_by_user
      ? `${row.cancelled_by_user.first_name} ${row.cancelled_by_user.last_name}`
      : null,

    created_at:       row.created_at,
    created_at_label: row.created_at.toLocaleDateString("es-CL"),
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

    dte_document: row.dte_documents[0]
      ? {
          id:              row.dte_documents[0].id,
          dte_type_code:   row.dte_documents[0].dte_type_code,
          generation_code: row.dte_documents[0].generation_code,
          control_number:  row.dte_documents[0].control_number,
          reception_stamp: row.dte_documents[0].reception_stamp,
          dte_status:      row.dte_documents[0].dte_status,
          environment:     row.dte_documents[0].environment,
          created_at:      row.dte_documents[0].created_at,
        }
      : null,

    items: row.items.map((item) => ({
      id:                    item.id,
      sale_id:               item.sale_id,
      product_id:            item.product_id,
      line_number:           item.line_number,
      product_code_snapshot: item.product_code_snapshot,
      product_name_snapshot: item.product_name_snapshot,
      product_type_snapshot: item.product_type_snapshot,
      is_stockable_snapshot: item.is_stockable_snapshot,
      quantity:              Number(item.quantity),
      unit_price:            Number(item.unit_price),
      discount_amount:       Number(item.discount_amount),
      tax_rate_snapshot:     item.tax_rate_snapshot != null
        ? Number(item.tax_rate_snapshot)
        : null,
      tax_amount:    Number(item.tax_amount),
      line_subtotal: Number(item.line_subtotal),
      line_total:    Number(item.line_total),
      notes:         item.notes,
      created_at:    item.created_at,
      updated_at:    item.updated_at,
    })),
  };
}
