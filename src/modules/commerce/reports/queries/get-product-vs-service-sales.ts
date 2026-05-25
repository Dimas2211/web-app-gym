// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-product-vs-service-sales.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { ProductVsServiceData } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export async function getProductVsServiceSales(
  filters: CommerceReportFilters,
): Promise<ProductVsServiceData> {
  const { tenant_id, location_id, date_from, date_to } = filters;

  const saleWhere = {
    tenant_id,
    location_id,
    status:    "CONFIRMED" as const,
    sale_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
  };

  const [productsAgg, servicesAgg] = await Promise.all([
    prisma.saleItem.aggregate({
      where: {
        product_type_snapshot: "PRODUCT",
        sale: saleWhere,
      },
      _sum: { line_total: true },
    }),
    prisma.saleItem.aggregate({
      where: {
        product_type_snapshot: "SERVICE",
        sale: saleWhere,
      },
      _sum: { line_total: true },
    }),
  ]);

  return {
    products_total: Number(productsAgg._sum.line_total ?? 0),
    services_total: Number(servicesAgg._sum.line_total ?? 0),
  };
}
