import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageWeeklyPlanTemplate } from "@/lib/permissions/guards";
import { getWeeklyPlanTemplateById, getSportOptions, getGoalOptions } from "@/modules/weekly-plans/queries";
import { updateTemplateAction } from "@/modules/weekly-plans/actions";
import { WeeklyPlanTemplateForm } from "@/components/forms/weekly-plan-template-form";
import { prisma } from "@/lib/db/prisma";

type Props = { params: Promise<{ id: string }> };

export default async function EditWeeklyPlanTemplatePage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const [template, sports, goals, branches] = await Promise.all([
    getWeeklyPlanTemplateById(id, sessionUser),
    getSportOptions(),
    getGoalOptions(),
    prisma.branch.findMany({
      where: { gym_id: sessionUser.gym_id, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!template || !canManageWeeklyPlanTemplate(sessionUser, template)) notFound();

  const fixedBranchId =
    sessionUser.role === "branch_admin" ? sessionUser.branch_id : undefined;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/weekly-plans/templates" className="hover:text-zinc-800">
          Plantillas
        </Link>
        <span>/</span>
        <Link
          href={`/dashboard/weekly-plans/templates/${id}`}
          className="hover:text-zinc-800"
        >
          {template.name}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Editar</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-zinc-800">Editar plantilla</h1>
      </div>

      <WeeklyPlanTemplateForm
        action={updateTemplateAction}
        defaultValues={{
          id: template.id,
          code: template.code,
          name: template.name,
          description: template.description,
          branch_id: template.branch_id,
          target_gender: template.target_gender,
          target_sport_id: template.target_sport_id,
          target_goal_id: template.target_goal_id,
          target_level: template.target_level,
        }}
        branches={branches}
        sports={sports}
        goals={goals}
        fixedBranchId={fixedBranchId}
        isEdit
      />
    </div>
  );
}
