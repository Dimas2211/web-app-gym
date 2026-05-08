// ─────────────────────────────────────────────────────────────────
// api/dte/catalogs/route.ts
//
// GET /api/dte/catalogs?catalog_code=CAT-016
//
// Devuelve los ítems activos de un catálogo DTE de sistema.
// Los catálogos son globales (no tenant/location scoped).
// catalog_code es requerido para evitar payloads grandes.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { listDteCatalogItems } from "@/modules/commerce/dte/queries/list-dte-catalog-items";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const catalog_code = req.nextUrl.searchParams.get("catalog_code");
  if (!catalog_code?.trim()) {
    return NextResponse.json(
      { ok: false, error: "catalog_code es requerido." },
      { status: 400 },
    );
  }

  const items = await listDteCatalogItems({ catalog_code: catalog_code.trim() });

  return NextResponse.json({ ok: true, items }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
