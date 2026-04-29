export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/purchases/products?search=
//
// Lookup de productos válidos para incluir en una línea de compra.
// Guard: requireAdmin — mismo scope que purchases.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getProductsForPurchase } from "@/modules/commerce/purchases/queries/get-products-for-purchase";

export async function GET(req: NextRequest) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;

  if (!tenant_id) {
    return NextResponse.json({ error: "Sesión sin tenant activo." }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;

  const products = await getProductsForPurchase(tenant_id, search);

  return NextResponse.json(products);
}
