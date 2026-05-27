// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-purchases-list-report.ts
//
// Una fila por compra CONFIRMED — sin detalle de ítems.
// Usa totales del documento, no suma de líneas.
// Solo lectura. Respeta tenant_id/location_id.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { PurchasesListRow } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export interface PurchasesListReportFilters extends CommerceReportFilters {
  supplier_id?: string;
  limit?:       number;
}

export async function getPurchasesListReport(
  filters: PurchasesListReportFilters,
): Promise<PurchasesListRow[]> {
  const {
    tenant_id,
    location_id,
    date_from,
    date_to,
    supplier_id,
    limit = 500,
  } = filters;

  const purchases = await prisma.purchase.findMany({
    where: {
      tenant_id,
      location_id,
      status:        "CONFIRMED",
      purchase_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
      ...(supplier_id ? { supplier_id } : {}),
    },
    select: {
      id:            true,
      purchase_code: true,
      purchase_date: true,
      status:        true,
      source_type:   true,
      subtotal:      true,
      tax_amount:    true,
      total_amount:  true,
      location_id:   true,
      supplier: { select: { name: true } },
      _count:   { select: { items: true } },
    },
    orderBy: [
      { purchase_date: "asc" },
      { purchase_code: "asc" },
    ],
    take: limit,
  });

  return purchases.map((purchase) => {
    const purchaseDate = purchase.purchase_date instanceof Date
      ? purchase.purchase_date.toISOString().slice(0, 10)
      : String(purchase.purchase_date).slice(0, 10);

    return {
      purchase_id:   purchase.id,
      purchase_code: purchase.purchase_code,
      purchase_date: purchaseDate,
      supplier_name: purchase.supplier?.name ?? "",
      status:        purchase.status,
      source_type:   purchase.source_type,
      item_count:    purchase._count.items,
      subtotal:      Number(purchase.subtotal),
      tax_amount:    Number(purchase.tax_amount),
      total_amount:  Number(purchase.total_amount),
      location_id:   purchase.location_id,
    };
  });
}
