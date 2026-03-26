import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { getSportOptions, getGoalOptions } from "@/modules/weekly-plans/queries";
import { createTemplateAction } from "@/modules/weekly-plans/actions";
import { WeeklyPlanTemplateForm } from "@/components/forms/weekly-plan-template-form";
import { prisma } from "@/lib/db/prisma";

export default async function NewWeeklyPlanTemplatePage() {
  const sessionUser = await requireAdmin();

  const [sports, goals, branches] = await Promise.all([
    getSportOptions(),
    getGoalOptions(),
    prisma.branch.findMany({
      where: { gym_id: sessionUser.gym_id, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const fixedBranchId =
    sessionUser.role === "branch_admin" ? sessionUser.branch_id : undefined;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/weekly-plans/templates" className="hover:text-zinc-800">
          Plantillas
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Nueva plantilla</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-zinc-800">Nueva plantilla de plan semanal</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Crea una plantilla reutilizable para asignar a clientes.
        </p>
      </div>

      <WeeklyPlanTemplateForm
        action={createTemplateAction}
        branches={branches}
        sports={sports}
        goals={goals}
        fixedBranchId={fixedBranchId}
      />
    </div>
  );
}
