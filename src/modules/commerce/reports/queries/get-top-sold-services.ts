// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-top-sold-services.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { TopItemData } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export async function getTopSoldServices(
  filters: CommerceReportFilters,
  limit = 10,
  sortBy: "total" | "quantity" = "total",
): Promise<TopItemData[]> {
  const { tenant_id, location_id, date_from, date_to } = filters;

  const rows = await prisma.saleItem.groupBy({
    by:    ["product_name_snapshot"],
    where: {
      product_type_snapshot: "SERVICE",
      sale: {
        tenant_id,
        location_id,
        status:    "CONFIRMED",
        sale_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
      },
    },
    _sum:    { line_total: true, quantity: true },
    orderBy: sortBy === "quantity"
      ? { _sum: { quantity: "desc" } }
      : { _sum: { line_total: "desc" } },
    take:    limit,
  });

  return rows.map((r) => ({
    name:     r.product_name_snapshot ?? "",
    total:    Number(r._sum?.line_total  ?? 0),
    quantity: Number(r._sum?.quantity    ?? 0),
  }));
}
