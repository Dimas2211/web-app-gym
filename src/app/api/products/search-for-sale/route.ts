// ─────────────────────────────────────────────────────────────────
// api/products/search-for-sale — GET /api/products/search-for-sale?q=...
//
// Busca productos vendibles para usar en el formulario de ventas.
// tenant_id y location_id se resuelven desde sesión; nunca del cliente.
//
// Respuesta: { ok: true, items: ProductForSaleResult[] }
//            { ok: false, error: string }
// ─────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSaleApiContext } from "@/app/api/sales/sale-api-context";
import { searchProductsForSale } from "@/modules/commerce/sales/queries/search-products-for-sale";

export async function GET(req: NextRequest) {
  const ctx = await getSaleApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const items = await searchProductsForSale({
      tenant_id:   ctx.tenant_id,
      location_id: ctx.location_id,
      search:      q,
      limit:       20,
    });
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudieron buscar productos para venta." },
      { status: 500 },
    );
  }
}
