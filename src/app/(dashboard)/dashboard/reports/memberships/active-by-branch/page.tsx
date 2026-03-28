import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { ActiveMembershipsByBranchReport } from "./ActiveMembershipsByBranchReport";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export default async function ActiveMembershipsByBranchPage() {
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
          { label: "Activas por sucursal" },
        ]}
        title="Membresías activas por sucursal"
        description="Cantidad y valor total de membresías actualmente activas, agrupadas por sucursal."
      />
      <ActiveMembershipsByBranchReport
        branches={branches}
        isSuperAdmin={user.role === "super_admin"}
      />
    </main>
  );
}
