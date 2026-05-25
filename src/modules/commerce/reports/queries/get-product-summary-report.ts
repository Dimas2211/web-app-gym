// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-product-summary-report.ts
//
// Resumen por producto: ventas y compras agrupadas por product_id.
// Hace dos groupBy en paralelo (sales + purchases) y los fusiona.
// Margen estimado = monto vendido − (cost_price × cantidad vendida).
// Solo lectura. Respeta tenant_id/location_id.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { ProductSummaryRow } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export interface ProductSummaryFilters extends CommerceReportFilters {
  product_type?: "PRODUCT" | "SERVICE";
  limit?:        number;
}

export async function getProductSummaryReport(
  filters: ProductSummaryFilters,
): Promise<ProductSummaryRow[]> {
  const {
    tenant_id,
    location_id,
    date_from,
    date_to,
    product_type,
    limit = 200,
  } = filters;

  const saleWhere = {
    ...(product_type ? { product_type_snapshot: product_type } : {}),
    sale: {
      tenant_id,
      location_id,
      status:    "CONFIRMED" as const,
      sale_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
    },
  };

  const purchaseWhere = {
    purchase: {
      tenant_id,
      location_id,
      status:        "CONFIRMED" as const,
      purchase_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
    },
  };

  // Run sales groupBy, purchase groupBy, and max-date subqueries in parallel
  const [saleGroups, purchaseGroups] = await Promise.all([
    prisma.saleItem.groupBy({
      by:      ["product_id"],
      where:   saleWhere,
      _sum:    { line_total: true, quantity: true },
      orderBy: { _sum: { line_total: "desc" } },
      take:    limit,
    }),
    prisma.purchaseItem.groupBy({
      by:      ["product_id"],
      where:   purchaseWhere,
      _sum:    { line_total: true, quantity: true },
      orderBy: { _sum: { line_total: "desc" } },
      take:    limit,
    }),
  ]);

  // Collect all involved product IDs
  const saleProductIds     = saleGroups.map((g) => g.product_id);
  const purchaseProductIds = purchaseGroups.map((g) => g.product_id);
  const allProductIds      = [...new Set([...saleProductIds, ...purchaseProductIds])];

  if (!allProductIds.length) return [];

  // Fetch product metadata + last dates in one pass
  const [products, lastSaleDates, lastPurchaseDates] = await Promise.all([
    prisma.product.findMany({
      where:  { id: { in: allProductIds } },
      select: {
        id:           true,
        product_code: true,
        name:         true,
        product_type: true,
        cost_price:   true,
        category: { select: { name: true } },
        line:     { select: { name: true } },
      },
    }),
    // Last sale date per product
    prisma.saleItem.groupBy({
      by:    ["product_id"],
      where: { product_id: { in: saleProductIds }, sale: { tenant_id, location_id, status: "CONFIRMED" as const } },
      _max:  { created_at: true },
    }),
    // Last purchase date per product
    prisma.purchaseItem.groupBy({
      by:    ["product_id"],
      where: { product_id: { in: purchaseProductIds }, purchase: { tenant_id, location_id, status: "CONFIRMED" as const } },
      _max:  { created_at: true },
    }),
  ]);

  const productMap     = new Map(products.map((p) => [p.id, p]));
  const saleMap        = new Map(saleGroups.map((g) => [g.product_id, g]));
  const purchaseMap    = new Map(purchaseGroups.map((g) => [g.product_id, g]));
  const lastSaleMap    = new Map(lastSaleDates.map((r) => [r.product_id, r._max.created_at]));
  const lastPurchMap   = new Map(lastPurchaseDates.map((r) => [r.product_id, r._max.created_at]));

  const rows: ProductSummaryRow[] = allProductIds.map((productId) => {
    const prod = productMap.get(productId);
    const sg   = saleMap.get(productId);
    const pg   = purchaseMap.get(productId);

    const qtySold         = Number(sg?._sum?.quantity   ?? 0);
    const amountSold      = Number(sg?._sum?.line_total  ?? 0);
    const qtyPurchased    = Number(pg?._sum?.quantity   ?? 0);
    const amountPurchased = Number(pg?._sum?.line_total  ?? 0);

    const costPrice   = prod?.cost_price ? Number(prod.cost_price) : null;
    const costAvg     = costPrice;
    const marginEst   = costPrice !== null && qtySold > 0
      ? amountSold - costPrice * qtySold
      : null;

    const lastSale     = lastSaleMap.get(productId);
    const lastPurchase = lastPurchMap.get(productId);

    return {
      product_id:          productId,
      product_code:        prod?.product_code ?? "",
      product_name:        prod?.name         ?? "",
      product_type:        prod?.product_type ?? "",
      category_name:       prod?.category?.name ?? null,
      line_name:           prod?.line?.name     ?? null,
      qty_sold:            qtySold,
      amount_sold:         amountSold,
      qty_purchased:       qtyPurchased,
      amount_purchased:    amountPurchased,
      cost_avg:            costAvg,
      margin_estimate:     marginEst,
      last_sale_date:      lastSale     ? (lastSale     instanceof Date ? lastSale.toISOString().slice(0, 10)     : String(lastSale).slice(0, 10))     : null,
      last_purchase_date:  lastPurchase ? (lastPurchase instanceof Date ? lastPurchase.toISOString().slice(0, 10) : String(lastPurchase).slice(0, 10)) : null,
    };
  });

  // Sort by amount_sold desc
  return rows.sort((a, b) => b.amount_sold - a.amount_sold).slice(0, limit);
}
