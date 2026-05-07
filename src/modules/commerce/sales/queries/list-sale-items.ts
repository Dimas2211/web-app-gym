// ─────────────────────────────────────────────────────────────────
// commerce/sales — list-sale-items.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { SaleItemDetail } from "../types/sale.types";

export async function listSaleItems(
  sale_id:   string,
  tenant_id: string,
): Promise<SaleItemDetail[]> {
  // Verifica tenant mediante join a Sale sin exponer sale directamente
  const rows = await prisma.saleItem.findMany({
    where: {
      sale_id,
      sale: { tenant_id },
    },
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
  });

  return rows.map((item) => ({
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
  }));
}
