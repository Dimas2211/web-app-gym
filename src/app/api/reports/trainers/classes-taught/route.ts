export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getTrainerClassesTaught } from "@/modules/reports/queries";
import { assertReportModule } from "@/app/api/reports/reports-enforcement";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as SessionUser;
  if (!ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  // Fuente real de datos: scheduled_class + attendance (gym.classes).
  // El nombre del entrenador es un join incidental de display, no el
  // recurso gestionado por el endpoint.
  const moduleCheck = await assertReportModule(user.tenant_id, "gym.classes");
  if (!moduleCheck.ok) return moduleCheck.response;

  const { searchParams } = req.nextUrl;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;
  const trainerId = searchParams.get("trainerId") ?? undefined;
  const branchIdParam = searchParams.get("branchId") ?? undefined;

  const branchId =
    user.role === "branch_admin" || user.role === "reception"
      ? (user.location_id ?? undefined)
      : branchIdParam;

  const data = await getTrainerClassesTaught({ tenantId: user.tenant_id, branchId, trainerId, dateFrom, dateTo });
  return NextResponse.json(data);
}
