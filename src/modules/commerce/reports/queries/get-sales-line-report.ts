// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-sales-line-report.ts
//
// Retorna líneas individuales de ventas CONFIRMED con joins a
// Customer, Product (categoría, línea, costo maestro).
// Solo lectura. Respeta tenant_id/location_id.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { SalesLineReportRow } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export interface SalesLineReportFilters extends CommerceReportFilters {
  customer_id?:   string;
  product_id?:    string;
  product_type?:  "PRODUCT" | "SERVICE";
  limit?:         number;
}

export async function getSalesLineReport(
  filters: SalesLineReportFilters,
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

  const items = await prisma.saleItem.findMany({
    where: {
      ...(product_id ? { product_id } : {}),
      ...(product_type ? { product_type_snapshot: product_type } : {}),
      sale: {
        tenant_id,
        location_id,
        status:    "CONFIRMED",
        sale_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
        ...(customer_id ? { customer_id } : {}),
      },
    },
    include: {
      sale: {
        select: {
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
      { sale: { sale_date: "desc" } },
      { line_number: "asc" },
    ],
    take: limit,
  });

  return items.map((item) => {
    const costPrice = item.product?.cost_price ? Number(item.product.cost_price) : null;
    const qty       = Number(item.quantity);
    const costEst   = costPrice !== null ? costPrice * qty : null;
    const lineTotal = Number(item.line_total);
    const marginEst = costEst !== null ? lineTotal - costEst : null;

    const saleDate = item.sale.sale_date;
    const dateStr  = saleDate instanceof Date
      ? saleDate.toISOString().slice(0, 10)
      : String(saleDate).slice(0, 10);

    return {
      id:              item.id,
      sale_code:       item.sale.sale_code,
      sale_date:       dateStr,
      customer_name:   item.sale.customer?.name ?? null,
      product_code:    item.product_code_snapshot,
      product_name:    item.product_name_snapshot,
      product_type:    item.product_type_snapshot ?? "",
      category_name:   item.product?.category?.name ?? null,
      line_name:       item.product?.line?.name ?? null,
      quantity:        qty,
      unit_price:      Number(item.unit_price),
      line_subtotal:   Number(item.line_subtotal),
      tax_amount:      Number(item.tax_amount),
      line_total:      lineTotal,
      cost_estimate:   costEst,
      margin_estimate: marginEst,
      location_id:     item.sale.location_id,
    };
  });
}
