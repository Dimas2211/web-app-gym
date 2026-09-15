// ─────────────────────────────────────────────────────────────────
// api/purchases/suggest-code/route.ts
//
// GET /api/purchases/suggest-code?date=YYYY-MM-DD
//
// Devuelve el siguiente correlativo numérico sugerido para la
// location activa del usuario en el mes de la fecha indicada.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getNextPurchaseCode } from "@/modules/commerce/purchases/queries/get-next-purchase-code";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.purchases" });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
        context.client,
        context.tenantId,
      ));

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

    const suggested_code = await getNextPurchaseCode(location_id, year, month, context.client);

    return NextResponse.json(
      { suggested_code },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } finally {
    await dispose();
  }
}
