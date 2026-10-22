import Link from "next/link";
import { notFound } from "next/navigation";
import {
  requireClassViewer,
  canManageClientWeeklyPlan,
} from "@/lib/permissions/guards";
import { getClientWeeklyPlanById } from "@/modules/weekly-plans/queries";
import { toggleClientPlanStatusAction } from "@/modules/weekly-plans/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ExecutionRow } from "@/components/forms/plan-execution-forms";
import { DAY_OF_WEEK_LABELS, WEEK_DAYS_ORDER, EXECUTION_STATUS_LABELS, EXECUTION_STATUS_COLORS } from "@/lib/utils/labels";
import type { ExecutionStatus } from "@prisma/client";
import {
  hasOrganizationModule,
  requireOrganizationModule,
  resolveCommercialEnforcementContext,
} from "@/modules/platform/runtime/commercial-enforcement";
import { resolveEffectiveTenantContext } from "@/modules/platform/runtime/effective-tenant-context";
import { resolveLiveClassViewer } from "@/modules/classes/trainer/trainer-access";
import { PLAN_TRAINING_ROLES } from "@/modules/weekly-plans/plan-access";
import { resolveGymClock, TIMEZONE_NOT_CONFIGURED_MESSAGE } from "@/modules/weekly-plans/gym-clock";
import { loadPlanTracking } from "@/modules/weekly-plans/training-tracking-queries";
import { COMPLIANCE_FORMULA } from "@/modules/weekly-plans/training-tracking-rules";
import { prisma } from "@/lib/db/prisma";

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

  // PASO 6D: tenant/PrismaClient EFECTIVOS bajo sesión runtime "Operar como
  // cliente". El guard corre ANTES de buscar el registro; la búsqueda usa
  // context.client, con lo que un ID de otro tenant nunca puede resolverse.
  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);

  try {
    await requireOrganizationModule(context.tenantId, "gym.weekly_plans");

    // GYM-5A: rol y sede LIVE para leer y autorizar (nunca los del JWT).
    const live = await resolveLiveClassViewer(sessionUser, context);
    if (!live.ok) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">{live.message}</div>
      );
    }
    const viewer = live.user;

    const plan = await getClientWeeklyPlanById(id, viewer, context.client);
    if (!plan) notFound();

    // canEdit se fuerza a false en modo runtime: la sesión es siempre solo lectura.
    const canEdit = !context.runtime && canManageClientWeeklyPlan(viewer, plan);
    const trainingRole = PLAN_TRAINING_ROLES.has(viewer.role);

    const daysByWeekday = Object.fromEntries(plan.days.map((d) => [d.weekday, d]));
    const usedWeekdays = plan.days.map((d) => d.weekday);

    // Seguimiento por fecha (GYM-5A): hoy = fecha local del gimnasio.
    const db = context.client ?? prisma;
    const clock = await resolveGymClock(db, context.tenantId);
    const commercial = await resolveCommercialEnforcementContext(context.tenantId);
    const classesEnabled = hasOrganizationModule(commercial, "gym.classes");
    const tracking = clock
      ? await loadPlanTracking(db, {
          tenantId: context.tenantId,
          planId: plan.id,
          today: clock.today,
          audience: "STAFF",
          includeSessions: classesEnabled && trainingRole,
        })
      : null;
    const canRecord = canEdit && trainingRole && clock !== null;

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
            {plan.assignment_type === "segmented" ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                Asignación segmentada
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-500">
                Asignación individual
              </span>
            )}
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
            <p className="text-xs text-zinc-400">Cumplimiento</p>
            <p className="text-zinc-700 font-medium mt-0.5">
              {tracking?.summary.compliancePct != null ? `${tracking.summary.compliancePct}%` : "—"}
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
                    {day.execution_status !== "pending" && (
                      <span
                        title="Registro anterior a la ejecución por fecha (dato heredado)"
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                          EXECUTION_STATUS_COLORS[day.execution_status as ExecutionStatus]
                        }`}
                      >
                        Heredado: {EXECUTION_STATUS_LABELS[day.execution_status as ExecutionStatus]}
                      </span>
                    )}
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

      {/* Seguimiento por fecha (GYM-5A) */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Seguimiento por fecha</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Plan = lo programado · Ejecución = lo registrado en cada fecha · Asistencia = lo confirmado en clases. El
            autorreporte del alumno no equivale a asistencia verificada.
          </p>
        </div>

        {!clock && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            {TIMEZONE_NOT_CONFIGURED_MESSAGE}
          </div>
        )}

        {tracking && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              {[
                ["Programados", tracking.summary.scheduled],
                ["Completados", tracking.summary.completed],
                ["Parciales", tracking.summary.partial],
                ["Omitidos", tracking.summary.skipped],
                ["Pendientes", tracking.summary.pending],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg bg-zinc-50 border border-zinc-100 py-2">
                  <p className="text-lg font-bold text-zinc-800">{value}</p>
                  <p className="text-xs text-zinc-400">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              {tracking.summary.compliancePct != null ? `Cumplimiento: ${tracking.summary.compliancePct}%. ` : "Sin entrenamientos vencidos todavía. "}
              {COMPLIANCE_FORMULA}.
              {tracking.summary.selfReportedOnly > 0 && ` ${tracking.summary.selfReportedOnly} registro(s) solo con autorreporte (no verificado).`}
              {tracking.distinctActivities != null && ` Actividades distintas registradas en clases: ${tracking.distinctActivities}.`}
            </p>

            {tracking.occurrences.length === 0 ? (
              <p className="text-sm text-zinc-400">Aún no hay entrenamientos vencidos en el período del plan.</p>
            ) : (
              <ul className="space-y-2">
                {tracking.occurrences.slice(0, 40).map((o) => (
                  <ExecutionRow
                    key={`${o.dayId}-${o.date}`}
                    row={{
                      planId: plan.id,
                      dayId: o.dayId,
                      date: o.date,
                      dateLabel: `${DAY_OF_WEEK_LABELS[o.weekday]} ${o.date}`,
                      title: o.sessionName ?? o.focusArea ?? "Sesión del plan",
                      execution: o.execution
                        ? {
                            revision: o.execution.revision,
                            clientStatus: o.execution.clientStatus,
                            clientComment: o.execution.clientComment,
                            trainerStatus: o.execution.trainerStatus,
                            trainerFeedback: o.execution.trainerFeedback,
                            attendance: o.execution.attendance
                              ? {
                                  attendanceId: o.execution.attendance.attendanceId,
                                  stillValid: o.execution.attendance.stillValid,
                                  classTitle: o.execution.attendance.classTitle,
                                }
                              : null,
                          }
                        : null,
                      linkable: (tracking.sessions ?? [])
                        .filter((x) => x.date === o.date && x.linkedExecutionId === null)
                        .map((x) => ({ attendanceId: x.attendanceId, title: x.title })),
                      canRecord,
                    }}
                  />
                ))}
              </ul>
            )}

            {tracking.sessions && (
              <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                  Clases a las que asistió en el período
                </h3>
                {tracking.sessions.length === 0 ? (
                  <p className="text-sm text-zinc-400">Sin asistencias confirmadas en el período.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 text-sm">
                    {tracking.sessions.slice(0, 30).map((x) => (
                      <li key={x.attendanceId} className="py-2">
                        <p className="font-medium text-zinc-800">
                          {x.date} · {x.title}
                          {x.linkedExecutionId && <span className="ml-2 text-xs text-emerald-700">vinculada a una ejecución</span>}
                        </p>
                        {(x.commonActivities.length > 0 || x.individualActivities.length > 0) && (
                          <p className="text-xs text-zinc-500">
                            {x.commonActivities.length > 0 && <>Comunes: {x.commonActivities.join(", ")}. </>}
                            {x.individualActivities.length > 0 && <>Individuales: {x.individualActivities.join(", ")}.</>}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
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
  } finally {
    await dispose();
  }
}
