// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-sales-list-report.ts
//
// Una fila por venta CONFIRMED — sin detalle de ítems.
// Usa totales del documento, no suma de líneas.
// Solo lectura. Respeta tenant_id/location_id.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { SalesListRow } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export interface SalesListReportFilters extends CommerceReportFilters {
  customer_id?: string;
  limit?:       number;
}

export async function getSalesListReport(
  filters: SalesListReportFilters,
): Promise<SalesListRow[]> {
  const {
    tenant_id,
    location_id,
    date_from,
    date_to,
    customer_id,
    limit = 500,
  } = filters;

  const sales = await prisma.sale.findMany({
    where: {
      tenant_id,
      location_id,
      status:    "CONFIRMED",
      sale_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
      ...(customer_id ? { customer_id } : {}),
    },
    select: {
      id:             true,
      sale_code:      true,
      sale_date:      true,
      status:         true,
      payment_status: true,
      subtotal:       true,
      tax_amount:     true,
      total_amount:   true,
      location_id:    true,
      customer: { select: { name: true } },
      _count:   { select: { items: true } },
    },
    orderBy: [
      { sale_date: "asc" },
      { sale_code: "asc" },
    ],
    take: limit,
  });

  return sales.map((sale) => {
    const saleDate = sale.sale_date instanceof Date
      ? sale.sale_date.toISOString().slice(0, 10)
      : String(sale.sale_date).slice(0, 10);

    return {
      sale_id:        sale.id,
      sale_code:      sale.sale_code,
      sale_date:      saleDate,
      customer_name:  sale.customer?.name ?? null,
      status:         sale.status,
      payment_status: sale.payment_status,
      item_count:     sale._count.items,
      subtotal:       Number(sale.subtotal),
      tax_amount:     Number(sale.tax_amount),
      total_amount:   Number(sale.total_amount),
      location_id:    sale.location_id,
    };
  });
}
