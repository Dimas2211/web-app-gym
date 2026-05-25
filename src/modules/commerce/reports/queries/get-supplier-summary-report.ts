// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-supplier-summary-report.ts
//
// Resumen por proveedor: cantidad de compras, total, producto más
// comprado y última compra.
// Solo lectura. Respeta tenant_id/location_id.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { SupplierSummaryRow } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export interface SupplierSummaryFilters extends CommerceReportFilters {
  supplier_id?: string;
  limit?:       number;
}

export async function getSupplierSummaryReport(
  filters: SupplierSummaryFilters,
): Promise<SupplierSummaryRow[]> {
  const {
    tenant_id,
    location_id,
    date_from,
    date_to,
    supplier_id,
    limit = 200,
  } = filters;

  const baseWhere = {
    tenant_id,
    location_id,
    status:        "CONFIRMED" as const,
    purchase_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
    ...(supplier_id ? { supplier_id } : {}),
  };

  const [purchaseGroups, topProductGroups] = await Promise.all([
    prisma.purchase.groupBy({
      by:      ["supplier_id"],
      where:   baseWhere,
      _sum:    { total_amount: true },
      _count:  { id: true },
      _max:    { purchase_date: true },
      orderBy: { _sum: { total_amount: "desc" } },
      take:    limit,
    }),
    // Top product per supplier via purchase items
    prisma.purchaseItem.groupBy({
      by:      ["product_id"],
      where:   { purchase: baseWhere },
      _sum:    { line_total: true },
      orderBy: { _sum: { line_total: "desc" } },
      take:    limit * 3,
    }),
  ]);

  if (!purchaseGroups.length) return [];

  const supplierIds  = purchaseGroups.map((g) => g.supplier_id);
  const productIds   = [...new Set(topProductGroups.map((g) => g.product_id))];

  const [suppliers, products, purchaseItemsBySupplier] = await Promise.all([
    prisma.supplier.findMany({
      where:  { id: { in: supplierIds } },
      select: { id: true, name: true },
    }),
    productIds.length
      ? prisma.product.findMany({
          where:  { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    // Need supplier→top product: fetch purchase_id → supplier_id for top items
    prisma.purchaseItem.findMany({
      where: {
        product_id: { in: productIds },
        purchase:   baseWhere,
      },
      select: {
        product_id: true,
        purchase: { select: { supplier_id: true, total_amount: true } },
      },
      orderBy: { purchase: { total_amount: "desc" } },
      take:    limit * 5,
    }),
  ]);

  const supplierNameMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const productNameMap  = new Map(products.map((p) => [p.id, p.name]));

  // Build top product per supplier (first product seen per supplier, ordered by value)
  const topProductBySupplier = new Map<string, string>();
  for (const item of purchaseItemsBySupplier) {
    const sid = item.purchase.supplier_id;
    if (!topProductBySupplier.has(sid)) {
      topProductBySupplier.set(sid, productNameMap.get(item.product_id) ?? "");
    }
  }

  return purchaseGroups.map((g) => {
    const lastDate = g._max.purchase_date;
    const lastStr  = lastDate
      ? (lastDate instanceof Date ? lastDate.toISOString().slice(0, 10) : String(lastDate).slice(0, 10))
      : null;

    return {
      supplier_id:        g.supplier_id,
      supplier_name:      supplierNameMap.get(g.supplier_id) ?? g.supplier_id,
      purchase_count:     g._count.id,
      total_amount:       Number(g._sum.total_amount ?? 0),
      top_product_name:   topProductBySupplier.get(g.supplier_id) ?? null,
      last_purchase_date: lastStr,
    };
  });
}
