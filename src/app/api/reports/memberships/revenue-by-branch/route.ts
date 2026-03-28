export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getRevenueByBranch } from "@/modules/reports/queries";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;

  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;
  const branchIdParam = searchParams.get("branchId") ?? undefined;

  // branch_admin y reception solo ven su propia sucursal
  const branchId =
    user.role === "branch_admin" || user.role === "reception"
      ? (user.branch_id ?? undefined)
      : branchIdParam;

  const data = await getRevenueByBranch({
    gymId: user.gym_id,
    branchId,
    dateFrom,
    dateTo,
  });

  return NextResponse.json(data);
}
