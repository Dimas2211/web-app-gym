export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/inventory/product-movements/products?q=
//
// Selector de producto (código o nombre) para la consulta de
// movimientos por producto. Solo lectura; tenant y sucursal efectivos
// resueltos en servidor.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { resolveInventoryReadContext } from "@/modules/commerce/inventory/server/resolve-inventory-read-context";
import { searchMovementProducts } from "@/modules/commerce/inventory/queries/search-movement-products";

export async function GET(req: NextRequest) {
  const ctx = await resolveInventoryReadContext();
  if (!ctx.ok) return ctx.response;

  try {
    const items = await searchMovementProducts(
      ctx.context.tenantId,
      ctx.locationId,
      req.nextUrl.searchParams.get("q") ?? "",
      ctx.context.client,
    );
    return NextResponse.json({ items });
  } finally {
    await ctx.dispose();
  }
}
