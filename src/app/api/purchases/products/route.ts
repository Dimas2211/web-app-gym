export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/purchases/products?search=
//
// Lookup de productos válidos para incluir en una línea de compra.
// Incluye stock actual por location activa (solo lectura, no modifica inventario).
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getPurchaseApiContext } from "@/app/api/purchases/purchase-api-context";
import { getProductsForPurchase } from "@/modules/commerce/purchases/queries/get-products-for-purchase";

export async function GET(req: NextRequest) {
  const ctx = await getPurchaseApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;

  const products = await getProductsForPurchase(ctx.tenant_id, ctx.location_id, search);

  return NextResponse.json(products);
}
