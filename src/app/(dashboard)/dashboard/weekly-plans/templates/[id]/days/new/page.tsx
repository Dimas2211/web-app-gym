import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, canManageWeeklyPlanTemplate } from "@/lib/permissions/guards";
import { getWeeklyPlanTemplateById } from "@/modules/weekly-plans/queries";
import { upsertTemplateDayAction } from "@/modules/weekly-plans/actions";
import { WeeklyPlanTemplateDayForm } from "@/components/forms/weekly-plan-template-day-form";

type Props = { params: Promise<{ id: string }> };

export default async function NewTemplateDayPage({ params }: Props) {
  const sessionUser = await requireAdmin();
  const { id } = await params;

  const template = await getWeeklyPlanTemplateById(id, sessionUser);
  if (!template || !canManageWeeklyPlanTemplate(sessionUser, template)) notFound();

  const usedWeekdays = template.days.map((d) => d.weekday);

  if (usedWeekdays.length >= 7) {
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
        </div>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg text-sm">
          Esta plantilla ya tiene todos los días de la semana configurados.
        </div>
      </div>
    );
  }

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
        <span className="text-zinc-800 font-medium">Añadir día</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-zinc-800">Añadir día a plantilla</h1>
        <p className="text-sm text-zinc-500 mt-1">Plantilla: {template.name}</p>
      </div>

      <WeeklyPlanTemplateDayForm
        templateId={id}
        action={upsertTemplateDayAction}
        usedWeekdays={usedWeekdays}
      />
    </div>
  );
}
