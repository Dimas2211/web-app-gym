// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-sales-line-report.ts
//
// Retorna líneas de venta y anulación con joins a
// Customer, Product (categoría, línea, costo maestro).
// Solo lectura. Respeta tenant_id/location_id.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { SalesLineReportRow } from "../types/commerce-report.types";
import { salesHistoryWhere } from "./sales-report-history";
import { saleReportMovements, saleDateString, money } from "../utils/sales-report-movements";

export interface SalesLineReportFilters extends CommerceReportFilters {
  customer_id?:   string;
  product_id?:    string;
  product_type?:  "PRODUCT" | "SERVICE";
  limit?:         number;
}

export async function getSalesLineReport(
  filters: SalesLineReportFilters,
  client: PrismaClient = prisma,
): Promise<SalesLineReportRow[]> {
  const {
    tenant_id,
    location_id,
    date_from,
    date_to,
    customer_id,
    product_id,
    product_type,
    limit = 500,
  } = filters;

  const items = await client.saleItem.findMany({
    where: {
      ...(product_id ? { product_id } : {}),
      ...(product_type ? { product_type_snapshot: product_type } : {}),
      sale: salesHistoryWhere({ tenant_id, location_id, date_from, date_to, customer_id }),
    },
    include: {
      sale: {
        select: {
          id: true, status: true, confirmed_at: true, cancelled_at: true,
          sale_code:   true,
          sale_date:   true,
          location_id: true,
          customer: {
            select: { name: true },
          },
        },
      },
      product: {
        select: {
          cost_price: true,
          category: { select: { name: true } },
          line:     { select: { name: true } },
        },
      },
    },
    orderBy: [
      { sale: { sale_date: "asc" } },
      { sale: { sale_code: "asc" } },
      { line_number: "asc" },
    ],
    take: limit,
  });

  return items.flatMap((item) => saleReportMovements(item.sale, date_from, date_to).map((movement) => {
    const costPrice = item.product?.cost_price != null ? Number(item.product.cost_price) : null;
    const qty       = movement.sign * Number(item.quantity);
    const costEst   = costPrice !== null ? money(costPrice * qty) : null;
    const lineTotal = money(movement.sign * Number(item.line_total));
    const marginEst = costEst !== null ? money(lineTotal - costEst) : null;

    return {
      id:              `${item.id}:${movement.movement_type}`,
      movement_id: `${item.sale.id}:${movement.movement_type}`,
      movement_type: movement.movement_type,
      original_sale_date: saleDateString(item.sale.sale_date),
      sale_code:       item.sale.sale_code,
      sale_date:       movement.movement_date,
      customer_name:   item.sale.customer?.name ?? null,
      product_code:    item.product_code_snapshot,
      product_name:    item.product_name_snapshot,
      product_type:    item.product_type_snapshot ?? "",
      category_name:   item.product?.category?.name ?? null,
      line_name:       item.product?.line?.name ?? null,
      quantity:        qty,
      unit_price:      Number(item.unit_price),
      line_subtotal:   money(movement.sign * Number(item.line_subtotal)),
      tax_amount:      money(movement.sign * Number(item.tax_amount)),
      line_total:      lineTotal,
      cost_estimate:   costEst,
      margin_estimate: marginEst,
      location_id:     item.sale.location_id,
    };
  })).sort((a, b) => a.sale_date.localeCompare(b.sale_date) || a.sale_code.localeCompare(b.sale_code)
    || (a.movement_type === b.movement_type ? 0 : a.movement_type === "SALE" ? -1 : 1));
}
