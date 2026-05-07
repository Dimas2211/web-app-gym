// ─────────────────────────────────────────────────────────────────
// api/customers/search/route.ts
//
// GET /api/customers/search — búsqueda rápida de clientes para selector
//                             de ventas (lookup con campo q).
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { searchCustomersForSale } from "@/modules/commerce/customers/queries/search-customers-for-sale";
import { getCustomerApiContext } from "../customer-api-context";

// ── GET — búsqueda ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getCustomerApiContext();
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const sp     = req.nextUrl.searchParams;
  const q      = sp.get("q")?.trim() ?? "";
  const limitR = parseInt(sp.get("limit") ?? "20", 10);
  const limit  = Number.isFinite(limitR) ? Math.min(50, Math.max(1, limitR)) : 20;

  if (q.length < 2) {
    return NextResponse.json({ ok: true, data: [] });
  }

  const results = await searchCustomersForSale(ctx.tenant_id, q, limit);

  return NextResponse.json({ ok: true, data: results });
}
