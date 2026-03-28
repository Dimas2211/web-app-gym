import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { AttendanceByPeriodReport } from "./AttendanceByPeriodReport";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception", "trainer"];

export default async function AttendanceByPeriodPage() {
  const user = await getSessionOrRedirect();
  if (!ALLOWED_ROLES.includes(user.role)) redirect("/dashboard/reports");

  const branches =
    user.role === "super_admin"
      ? await prisma.branch.findMany({
          where: { gym_id: user.gym_id, status: "active" },
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
}
