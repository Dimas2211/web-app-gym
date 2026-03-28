import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { ExpiringMembershipsReport } from "./ExpiringMembershipsReport";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export default async function ExpiringMembershipsPage() {
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
    <main className="p-4 md:p-8 max-w-5xl mx-auto">
      <ReportPageHeader
        crumbs={[
          { label: "Reportes", href: "/dashboard/reports" },
          { label: "Membresías" },
          { label: "Por vencer" },
        ]}
        title="Membresías por vencer"
        description="Membresías activas próximas a expirar en el período seleccionado."
      />
      <ExpiringMembershipsReport
        branches={branches}
        isSuperAdmin={user.role === "super_admin"}
      />
    </main>
  );
}
