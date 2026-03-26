import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClassViewer, canManageClientWeeklyPlan } from "@/lib/permissions/guards";
import { getClientWeeklyPlanById } from "@/modules/weekly-plans/queries";
import { updateClientPlanDayAction } from "@/modules/weekly-plans/actions";
import { ClientWeeklyPlanDayForm } from "@/components/forms/client-weekly-plan-day-form";
import { DAY_OF_WEEK_LABELS } from "@/lib/utils/labels";

type Props = { params: Promise<{ id: string; dayId: string }> };

export default async function EditClientPlanDayPage({ params }: Props) {
  const sessionUser = await requireClassViewer();
  const { id, dayId } = await params;

  const plan = await getClientWeeklyPlanById(id, sessionUser);
  if (!plan || !canManageClientWeeklyPlan(sessionUser, plan)) notFound();

  const day = plan.days.find((d) => d.id === dayId);
  if (!day) notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/weekly-plans/client-plans" className="hover:text-zinc-800">
          Planes de clientes
        </Link>
        <span>/</span>
        <Link href={`/dashboard/weekly-plans/client-plans/${id}`} className="hover:text-zinc-800">
          {plan.client.first_name} {plan.client.last_name}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">
          Editar — {DAY_OF_WEEK_LABELS[day.weekday]}
        </span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-zinc-800">
          Editar día: {DAY_OF_WEEK_LABELS[day.weekday]}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Modifica el contenido del día sin alterar la plantilla original.
        </p>
      </div>

      <ClientWeeklyPlanDayForm
        dayId={dayId}
        planId={id}
        action={updateClientPlanDayAction}
        defaultValues={{
          session_name: day.session_name,
          focus_area: day.focus_area,
          duration_minutes: day.duration_minutes,
          exercise_block: day.exercise_block,
          trainer_feedback: day.trainer_feedback,
          client_feedback: day.client_feedback,
        }}
      />
    </div>
  );
}
