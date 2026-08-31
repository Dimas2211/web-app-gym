// ─────────────────────────────────────────────────────────────────
// commerce/products — get-product-sales-history.ts
//
// Historial de ventas para un producto específico.
// Solo lectura — usa snapshots de SaleItem, nunca recalcula desde Product.
//
// Filtra por tenant_id (obligatorio) y location_id (opcional).
// Devuelve solo CONFIRMED y CANCELLED; las CANCELLED van marcadas.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";

export interface ProductSalesHistoryRow {
  sale_item_id:          string;
  sale_id:               string;
  sale_code:             string;
  sale_date:             Date;
  status:                "CONFIRMED" | "CANCELLED";
  customer_name:         string | null;
  location_id:           string;
  primary_dte_type_code: string | null;
  quantity:              number;
  unit_price:            number;
  taxable_amount:        number;
  tax_amount:            number;
  line_total:            number;
}

export async function getProductSalesHistory(
  tenantId:   string,
  productId:  string,
  locationId?: string | null,
  client: PrismaClient = prisma,
): Promise<ProductSalesHistoryRow[]> {
  const rows = await client.saleItem.findMany({
    where: {
      product_id: productId,
      sale: {
        tenant_id: tenantId,
        status:    { in: ["CONFIRMED", "CANCELLED"] },
        ...(locationId ? { location_id: locationId } : {}),
      },
    },
    orderBy: {
      sale: { sale_date: "desc" },
    },
    take: 100,
    select: {
      id:            true,
      sale_id:       true,
      quantity:      true,
      unit_price:    true,
      line_subtotal: true,
      tax_amount:    true,
      line_total:    true,
      sale: {
        select: {
          sale_code:             true,
          sale_date:             true,
          status:                true,
          location_id:           true,
          primary_dte_type_code: true,
          customer: {
            select: { name: true },
          },
        },
      },
    },
  });

  return rows.map((r) => ({
    sale_item_id:          r.id,
    sale_id:               r.sale_id,
    sale_code:             r.sale.sale_code,
    sale_date:             r.sale.sale_date,
    status:                r.sale.status as "CONFIRMED" | "CANCELLED",
    customer_name:         r.sale.customer?.name ?? null,
    location_id:           r.sale.location_id,
    primary_dte_type_code: r.sale.primary_dte_type_code,
    quantity:              Number(r.quantity),
    unit_price:            Number(r.unit_price),
    taxable_amount:        Number(r.line_subtotal),
    tax_amount:            Number(r.tax_amount),
    line_total:            Number(r.line_total),
  }));
}
