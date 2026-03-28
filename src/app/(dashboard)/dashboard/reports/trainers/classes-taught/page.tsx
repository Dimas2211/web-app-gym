import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { ClassesTaughtReport } from "./ClassesTaughtReport";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export default async function ClassesTaughtPage() {
  const user = await getSessionOrRedirect();
  if (!ALLOWED_ROLES.includes(user.role)) redirect("/dashboard/reports");

  const [branches, trainers] =
    user.role === "super_admin"
      ? await Promise.all([
          prisma.branch.findMany({
            where: { gym_id: user.gym_id, status: "active" },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          prisma.trainer.findMany({
            where: { gym_id: user.gym_id, status: "active" },
            select: { id: true, first_name: true, last_name: true },
            orderBy: { last_name: "asc" },
          }),
        ])
      : await Promise.all([
          Promise.resolve([]),
          prisma.trainer.findMany({
            where: { gym_id: user.gym_id, branch_id: user.branch_id ?? "", status: "active" },
            select: { id: true, first_name: true, last_name: true },
            orderBy: { last_name: "asc" },
          }),
        ]);

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto">
      <ReportPageHeader
        crumbs={[
          { label: "Reportes", href: "/dashboard/reports" },
          { label: "Entrenadores" },
          { label: "Clases impartidas" },
        ]}
        title="Clases impartidas por entrenador"
        description="Clases con estado completado, agrupadas por entrenador."
      />
      <ClassesTaughtReport
        branches={branches}
        trainers={trainers.map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name}` }))}
        isSuperAdmin={user.role === "super_admin"}
      />
    </main>
  );
}
