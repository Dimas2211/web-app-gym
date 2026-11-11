// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-sales-by-period.ts
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { PeriodDataPoint } from "../types/commerce-report.types";
import { getSalesHeaderMovements } from "./sales-report-history";
import { money } from "../utils/sales-report-movements";

export async function getSalesByPeriod(
  filters: CommerceReportFilters,
  client: PrismaClient = prisma,
): Promise<PeriodDataPoint[]> {
  const movements = await getSalesHeaderMovements(filters, client);
  const days = new Map<string, { date: string; total: number; gross_sales: number; cancelled_sales: number }>();
  for (const movement of movements) {
    const day = days.get(movement.movement_date) ?? { date: movement.movement_date, total: 0, gross_sales: 0, cancelled_sales: 0 };
    const amount = Number(movement.sale.total_amount);
    if (movement.sign === 1) day.gross_sales = money(day.gross_sales + amount);
    else day.cancelled_sales = money(day.cancelled_sales + amount);
    day.total = money(day.gross_sales - day.cancelled_sales);
    days.set(day.date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
