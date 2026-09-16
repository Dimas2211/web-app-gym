// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-purchases-by-period.ts
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { PeriodDataPoint } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export async function getPurchasesByPeriod(
  filters: CommerceReportFilters,
  client: PrismaClient = prisma,
): Promise<PeriodDataPoint[]> {
  const { tenant_id, location_id, date_from, date_to } = filters;

  const rows = await client.purchase.groupBy({
    by:      ["purchase_date"],
    where:   {
      tenant_id,
      location_id,
      status:        "CONFIRMED",
      purchase_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
    },
    _sum:    { total_amount: true },
    orderBy: { purchase_date: "asc" },
  });

  return rows.map((r) => ({
    date:  r.purchase_date.toISOString().slice(0, 10),
    total: Number(r._sum.total_amount ?? 0),
  }));
}
