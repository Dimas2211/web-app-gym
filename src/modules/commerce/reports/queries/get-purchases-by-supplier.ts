// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-purchases-by-supplier.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { SupplierPurchaseData } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export async function getPurchasesBySupplier(
  filters: CommerceReportFilters,
  limit = 10,
): Promise<SupplierPurchaseData[]> {
  const { tenant_id, location_id, date_from, date_to } = filters;

  const grouped = await prisma.purchase.groupBy({
    by:    ["supplier_id"],
    where: {
      tenant_id,
      location_id,
      status:        "CONFIRMED",
      purchase_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
    },
    _sum:    { total_amount: true },
    _count:  { id: true },
    orderBy: { _sum: { total_amount: "desc" } },
    take:    limit,
  });

  if (!grouped.length) return [];

  const supplierIds = grouped.map((g) => g.supplier_id);
  const suppliers = await prisma.supplier.findMany({
    where:  { id: { in: supplierIds } },
    select: { id: true, name: true },
  });

  const nameMap = new Map(suppliers.map((s) => [s.id, s.name]));

  return grouped.map((g) => ({
    supplier_name: nameMap.get(g.supplier_id) ?? g.supplier_id,
    total:         Number(g._sum.total_amount ?? 0),
    count:         g._count.id,
  }));
}
