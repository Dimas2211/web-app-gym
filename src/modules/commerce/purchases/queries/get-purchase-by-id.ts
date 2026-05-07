// ─────────────────────────────────────────────────────────────────
// commerce/purchases — get-purchase-by-id.ts
//
// Detalle completo de una compra, incluyendo todas sus líneas.
// Solo lectura — no toca estado.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PurchaseDetail } from "../types/purchase.types";

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
      supplier:          { select: { name: true, nrc: true } },
      confirmed_by_user: { select: { first_name: true, last_name: true } },
      cancelled_by_user: { select: { first_name: true, last_name: true } },
      created_by_user:   { select: { first_name: true, last_name: true } },
      updated_by_user:   { select: { first_name: true, last_name: true } },

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
