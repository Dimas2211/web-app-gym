import Link from "next/link";
import { notFound } from "next/navigation";
import {
  requireClassViewer,
  canManageClientWeeklyPlan,
} from "@/lib/permissions/guards";
import { getClientWeeklyPlanById } from "@/modules/weekly-plans/queries";
import {
  toggleClientPlanStatusAction,
  markClientPlanDayAction,
  addClientPlanDayAction,
} from "@/modules/weekly-plans/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { MarkDayForm } from "@/components/forms/client-weekly-plan-day-form";
import {
  DAY_OF_WEEK_LABELS,
  WEEK_DAYS_ORDER,
  EXECUTION_STATUS_LABELS,
  EXECUTION_STATUS_COLORS,
} from "@/lib/utils/labels";
import type { ExecutionStatus } from "@prisma/client";

type Props = { params: Promise<{ id: string }> };

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const inputCls =
  "w-full border border-zinc-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent";
const selectCls = inputCls + " bg-white";

export default async function ClientWeeklyPlanDetailPage({ params }: Props) {
  const sessionUser = await requireClassViewer();
  const { id } = await params;

  const plan = await getClientWeeklyPlanById(id, sessionUser);
  if (!plan) notFound();

  const canEdit = canManageClientWeeklyPlan(sessionUser, plan);

  const daysByWeekday = Object.fromEntries(plan.days.map((d) => [d.weekday, d]));
  const usedWeekdays = plan.days.map((d) => d.weekday);

  const completedCount = plan.days.filter(
    (d) => d.execution_status === "completed" || d.execution_status === "partial"
  ).length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb + acciones */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/weekly-plans/client-plans" className="hover:text-zinc-800">
            Planes de clientes
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">
            {plan.client.last_name}, {plan.client.first_name}
          </span>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/weekly-plans/client-plans/${id}/edit`}
              className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              Editar plan
            </Link>
            <form action={toggleClientPlanStatusAction}>
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  plan.status === "active"
                    ? "text-amber-700 border-amber-300 hover:bg-amber-50"
                    : "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                {plan.status === "active" ? "Desactivar" : "Activar"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Encabezado del plan */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-800">
              {plan.client.first_name} {plan.client.last_name}
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {formatDate(plan.start_date)} → {formatDate(plan.end_date)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={plan.status} />
            {plan.branch && (
              <span className="text-xs text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-full">
                {plan.branch.name}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-zinc-400">Plantilla base</p>
            <p className="text-zinc-700 font-medium mt-0.5">
              {plan.template?.name ?? (
                <span className="text-zinc-400 italic text-sm">Plan manual</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Entrenador</p>
            <p className="text-zinc-700 font-medium mt-0.5">
              {plan.trainer
                ? `${plan.trainer.first_name} ${plan.trainer.last_name}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Progreso</p>
            <p className="text-zinc-700 font-medium mt-0.5">
              {completedCount} / {plan.days.length} días
            </p>
          </div>
        </div>

        {plan.notes && (
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <p className="text-xs text-zinc-400">Notas</p>
            <p className="text-sm text-zinc-600 mt-1 whitespace-pre-wrap">{plan.notes}</p>
          </div>
        )}
      </div>

      {/* Días del plan */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Días del plan
          </h2>
          {canEdit && usedWeekdays.length < 7 && (
            <Link
              href={`/dashboard/weekly-plans/client-plans/${id}/days/new`}
              className="text-sm text-zinc-600 border border-zinc-300 px-3 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              + Añadir día
            </Link>
          )}
        </div>

        {plan.days.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-zinc-400">Este plan no tiene días configurados.</p>
            {canEdit && (
              <Link
                href={`/dashboard/weekly-plans/client-plans/${id}/days/new`}
                className="mt-3 inline-block text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50"
              >
                Añadir primer día
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {WEEK_DAYS_ORDER.map((weekday) => {
              const day = daysByWeekday[weekday];
              if (!day) return null;

              return (
                <div
                  key={weekday}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                      {DAY_OF_WEEK_LABELS[weekday]}
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                          EXECUTION_STATUS_COLORS[day.execution_status as ExecutionStatus]
                        }`}
                      >
                        {EXECUTION_STATUS_LABELS[day.execution_status as ExecutionStatus]}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    {day.session_name && (
                      <p className="text-sm font-medium text-zinc-800">{day.session_name}</p>
                    )}
                    {day.focus_area && (
                      <p className="text-xs text-zinc-500">{day.focus_area}</p>
                    )}
                    <p className="text-xs text-zinc-400">{day.duration_minutes} min</p>
                    {day.exercise_block && (
                      <p className="text-xs text-zinc-600 whitespace-pre-wrap font-mono mt-1 max-h-24 overflow-auto">
                        {day.exercise_block}
                      </p>
                    )}
                    {day.trainer_feedback && (
                      <div className="mt-2 pt-2 border-t border-zinc-200">
                        <p className="text-xs text-zinc-400">Entrenador:</p>
                        <p className="text-xs text-zinc-600">{day.trainer_feedback}</p>
                      </div>
                    )}
                    {day.client_feedback && (
                      <div className="mt-1">
                        <p className="text-xs text-zinc-400">Cliente:</p>
                        <p className="text-xs text-zinc-600">{day.client_feedback}</p>
                      </div>
                    )}
                  </div>

                  {canEdit && (
                    <div className="space-y-2 pt-2 border-t border-zinc-200">
                      {/* Marcación rápida */}
                      <MarkDayForm
                        dayId={day.id}
                        planId={id}
                        currentStatus={day.execution_status as ExecutionStatus}
                        markAction={markClientPlanDayAction}
                      />
                      {/* Editar día */}
                      <Link
                        href={`/dashboard/weekly-plans/client-plans/${id}/days/${day.id}/edit`}
                        className="block text-center text-xs text-zinc-500 hover:text-zinc-800 border border-zinc-200 px-2 py-1 rounded hover:bg-white transition-colors"
                      >
                        Editar contenido
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ficha del cliente */}
      <div className="flex items-center justify-between bg-zinc-50 rounded-xl border border-zinc-200 p-4">
        <p className="text-sm text-zinc-600">
          Ver ficha completa del cliente
        </p>
        <Link
          href={`/dashboard/clients/${plan.client.id}`}
          className="text-sm text-zinc-600 border border-zinc-300 px-3 py-1.5 rounded-lg hover:bg-white hover:border-zinc-400 transition-colors"
        >
          Ir a ficha del cliente →
        </Link>
      </div>
    </div>
  );
}
