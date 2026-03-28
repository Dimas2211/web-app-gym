import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { ActiveClientsReport } from "./ActiveClientsReport";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export default async function ActiveClientsPage() {
  const user = await getSessionOrRedirect();
  if (!ALLOWED_ROLES.includes(user.role)) redirect("/dashboard/reports");

  const [branches, plans] = await Promise.all([
    user.role === "super_admin"
      ? prisma.branch.findMany({
          where: { gym_id: user.gym_id, status: "active" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.membershipPlan.findMany({
      where: { gym_id: user.gym_id, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <main className="p-4 md:p-8 max-w-6xl mx-auto">
      <ReportPageHeader
        crumbs={[
          { label: "Reportes", href: "/dashboard/reports" },
          { label: "Clientes" },
          { label: "Activos" },
        ]}
        title="Clientes activos"
        description="Listado de clientes con estado activo en el sistema."
      />
      <ActiveClientsReport branches={branches} plans={plans} isSuperAdmin={user.role === "super_admin"} />
    </main>
  );
}
