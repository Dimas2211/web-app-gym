import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { AttendanceByPeriodReport } from "./AttendanceByPeriodReport";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";
import { requireEffectiveVertical } from "@/modules/platform/runtime/effective-vertical";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception", "trainer"];

export default async function AttendanceByPeriodPage() {
  const user = await getSessionOrRedirect();
  if (!ALLOWED_ROLES.includes(user.role)) redirect("/dashboard/reports");

  // PASO 6D: tenant/PrismaClient EFECTIVOS bajo sesión runtime "Operar como cliente".
  const { context, dispose } = await resolveEffectiveTenantContext(user);
  const db = context.client ?? prisma;

  try {
    // PASO 6F: reporte GYM — requiere la vertical efectiva GYM.
    await requireEffectiveVertical(context.tenantId, "GYM");

    const branches =
      user.role === "super_admin"
        ? await db.branch.findMany({
            where: { tenant_id: context.tenantId, status: "active" },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : [];

    return (
      <main className="p-4 md:p-8 max-w-6xl mx-auto">
        <ReportPageHeader
          crumbs={[
            { label: "Reportes", href: "/dashboard/reports" },
            { label: "Asistencia" },
            { label: "Por período" },
          ]}
          title="Asistencia por período"
          description="Resumen de asistencia a clases agrupado por día y detalle por sesión."
        />
        <AttendanceByPeriodReport branches={branches} isSuperAdmin={user.role === "super_admin"} />
      </main>
    );
  } finally {
    await dispose();
  }
}
