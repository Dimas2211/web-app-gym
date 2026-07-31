// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — search-export-products.ts
//
// F3-C21 — Búsqueda de productos aptos para venta de exportación.
// A diferencia del buscador general de ventas, expone si la unidad
// del producto tiene código MH (CAT-014) configurado — sin eso el
// DTE de exportación no puede generarse (ver generate-fex-json.service.ts).
// No bloquea la búsqueda: marca la fila para que la UI advierta antes
// de intentar agregar la línea.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface ExportProductLookup {
  id:                  string;
  product_code:        string;
  name:                string;
  unit_symbol:         string | null;
  mh_unit_code:        string | null;
  sale_price:          number | null;
  is_stockable:        boolean;
  current_stock:       number | null;
}

export async function searchExportProducts(
  tenant_id:   string,
  location_id: string,
  search:      string,
  limit        = 20,
): Promise<ExportProductLookup[]> {
  const trimmed = search.trim();

  const rows = await prisma.product.findMany({
    where: {
      tenant_id,
      allow_sale: true,
      status:     { notIn: ["BLOCKED_SALE", "INACTIVE", "DISCONTINUED"] },
      ...(trimmed.length > 0 && {
        OR: [
          { product_code: { contains: trimmed, mode: "insensitive" } },
          { name:         { contains: trimmed, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: { product_code: "asc" },
    take:    limit,
    select: {
      id: true, product_code: true, name: true, sale_price: true, is_stockable: true,
      unit: { select: { symbol: true, mh_unit_code: true } },
      product_locations: {
        where:  { tenant_id, location_id, is_active: true },
        select: { current_stock: true },
        take:   1,
      },
    },
  });

  return rows.map((p) => ({
    id:            p.id,
    product_code:  p.product_code,
    name:          p.name,
    unit_symbol:   p.unit?.symbol ?? null,
    mh_unit_code:  p.unit?.mh_unit_code ?? null,
    sale_price:    p.sale_price != null ? Number(p.sale_price) : null,
    is_stockable:  p.is_stockable,
    current_stock: p.product_locations[0] ? Number(p.product_locations[0].current_stock) : null,
  }));
}
