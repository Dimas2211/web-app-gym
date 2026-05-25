// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-sales-by-period.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { PeriodDataPoint } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export async function getSalesByPeriod(
  filters: CommerceReportFilters,
): Promise<PeriodDataPoint[]> {
  const { tenant_id, location_id, date_from, date_to } = filters;

  const rows = await prisma.sale.groupBy({
    by:      ["sale_date"],
    where:   {
      tenant_id,
      location_id,
      status:    "CONFIRMED",
      sale_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
    },
    _sum:    { total_amount: true },
    orderBy: { sale_date: "asc" },
  });

  return rows.map((r) => ({
    date:  r.sale_date.toISOString().slice(0, 10),
    total: Number(r._sum.total_amount ?? 0),
  }));
}
