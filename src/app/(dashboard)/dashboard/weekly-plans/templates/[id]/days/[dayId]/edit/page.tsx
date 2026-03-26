import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageWeeklyPlanTemplate } from "@/lib/permissions/guards";
import { getWeeklyPlanTemplateById } from "@/modules/weekly-plans/queries";
import { upsertTemplateDayAction } from "@/modules/weekly-plans/actions";
import { WeeklyPlanTemplateDayForm } from "@/components/forms/weekly-plan-template-day-form";

type Props = { params: Promise<{ id: string; dayId: string }> };

export default async function EditTemplateDayPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id, dayId } = await params;

  const template = await getWeeklyPlanTemplateById(id, sessionUser);
  if (!template || !canManageWeeklyPlanTemplate(sessionUser, template)) notFound();

  const day = template.days.find((d) => d.id === dayId);
  if (!day) notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/weekly-plans/templates" className="hover:text-zinc-800">
          Plantillas
        </Link>
        <span>/</span>
        <Link href={`/dashboard/weekly-plans/templates/${id}`} className="hover:text-zinc-800">
          {template.name}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Editar día</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-zinc-800">Editar día de plantilla</h1>
        <p className="text-sm text-zinc-500 mt-1">Plantilla: {template.name}</p>
      </div>

      <WeeklyPlanTemplateDayForm
        templateId={id}
        action={upsertTemplateDayAction}
        defaultValues={{
          weekday: day.weekday,
          session_name: day.session_name,
          focus_area: day.focus_area,
          duration_minutes: day.duration_minutes,
          exercise_block: day.exercise_block,
          trainer_notes: day.trainer_notes,
        }}
        usedWeekdays={[]}
        isEdit
      />
    </div>
  );
}
