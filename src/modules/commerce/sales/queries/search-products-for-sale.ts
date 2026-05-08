// ─────────────────────────────────────────────────────────────────
// commerce/sales — search-products-for-sale.ts
//
// Busca productos aptos para venta en el catálogo maestro del tenant,
// incluyendo stock actual de la location activa si el producto es stockable.
//
// Reglas:
//   - Solo productos con allow_sale=true y status ACTIVE.
//   - Excluye BLOCKED_SALE, INACTIVE, DISCONTINUED.
//   - Incluye unit, tax_rate y ProductLocation de la location.
//   - No mueve stock, no genera movimiento, no toca inventario.
//   - tenant_id y location_id siempre vienen de la sesión.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface ProductForSaleResult {
  id:           string;
  product_code: string;
  name:         string;
  description:  string | null;
  product_type: string;
  is_stockable: boolean;
  unit_id:      string | null;
  unit_name:    string | null;
  unit_symbol:  string | null;
  sale_price:   number | null;
  tax_rate_id:  string | null;
  tax_rate:     number | null;
  tax_name:     string | null;
  current_stock: number | null;
  stock_alert:   "OK" | "LOW" | "EMPTY" | "NO_LOCATION" | null;
}

export async function searchProductsForSale({
  tenant_id,
  location_id,
  search,
  limit = 20,
}: {
  tenant_id:   string;
  location_id: string;
  search?:     string;
  limit?:      number;
}): Promise<ProductForSaleResult[]> {
  const trimmed = search?.trim() ?? "";

  const products = await prisma.product.findMany({
    where: {
      tenant_id,
      allow_sale: true,
      status: { notIn: ["BLOCKED_SALE", "INACTIVE", "DISCONTINUED"] },
      ...(trimmed.length > 0 && {
        OR: [
          { product_code: { contains: trimmed, mode: "insensitive" } },
          { name:         { contains: trimmed, mode: "insensitive" } },
          { sku:          { contains: trimmed, mode: "insensitive" } },
        ],
      }),
    },
    select: {
      id:           true,
      product_code: true,
      name:         true,
      description:  true,
      product_type: true,
      is_stockable: true,
      unit_id:      true,
      sale_price:   true,
      tax_rate_id:  true,
      unit: {
        select: { name: true, symbol: true },
      },
      tax_rate: {
        select: { name: true, rate: true },
      },
      product_locations: {
        where:  { tenant_id, location_id, is_active: true },
        select: { current_stock: true, min_stock: true },
        take:   1,
      },
    },
    orderBy: [{ product_code: "asc" }],
    take: limit,
  });

  return products.map((p) => {
    const pl = p.product_locations[0] ?? null;

    let current_stock: number | null = null;
    let stock_alert: "OK" | "LOW" | "EMPTY" | "NO_LOCATION" | null = null;

    if (p.is_stockable) {
      if (!pl) {
        stock_alert = "NO_LOCATION";
      } else {
        current_stock = Number(pl.current_stock);
        const min_stock = Number(pl.min_stock);
        if (current_stock <= 0) {
          stock_alert = "EMPTY";
        } else if (min_stock > 0 && current_stock <= min_stock) {
          stock_alert = "LOW";
        } else {
          stock_alert = "OK";
        }
      }
    }

    return {
      id:           p.id,
      product_code: p.product_code,
      name:         p.name,
      description:  p.description ?? null,
      product_type: String(p.product_type),
      is_stockable: p.is_stockable,
      unit_id:      p.unit_id ?? null,
      unit_name:    p.unit?.name ?? null,
      unit_symbol:  p.unit?.symbol ?? null,
      sale_price:   p.sale_price != null ? Number(p.sale_price) : null,
      tax_rate_id:  p.tax_rate_id ?? null,
      tax_rate:     p.tax_rate?.rate != null ? Number(p.tax_rate.rate) : null,
      tax_name:     p.tax_rate?.name ?? null,
      current_stock,
      stock_alert,
    };
  });
}
