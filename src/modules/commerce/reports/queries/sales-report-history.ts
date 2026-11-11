import type { Prisma, PrismaClient } from "@prisma/client";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import { saleReportMovements, saleDateString } from "../utils/sales-report-movements";

export function salesHistoryWhere(filters: CommerceReportFilters & { customer_id?: string }): Prisma.SaleWhereInput {
  // Cancellation timestamps are stored as UTC instants; use the Salvadoran
  // business day, with an exclusive next-day bound. sale_date is a DATE.
  const start = new Date(`${filters.date_from}T06:00:00.000Z`);
  const end = new Date(`${filters.date_to}T06:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    tenant_id: filters.tenant_id, location_id: filters.location_id,
    ...(filters.customer_id ? { customer_id: filters.customer_id } : {}),
    AND: [
      { OR: [{ status: "CONFIRMED" }, { status: "CANCELLED", confirmed_at: { not: null } }] },
      { OR: [
        { sale_date: { gte: new Date(`${filters.date_from}T00:00:00.000Z`), lte: new Date(`${filters.date_to}T00:00:00.000Z`) } },
        { status: "CANCELLED", cancelled_at: { gte: start, lt: end } },
      ] },
    ],
  };
}

export async function getSalesHeaderMovements(
  filters: CommerceReportFilters & { customer_id?: string }, client: PrismaClient, limit?: number,
) {
  const sales = await client.sale.findMany({
    where: salesHistoryWhere(filters),
    select: {
      id: true, sale_code: true, sale_date: true, confirmed_at: true, cancelled_at: true,
      status: true, payment_status: true, subtotal: true, tax_amount: true, total_amount: true,
      location_id: true, customer: { select: { name: true } }, _count: { select: { items: true } },
    },
    orderBy: [{ sale_date: "asc" }, { sale_code: "asc" }],
    // Limit source documents, never cut off the reversal of an included sale.
    ...(limit === undefined ? {} : { take: limit }),
  });
  return sales.flatMap((sale) => saleReportMovements(sale, filters.date_from, filters.date_to).map((movement) => ({
    sale, ...movement, movement_id: `${sale.id}:${movement.movement_type}`,
    original_sale_date: saleDateString(sale.sale_date),
  }))).sort((a, b) => a.movement_date.localeCompare(b.movement_date)
    || a.sale.sale_code.localeCompare(b.sale.sale_code) || b.sign - a.sign);
}
