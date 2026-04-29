export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/suppliers/lookup?search=
//
// Lookup rápido de proveedores activos del tenant para el combobox
// de selección en el flujo de compras.
//
// Guard: requireAdmin — mismo scope que purchases.
// Llama getSuppliersForLookup() (activos, máx 50, busca por código y nombre OR).
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getSuppliersForLookup } from "@/modules/commerce/suppliers/queries/get-suppliers-for-lookup";

export async function GET(req: NextRequest) {
  const sessionUser = await requireAdmin();
  const tenantId    = sessionUser.tenant_id;

  if (!tenantId) {
    return NextResponse.json({ error: "Sesión sin tenant activo." }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;

  const results = await getSuppliersForLookup(tenantId, search);

  return NextResponse.json(results);
}
