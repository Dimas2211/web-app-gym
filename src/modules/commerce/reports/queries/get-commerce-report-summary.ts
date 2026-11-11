// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-commerce-report-summary.ts
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { CommerceReportSummary } from "../types/commerce-report.types";
import { getSalesHeaderMovements } from "./sales-report-history";
import { money } from "../utils/sales-report-movements";
import { dateOnly } from "../utils/report-date-range";

export async function getCommerceReportSummary(
  filters: CommerceReportFilters,
  client: PrismaClient = prisma,
): Promise<CommerceReportSummary> {
  const { tenant_id, location_id, date_from, date_to } = filters;

  const dateFilter = {
    gte: dateOnly(date_from),
    lte: dateOnly(date_to),
  };

  const [salesAgg, purchasesAgg, topProduct, topService] = await Promise.all([
    getSalesHeaderMovements(filters, client),
    client.purchase.aggregate({
      where: { tenant_id, location_id, status: "CONFIRMED", purchase_date: dateFilter },
      _sum:   { total_amount: true },
      _count: { id: true },
    }),
    client.saleItem.groupBy({
      by:    ["product_name_snapshot"],
      where: {
        product_type_snapshot: "PRODUCT",
        sale: { tenant_id, location_id, status: "CONFIRMED", sale_date: dateFilter },
      },
      _sum:     { line_total: true },
      orderBy:  { _sum: { line_total: "desc" } },
      take: 1,
    }),
    client.saleItem.groupBy({
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

  const gross_sales = money(salesAgg.filter((r) => r.sign === 1).reduce((sum, r) => sum + Number(r.sale.total_amount), 0));
  const cancelled_sales = money(salesAgg.filter((r) => r.sign === -1).reduce((sum, r) => sum + Number(r.sale.total_amount), 0));
  const total_sales = money(gross_sales - cancelled_sales);
  const total_purchases = Number(purchasesAgg._sum.total_amount ?? 0);
  const sales_count = salesAgg.filter((r) => r.sign === 1).length;
  const cancellations_count = salesAgg.filter((r) => r.sign === -1).length;
  const purchases_count = purchasesAgg._count.id;

  return {
    gross_sales, cancelled_sales, cancellations_count,
    total_sales,
    total_purchases,
    estimated_margin: total_sales - total_purchases,
    sales_count,
    purchases_count,
    avg_ticket:       sales_count > 0 ? money(gross_sales / sales_count) : 0,
    top_product_name: topProduct[0]?.product_name_snapshot ?? null,
    top_service_name: topService[0]?.product_name_snapshot ?? null,
  };
}
