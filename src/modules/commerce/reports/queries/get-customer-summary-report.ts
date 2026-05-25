// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-customer-summary-report.ts
//
// Resumen por cliente: cantidad de ventas, total, ticket promedio,
// última venta y producto más comprado.
// Incluye ventas sin cliente asignado (customer_id null) agrupadas
// como "Sin cliente".
// Solo lectura. Respeta tenant_id/location_id.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { CustomerSummaryRow } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export interface CustomerSummaryFilters extends CommerceReportFilters {
  customer_id?: string;
  limit?:       number;
}

export async function getCustomerSummaryReport(
  filters: CustomerSummaryFilters,
): Promise<CustomerSummaryRow[]> {
  const {
    tenant_id,
    location_id,
    date_from,
    date_to,
    customer_id,
    limit = 200,
  } = filters;

  const dateFilter = { gte: dateOnly(date_from), lte: dateOnly(date_to) };
  const baseWhere = {
    tenant_id,
    location_id,
    status:    "CONFIRMED" as const,
    sale_date: dateFilter,
    ...(customer_id ? { customer_id } : {}),
  };

  // Group sales by customer_id (nullable)
  const saleGroups = await prisma.sale.groupBy({
    by:      ["customer_id"],
    where:   baseWhere,
    _sum:    { total_amount: true },
    _count:  { id: true },
    _max:    { sale_date: true },
    orderBy: { _sum: { total_amount: "desc" } },
    take:    limit,
  });

  if (!saleGroups.length) return [];

  // Collect customer IDs (excluding null)
  const customerIds = saleGroups
    .map((g) => g.customer_id)
    .filter((id): id is string => id !== null);

  // Fetch customer names
  const customers = customerIds.length
    ? await prisma.customer.findMany({
        where:  { id: { in: customerIds } },
        select: { id: true, name: true },
      })
    : [];

  const customerNameMap = new Map(customers.map((c) => [c.id, c.name]));

  // Top product per customer (by line_total sum) — null customer_id handled via separate query
  const topProductGroups = await prisma.saleItem.groupBy({
    by:    ["product_name_snapshot", "sale_id"],
    where: {
      sale: {
        ...baseWhere,
        ...(customerIds.length ? { customer_id: { in: customerIds } } : {}),
      },
    },
    _sum:    { line_total: true },
    orderBy: { _sum: { line_total: "desc" } },
    take:    limit * 3,
  });

  // For top product we need sale → customer mapping; fetch it
  const saleIds = [...new Set(topProductGroups.map((g) => g.sale_id))];
  const saleCustomerMap = saleIds.length
    ? new Map(
        (
          await prisma.sale.findMany({
            where:  { id: { in: saleIds } },
            select: { id: true, customer_id: true },
          })
        ).map((s) => [s.id, s.customer_id])
      )
    : new Map<string, string | null>();

  // Build top product per customer_id key
  const topByCustomer = new Map<string | null, string>();
  for (const g of topProductGroups) {
    const cid = saleCustomerMap.get(g.sale_id) ?? null;
    const key = cid ?? "__null__";
    if (!topByCustomer.has(key)) {
      topByCustomer.set(key, g.product_name_snapshot ?? "");
    }
  }

  return saleGroups.map((g) => {
    const cid         = g.customer_id;
    const name        = cid ? (customerNameMap.get(cid) ?? cid) : "Sin cliente";
    const total       = Number(g._sum.total_amount ?? 0);
    const count       = g._count.id;
    const lastDate    = g._max.sale_date;
    const lastDateStr = lastDate
      ? (lastDate instanceof Date ? lastDate.toISOString().slice(0, 10) : String(lastDate).slice(0, 10))
      : null;

    return {
      customer_id:      cid,
      customer_name:    name,
      sale_count:       count,
      total_amount:     total,
      avg_ticket:       count > 0 ? total / count : 0,
      last_sale_date:   lastDateStr,
      top_product_name: topByCustomer.get(cid ?? "__null__") ?? null,
    };
  });
}
