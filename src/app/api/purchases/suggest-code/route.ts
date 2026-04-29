// ─────────────────────────────────────────────────────────────────
// api/purchases/suggest-code/route.ts
//
// GET /api/purchases/suggest-code?date=YYYY-MM-DD
//
// Devuelve el siguiente correlativo numérico sugerido para la
// location activa del usuario en el mes de la fecha indicada.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getNextPurchaseCode } from "@/modules/commerce/purchases/queries/get-next-purchase-code";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionUser = await requireAdmin();
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!location_id) {
    return NextResponse.json({ error: "Sin location activa." }, { status: 401 });
  }

  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: "Parámetro date requerido (YYYY-MM-DD)." }, { status: 400 });
  }

  const d     = new Date(dateParam + "T00:00:00");
  const year  = d.getFullYear();
  const month = d.getMonth() + 1;

  const suggested_code = await getNextPurchaseCode(location_id, year, month);

  return NextResponse.json(
    { suggested_code },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
