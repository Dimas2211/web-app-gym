export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/reports/commerce/sales-list
//
// Listado de ventas CONFIRMED — una fila por venta, sin ítems.
// Params: date_from, date_to, customer_id?, limit?
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getSalesListReport } from "@/modules/commerce/reports/queries/get-sales-list-report";
import { resolveReportApiContext } from "@/app/api/reports/reports-enforcement";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as SessionUser;
  if (!ALLOWED_ROLES.includes(user.role))
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  // FASE VI-D6: tenant/PrismaClient EFECTIVOS (perfil runtime "Operar como
  // cliente" o identidad RUNTIME_CLIENT propia) — antes este endpoint solo
  // pasaba el module gate (assertReportModule) y consultaba Prisma global
  // con tenant_id de JWT sin revalidar.
  const reportCtx = await resolveReportApiContext(user.tenant_id, "commerce.sales", user);
  if (!reportCtx.ok) return reportCtx.response;

  try {
    const location_id = await getEffectiveLocationId(user, reportCtx.client, reportCtx.tenantId);
    if (!location_id) return NextResponse.json({ error: "Sin location activa" }, { status: 400 });

    const p = req.nextUrl.searchParams;
    const date_from = p.get("date_from") ?? "";
    const date_to   = p.get("date_to")   ?? "";
    if (!date_from || !date_to)
      return NextResponse.json({ error: "date_from y date_to requeridos" }, { status: 400 });

    const limitParam = p.get("limit");

    const rows = await getSalesListReport(
      {
        tenant_id:   reportCtx.tenantId,
        location_id,
        date_from,
        date_to,
        customer_id: p.get("customer_id") ?? undefined,
        limit:       limitParam ? Math.min(Number(limitParam), 1000) : 500,
      },
      reportCtx.client,
    );
    return NextResponse.json({ rows, total_rows: rows.length, date_from, date_to });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[sales-list]", err);
    return NextResponse.json({ error: message, rows: [] }, { status: 500 });
  } finally {
    await reportCtx.dispose();
  }
}
