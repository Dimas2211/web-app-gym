// ─────────────────────────────────────────────────────────────────
// api/products/search-for-sale — GET /api/products/search-for-sale
//
// Busca productos vendibles para usar en el formulario de ventas.
// tenant_id y location_id se resuelven desde sesión; nunca del cliente.
//
// Query params:
//   q      — texto de búsqueda (opcional)
//   limit  — cantidad por página (default 50, máx 100)
//   offset — desde dónde empezar (default 0)
//
// Respuesta:
//   { ok: true,  items: [...], pagination: { limit, offset, hasMore, nextOffset } }
//   { ok: false, error: string }
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

  const params = req.nextUrl.searchParams;

  const q      = params.get("q") ?? "";
  const limit  = Math.min(Math.max(parseInt(params.get("limit")  ?? "50", 10) || 50, 1), 100);
  const offset = Math.max(parseInt(params.get("offset") ?? "0",  10) || 0, 0);

  try {
    const result = await searchProductsForSale({
      tenant_id:   ctx.tenant_id,
      location_id: ctx.location_id,
      search:      q,
      limit,
      offset,
      client: ctx.client,
    });
    return NextResponse.json({ ok: true, items: result.items, pagination: result.pagination });
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudieron buscar productos para venta." },
      { status: 500 },
    );
  } finally {
    await ctx.dispose();
  }
}
