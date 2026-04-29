// ─────────────────────────────────────────────────────────────────
// commerce/products — get-product-purchase-history.ts
//
// Historial de compras para un producto específico.
// Solo lectura — no toca estado, no crea movimientos.
//
// Filtra por tenant_id (obligatorio) y location_id (opcional).
// Si location_id es null, devuelve todas las locations del tenant.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface ProductPurchaseHistoryRow {
  purchase_item_id: string;
  purchase_id:      string;
  purchase_date:    Date;
  purchase_code:    string;
  document_series:  string | null;
  document_number:  string | null;
  supplier_name:    string;
  quantity:         number;
  unit_cost:        number;
  line_subtotal:    number;
  tax_amount:       number;
  line_total:       number;
  status:           "DRAFT" | "CONFIRMED" | "CANCELLED";
}

export async function getProductPurchaseHistory(
  tenantId:   string,
  productId:  string,
  locationId?: string | null,
): Promise<ProductPurchaseHistoryRow[]> {
  const rows = await prisma.purchaseItem.findMany({
    where: {
      product_id: productId,
      purchase: {
        tenant_id: tenantId,
        ...(locationId ? { location_id: locationId } : {}),
      },
    },
    orderBy: {
      purchase: { purchase_date: "desc" },
    },
    take: 100,
    select: {
      id:           true,
      purchase_id:  true,
      quantity:     true,
      unit_cost:    true,
      line_subtotal: true,
      tax_amount:   true,
      line_total:   true,
      purchase: {
        select: {
          purchase_code:   true,
          purchase_date:   true,
          document_series: true,
          document_number: true,
          status:          true,
          supplier: {
            select: { name: true },
          },
        },
      },
    },
  });

  return rows.map((r) => ({
    purchase_item_id: r.id,
    purchase_id:      r.purchase_id,
    purchase_date:    r.purchase.purchase_date,
    purchase_code:    r.purchase.purchase_code,
    document_series:  r.purchase.document_series,
    document_number:  r.purchase.document_number,
    supplier_name:    r.purchase.supplier.name,
    quantity:         Number(r.quantity),
    unit_cost:        Number(r.unit_cost),
    line_subtotal:    Number(r.line_subtotal),
    tax_amount:       Number(r.tax_amount),
    line_total:       Number(r.line_total),
    status:           r.purchase.status as "DRAFT" | "CONFIRMED" | "CANCELLED",
  }));
}
