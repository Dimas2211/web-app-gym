// ─────────────────────────────────────────────────────────────────
// commerce/reports — get-purchases-line-report.ts
//
// Retorna líneas individuales de compras CONFIRMED con joins a
// Supplier, Product (código, nombre, categoría, línea).
// Solo lectura. Respeta tenant_id/location_id.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CommerceReportFilters } from "../types/commerce-report-filters.types";
import type { PurchasesLineReportRow } from "../types/commerce-report.types";
import { dateOnly } from "../utils/report-date-range";

export interface PurchasesLineReportFilters extends CommerceReportFilters {
  supplier_id?: string;
  product_id?:  string;
  limit?:       number;
}

export async function getPurchasesLineReport(
  filters: PurchasesLineReportFilters,
): Promise<PurchasesLineReportRow[]> {
  const {
    tenant_id,
    location_id,
    date_from,
    date_to,
    supplier_id,
    product_id,
    limit = 500,
  } = filters;

  const items = await prisma.purchaseItem.findMany({
    where: {
      ...(product_id ? { product_id } : {}),
      purchase: {
        tenant_id,
        location_id,
        status:        "CONFIRMED",
        purchase_date: { gte: dateOnly(date_from), lte: dateOnly(date_to) },
        ...(supplier_id ? { supplier_id } : {}),
      },
    },
    include: {
      purchase: {
        select: {
          purchase_code: true,
          purchase_date: true,
          location_id:   true,
          supplier: {
            select: { name: true },
          },
        },
      },
      product: {
        select: {
          product_code: true,
          name:         true,
          category: { select: { name: true } },
          line:     { select: { name: true } },
        },
      },
    },
    orderBy: [
      { purchase: { purchase_date: "asc" } },
      { purchase: { purchase_code: "asc" } },
    ],
    take: limit,
  });

  return items.map((item) => {
    const purchaseDate = item.purchase.purchase_date;
    const dateStr      = purchaseDate instanceof Date
      ? purchaseDate.toISOString().slice(0, 10)
      : String(purchaseDate).slice(0, 10);

    return {
      id:            item.id,
      purchase_code: item.purchase.purchase_code,
      purchase_date: dateStr,
      supplier_name: item.purchase.supplier?.name ?? "",
      product_code:  item.product?.product_code ?? "",
      product_name:  item.product?.name ?? "",
      category_name: item.product?.category?.name ?? null,
      line_name:     item.product?.line?.name ?? null,
      quantity:      Number(item.quantity),
      unit_cost:     Number(item.unit_cost),
      line_subtotal: Number(item.line_subtotal),
      tax_amount:    Number(item.tax_amount),
      line_total:    Number(item.line_total),
      location_id:   item.purchase.location_id,
    };
  });
}
