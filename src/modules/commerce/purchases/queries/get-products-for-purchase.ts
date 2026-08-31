// ─────────────────────────────────────────────────────────────────
// commerce/purchases — get-products-for-purchase.ts
//
// Proyección de productos válidos para ser incluidos en una compra.
//
// Criterios de elegibilidad:
//   - allow_purchase = true  (flag de catálogo)
//   - status no es BLOCKED_PURCHASE, INACTIVE ni DISCONTINUED
//     → quedan elegibles: ACTIVE y BLOCKED_SALE
//     → BLOCKED_SALE es elegible: puede comprarse aunque no se venda
//   Los dos controles son ortogonales:
//     allow_purchase es política del catálogo al momento de crear el producto;
//     status es el estado operativo actual que puede overridear esa política.
//
// Incluye stock actual por location (left join con product_locations).
// Scope: tenant_id + location_id para stock; products son catálogo tenant-level.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { ProductForPurchaseLookup } from "../types/purchase.types";

export async function getProductsForPurchase(
  tenant_id:   string,
  location_id: string,
  search?:     string,
  client: PrismaClient = prisma,
): Promise<ProductForPurchaseLookup[]> {
  const rows = await client.product.findMany({
    where: {
      tenant_id,
      allow_purchase: true,
      status: {
        notIn: ["BLOCKED_PURCHASE", "INACTIVE", "DISCONTINUED"],
      },
      ...(search && {
        OR: [
          { product_code: { contains: search, mode: "insensitive" } },
          { name:         { contains: search, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: { product_code: "asc" },
    take:    50,
    select: {
      id:           true,
      product_code: true,
      name:         true,
      product_type: true,
      is_stockable: true,
      cost_price:   true,
      tax_rate:     { select: { rate: true } },
      unit:         { select: { symbol: true } },
      product_locations: {
        where:  { tenant_id, location_id },
        select: { current_stock: true },
        take:   1,
      },
    },
  });

  return rows.map((r) => {
    const loc = r.product_locations[0];
    return {
      id:           r.id,
      product_code: r.product_code,
      name:         r.name,
      product_type: r.product_type,
      is_stockable: r.is_stockable,
      unit_symbol:  r.unit.symbol,
      cost_price:   r.cost_price !== null ? Number(r.cost_price) : null,
      tax_rate:     r.tax_rate   !== null ? Number(r.tax_rate.rate) : null,
      current_stock: loc !== undefined ? Number(loc.current_stock) : null,
    };
  });
}
