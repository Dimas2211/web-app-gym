export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getAttendanceByPeriod } from "@/modules/reports/queries";
import { resolveReportApiContext } from "@/app/api/reports/reports-enforcement";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception", "trainer"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as SessionUser;
  if (!ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  // PASO 6C: tenant/PrismaClient EFECTIVOS bajo sesión runtime "Operar como cliente".
  const reportCtx = await resolveReportApiContext(user.tenant_id, "gym.classes");
  if (!reportCtx.ok) return reportCtx.response;

  try {
    const { searchParams } = req.nextUrl;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "dateFrom y dateTo son obligatorios" }, { status: 400 });
    }

    const branchIdParam = searchParams.get("branchId") ?? undefined;

    const branchId =
      user.role === "branch_admin" || user.role === "reception" || user.role === "trainer"
        ? (user.location_id ?? undefined)
        : branchIdParam;

    const data = await getAttendanceByPeriod(
      { tenantId: reportCtx.tenantId, branchId, dateFrom, dateTo },
      reportCtx.client,
    );
    return NextResponse.json(data);
  } finally {
    await reportCtx.dispose();
  }
}
