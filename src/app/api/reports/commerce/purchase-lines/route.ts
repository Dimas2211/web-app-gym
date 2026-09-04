export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/reports/commerce/purchase-lines
//
// Listado tabular de líneas de compra CONFIRMED.
// Params: date_from, date_to, supplier_id?, product_id?, limit?
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getPurchasesLineReport } from "@/modules/commerce/reports/queries/get-purchases-line-report";
import { assertReportModule } from "@/app/api/reports/reports-enforcement";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as SessionUser;
  if (!ALLOWED_ROLES.includes(user.role))
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const moduleCheck = await assertReportModule(user.tenant_id, "commerce.purchases");
  if (!moduleCheck.ok) return moduleCheck.response;

  const location_id = await getEffectiveLocationId(user);
  if (!location_id) return NextResponse.json({ error: "Sin location activa" }, { status: 400 });

  const p = req.nextUrl.searchParams;
  const date_from = p.get("date_from") ?? "";
  const date_to   = p.get("date_to")   ?? "";
  if (!date_from || !date_to)
    return NextResponse.json({ error: "date_from y date_to requeridos" }, { status: 400 });

  const limitParam = p.get("limit");

  try {
    const rows = await getPurchasesLineReport({
      tenant_id:   user.tenant_id,
      location_id,
      date_from,
      date_to,
      supplier_id: p.get("supplier_id") ?? undefined,
      product_id:  p.get("product_id")  ?? undefined,
      limit:       limitParam ? Math.min(Number(limitParam), 1000) : 500,
    });
    return NextResponse.json({ rows, total_rows: rows.length, date_from, date_to });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[purchase-lines]", err);
    return NextResponse.json({ error: message, rows: [] }, { status: 500 });
  }
}
