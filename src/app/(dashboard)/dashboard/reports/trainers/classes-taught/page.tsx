import { redirect } from "next/navigation";
import { getSessionOrRedirect } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { ReportPageHeader } from "@/components/reports/ReportPageHeader";
import { ClassesTaughtReport } from "./ClassesTaughtReport";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";
import { requireEffectiveVertical } from "@/modules/platform/runtime/effective-vertical";
import { resolveOptionalGymForTenant } from "@/modules/platform/lib/provisioning/resolve-optional-gym-for-tenant";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export default async function ClassesTaughtPage() {
  const user = await getSessionOrRedirect();
  if (!ALLOWED_ROLES.includes(user.role)) redirect("/dashboard/reports");

  // PASO 6D: tenant/PrismaClient EFECTIVOS bajo sesión runtime "Operar como
  // cliente" — los selectores de sucursal/entrenador nunca deben leerse
  // desde el prisma singleton del super_admin cuando hay runtime activo.
  const { context, dispose } = await resolveEffectiveTenantContext(user);
  const effectiveTenantId = context.tenantId;
  const db = context.client ?? prisma;

  try {
    // PASO 6F: reporte GYM — requiere la vertical efectiva GYM.
    await requireEffectiveVertical(context.tenantId, "GYM");

    const gymId = await resolveOptionalGymForTenant(db, effectiveTenantId);

    const [branches, trainers] = !gymId
      ? [[], []]
      : user.role === "super_admin"
        ? await Promise.all([
            db.branch.findMany({
              where: { tenant_id: effectiveTenantId, status: "active" },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            }),
            db.trainer.findMany({
              where: { gym_id: gymId, status: "active" },
              select: { id: true, first_name: true, last_name: true },
              orderBy: { last_name: "asc" },
            }),
          ])
        : await Promise.all([
            Promise.resolve([]),
            db.trainer.findMany({
              where: { gym_id: gymId, branch_id: user.location_id ?? "", status: "active" },
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
  } finally {
    await dispose();
  }
}
