export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/reports/commerce/product-summary
//
// Resumen por producto: ventas + compras agrupadas.
// Params: date_from, date_to, product_type?, limit?
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getProductSummaryReport } from "@/modules/commerce/reports/queries/get-product-summary-report";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as SessionUser;
  if (!ALLOWED_ROLES.includes(user.role))
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const location_id = await getEffectiveLocationId(user);
  if (!location_id) return NextResponse.json({ error: "Sin location activa" }, { status: 400 });

  const p = req.nextUrl.searchParams;
  const date_from = p.get("date_from") ?? "";
  const date_to   = p.get("date_to")   ?? "";
  if (!date_from || !date_to)
    return NextResponse.json({ error: "date_from y date_to requeridos" }, { status: 400 });

  const productType = p.get("product_type");
  const limitParam  = p.get("limit");

  try {
    const rows = await getProductSummaryReport({
      tenant_id:    user.tenant_id,
      location_id,
      date_from,
      date_to,
      product_type: (productType === "PRODUCT" || productType === "SERVICE") ? productType : undefined,
      limit:        limitParam ? Math.min(Number(limitParam), 500) : 200,
    });
    return NextResponse.json({ rows, total_rows: rows.length, date_from, date_to });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[product-summary]", err);
    return NextResponse.json({ error: message, rows: [] }, { status: 500 });
  }
}
