// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-sales-list-report.ts
//
// Una fila por movimiento de venta o anulación — sin detalle de ítems.
// Usa totales del documento, no suma de líneas.
// Solo lectura. Respeta tenant_id/location_id.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { SalesListRow } from "../types/commerce-report.types";
import { getSalesHeaderMovements } from "./sales-report-history";
import { money } from "../utils/sales-report-movements";

export interface SalesListReportFilters extends CommerceReportFilters {
  customer_id?: string;
  limit?:       number;
}

export async function getSalesListReport(
  filters: SalesListReportFilters,
  client: PrismaClient = prisma,
): Promise<SalesListRow[]> {
  const movements = await getSalesHeaderMovements(filters, client, filters.limit ?? 500);
  return movements.map(({ sale, sign, movement_id, movement_type, movement_date, original_sale_date }) => ({
    movement_id, movement_type, original_sale_date,
    sale_id: sale.id, sale_code: sale.sale_code, sale_date: movement_date,
    customer_name: sale.customer?.name ?? null, status: sale.status, payment_status: sale.payment_status,
    item_count: sign * sale._count.items, subtotal: money(sign * Number(sale.subtotal)),
    tax_amount: money(sign * Number(sale.tax_amount)), total_amount: money(sign * Number(sale.total_amount)),
    location_id: sale.location_id,
  }));
}
