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
//   - Soporta paginación con limit/offset; limit máx 100.
//   - Devuelve hasMore y nextOffset sin COUNT adicional.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface ProductForSaleResult {
  id:                  string;
  product_code:        string;
  name:                string;
  description:         string | null;
  product_type:        string;
  status:              string;
  is_stockable:        boolean;
  unit_id:             string | null;
  unit_name:           string | null;
  unit_symbol:         string | null;
  category_name:       string | null;
  line_name:           string | null;
  subline_name:        string | null;
  brand:               string | null;
  supplier_name:       string | null;
  sale_price:          number | null;
  sale_price_with_tax: number | null;
  tax_rate_id:         string | null;
  tax_rate:            number | null;
  tax_name:            string | null;
  current_stock:       number | null;
  stock_alert:         "OK" | "LOW" | "EMPTY" | "NO_LOCATION" | null;
}

export interface SearchPagination {
  limit:      number;
  offset:     number;
  hasMore:    boolean;
  nextOffset: number | null;
}

export interface SearchProductsForSaleResult {
  items:      ProductForSaleResult[];
  pagination: SearchPagination;
}

export async function searchProductsForSale({
  tenant_id,
  location_id,
  search,
  limit  = 50,
  offset = 0,
}: {
  tenant_id:   string;
  location_id: string;
  search?:     string;
  limit?:      number;
  offset?:     number;
}): Promise<SearchProductsForSaleResult> {
  const trimmed   = search?.trim() ?? "";
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeSkip  = Math.max(offset, 0);

  // Fetch one extra row to detect hasMore without a COUNT query
  const raw = await prisma.product.findMany({
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
      status:       true,
      is_stockable: true,
      unit_id:      true,
      brand:        true,
      sale_price:   true,
      tax_rate_id:  true,
      unit: {
        select: { name: true, symbol: true },
      },
      tax_rate: {
        select: { name: true, rate: true },
      },
      category: {
        select: { name: true },
      },
      line: {
        select: { name: true },
      },
      subline: {
        select: { name: true },
      },
      supplier: {
        select: { name: true },
      },
      product_locations: {
        where:  { tenant_id, location_id, is_active: true },
        select: { current_stock: true, min_stock: true },
        take:   1,
      },
    },
    orderBy: [{ product_code: "asc" }],
    take:    safeLimit + 1,
    skip:    safeSkip,
  });

  const hasMore = raw.length > safeLimit;
  const rows    = hasMore ? raw.slice(0, safeLimit) : raw;

  const items: ProductForSaleResult[] = rows.map((p) => {
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

    const salePrice    = p.sale_price  != null ? Number(p.sale_price)       : null;
    const taxRateValue = p.tax_rate?.rate != null ? Number(p.tax_rate.rate) : null;

    return {
      id:                  p.id,
      product_code:        p.product_code,
      name:                p.name,
      description:         p.description ?? null,
      product_type:        String(p.product_type),
      status:              String(p.status),
      is_stockable:        p.is_stockable,
      unit_id:             p.unit_id ?? null,
      unit_name:           p.unit?.name    ?? null,
      unit_symbol:         p.unit?.symbol  ?? null,
      category_name:       p.category?.name  ?? null,
      line_name:           p.line?.name      ?? null,
      subline_name:        p.subline?.name   ?? null,
      brand:               p.brand           ?? null,
      supplier_name:       p.supplier?.name  ?? null,
      sale_price:          salePrice,
      sale_price_with_tax: (salePrice != null && taxRateValue != null)
        ? parseFloat((salePrice * (1 + taxRateValue / 100)).toFixed(2))
        : null,
      tax_rate_id:         p.tax_rate_id ?? null,
      tax_rate:            taxRateValue,
      tax_name:            p.tax_rate?.name ?? null,
      current_stock,
      stock_alert,
    };
  });

  return {
    items,
    pagination: {
      limit:      safeLimit,
      offset:     safeSkip,
      hasMore,
      nextOffset: hasMore ? safeSkip + safeLimit : null,
    },
  };
}
