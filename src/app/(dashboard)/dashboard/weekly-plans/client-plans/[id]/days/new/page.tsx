import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClassViewer, canManageClientWeeklyPlan } from "@/lib/permissions/guards";
import { getClientWeeklyPlanById } from "@/modules/weekly-plans/queries";
import { addClientPlanDayAction } from "@/modules/weekly-plans/actions";
import { AddClientPlanDayForm } from "@/components/forms/add-client-plan-day-form";

type Props = { params: Promise<{ id: string }> };

export default async function NewClientPlanDayPage({ params }: Props) {
  const sessionUser = await requireClassViewer();
  const { id } = await params;

  const plan = await getClientWeeklyPlanById(id, sessionUser);
  if (!plan || !canManageClientWeeklyPlan(sessionUser, plan)) notFound();

  const usedWeekdays = plan.days.map((d) => d.weekday);

  if (usedWeekdays.length >= 7) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link
            href={`/dashboard/weekly-plans/client-plans/${id}`}
            className="hover:text-zinc-800"
          >
            Volver al plan
          </Link>
        </div>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg text-sm">
          Este plan ya tiene todos los días de la semana configurados.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard/weekly-plans/client-plans" className="hover:text-zinc-800">
          Planes de clientes
        </Link>
        <span>/</span>
        <Link
          href={`/dashboard/weekly-plans/client-plans/${id}`}
          className="hover:text-zinc-800"
        >
          {plan.client.first_name} {plan.client.last_name}
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">Añadir día</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-zinc-800">Añadir día al plan</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Plan de: {plan.client.first_name} {plan.client.last_name}
        </p>
      </div>

      <AddClientPlanDayForm
        planId={id}
        usedWeekdays={usedWeekdays}
        action={addClientPlanDayAction}
      />
    </div>
  );
}
