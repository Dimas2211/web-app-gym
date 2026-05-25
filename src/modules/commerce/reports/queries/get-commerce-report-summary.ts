// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-commerce-report-summary.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { CommerceReportSummary } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export async function getCommerceReportSummary(
  filters: CommerceReportFilters,
): Promise<CommerceReportSummary> {
  const { tenant_id, location_id, date_from, date_to } = filters;

  const dateFilter = {
    gte: dateOnly(date_from),
    lte: dateOnly(date_to),
  };

  const [salesAgg, purchasesAgg, topProduct, topService] = await Promise.all([
    prisma.sale.aggregate({
      where: { tenant_id, location_id, status: "CONFIRMED", sale_date: dateFilter },
      _sum:   { total_amount: true },
      _count: { id: true },
    }),
    prisma.purchase.aggregate({
      where: { tenant_id, location_id, status: "CONFIRMED", purchase_date: dateFilter },
      _sum:   { total_amount: true },
      _count: { id: true },
    }),
    prisma.saleItem.groupBy({
      by:    ["product_name_snapshot"],
      where: {
        product_type_snapshot: "PRODUCT",
        sale: { tenant_id, location_id, status: "CONFIRMED", sale_date: dateFilter },
      },
      _sum:     { line_total: true },
      orderBy:  { _sum: { line_total: "desc" } },
      take: 1,
    }),
    prisma.saleItem.groupBy({
      by:    ["product_name_snapshot"],
      where: {
        product_type_snapshot: "SERVICE",
        sale: { tenant_id, location_id, status: "CONFIRMED", sale_date: dateFilter },
      },
      _sum:    { line_total: true },
      orderBy: { _sum: { line_total: "desc" } },
      take: 1,
    }),
  ]);

  const total_sales     = Number(salesAgg._sum.total_amount     ?? 0);
  const total_purchases = Number(purchasesAgg._sum.total_amount ?? 0);
  const sales_count     = salesAgg._count.id;
  const purchases_count = purchasesAgg._count.id;

  return {
    total_sales,
    total_purchases,
    estimated_margin: total_sales - total_purchases,
    sales_count,
    purchases_count,
    avg_ticket:       sales_count > 0 ? total_sales / sales_count : 0,
    top_product_name: topProduct[0]?.product_name_snapshot ?? null,
    top_service_name: topService[0]?.product_name_snapshot ?? null,
  };
}
