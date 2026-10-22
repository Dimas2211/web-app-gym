import { requireClient } from "@/lib/permissions/guards";
import {
  getMyActivePlan,
  getMyPlans,
  getMyGeneralTemplates,
  hasActiveMembership,
  getLastExpiredMembership,
} from "@/modules/client-portal/queries";
import { PlanDayCard } from "./plan-day-card";
import { PlanExecutionReport, type OccurrenceItemData } from "./plan-execution-report";
import { openPortalContext } from "@/modules/client-portal/portal-context";
import { PortalAccessNotice } from "../portal-access-notice";
import { plansVisibleForMembership } from "@/modules/client-portal/plan-visibility";
import { resolveGymClock } from "@/modules/weekly-plans/gym-clock";
import { loadPlanTracking } from "@/modules/weekly-plans/training-tracking-queries";
import { CLIENT_REPORT_WINDOW_DAYS, addDays, weekdayOf } from "@/modules/weekly-plans/training-tracking-rules";
import { prisma } from "@/lib/db/prisma";

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const WEEKDAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export default async function PlanSemanalPage() {
  const sessionUser = await requireClient();

  // Auditoría GYM-5A H02: rol LIVE = client, módulo gym.weekly_plans y Client
  // resuelto con el tenant del contexto (nunca solo por user_id) ANTES de leer
  // cualquier dato personal.
  const access = await openPortalContext(sessionUser, { module: "gym.weekly_plans" });
  if (!access.ok) {
    const denied =
      access.reason === "MODULE_DISABLED"
        ? { ...access, message: "Esta sección no está disponible en tu gimnasio." }
        : access;
    return <PortalAccessNotice title="Mi plan semanal" denied={denied} />;
  }
  const { context, client, dispose } = access;

  try {
    // "Hoy" = fecha local del gimnasio (zona IANA). Sin zona válida se conserva el
    // comportamiento anterior (día del servidor) y NO se permite reportar por fecha.
    const db = context.client ?? prisma;
    const clock = await resolveGymClock(db, context.tenantId);
    const todayIso = clock?.today;

    const [activePlan, allPlans, hasMembership] = await Promise.all([
      getMyActivePlan(client.id, context.client, todayIso),
      getMyPlans(client.id, context.client),
      hasActiveMembership(client.id, context.client, todayIso),
    ]);

    // ── Regla de visibilidad de planes tras vencimiento ───────────
    // Si no hay membresía activa, verificar si pasaron 3+ días hábiles desde el vencimiento.
    let plansVisible = true;
    let expiredDate: string | null = null;

    if (!hasMembership) {
      const lastExpired = await getLastExpiredMembership(client.id, context.client, todayIso);
      if (lastExpired) {
        expiredDate = new Date(lastExpired.end_date).toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
        const fallbackToday = new Date();
        const today =
          todayIso ??
          `${fallbackToday.getFullYear()}-${String(fallbackToday.getMonth() + 1).padStart(2, "0")}-${String(fallbackToday.getDate()).padStart(2, "0")}`;
        plansVisible = plansVisibleForMembership({
          hasActiveMembership: false,
          lastExpiredEnd: lastExpired.end_date.toISOString().slice(0, 10),
          today,
        });
      }
    }
    // ─────────────────────────────────────────────────────────────

    // Seguimiento por fecha del plan vigente (audiencia CLIENT: sin notas privadas).
    const tracking =
      clock && activePlan && plansVisible
        ? await loadPlanTracking(db, {
            tenantId: context.tenantId,
            planId: activePlan.id,
            today: clock.today,
            audience: "CLIENT",
            includeSessions: false,
          })
        : null;
    const reportFrom = clock ? addDays(clock.today, -CLIENT_REPORT_WINDOW_DAYS) : null;
    const occurrenceItems: OccurrenceItemData[] = (tracking?.occurrences ?? []).slice(0, 30).map((o) => ({
      dayId: o.dayId,
      date: o.date,
      dateLabel: `${WEEKDAY_NAMES[o.weekday]} ${o.date}`,
      title: o.sessionName ?? o.focusArea ?? "Sesión del plan",
      isToday: o.date === clock?.today,
      reportable: activePlan?.status === "active" && reportFrom !== null && o.date >= reportFrom && !o.execution?.trainerStatus,
      clientStatus: o.execution?.clientStatus ?? null,
      clientComment: o.execution?.clientComment ?? null,
      trainerStatus: o.execution?.trainerStatus ?? null,
      trainerFeedback: o.execution?.trainerFeedback ?? null,
      attendanceClassTitle: o.execution?.attendance?.stillValid ? o.execution.attendance.classTitle : null,
    }));

    // Historial: resumen por plan anterior desde las ejecuciones por fecha.
    const pastPlans = allPlans.filter((p) => p.id !== activePlan?.id).slice(0, 5);
    const pastSummaries = new Map<string, { completed: number; scheduled: number }>();
    if (clock) {
      for (const pp of pastPlans) {
        const t = await loadPlanTracking(db, { tenantId: context.tenantId, planId: pp.id, today: clock.today, audience: "CLIENT", includeSessions: false });
        if (t) pastSummaries.set(pp.id, { completed: t.summary.completed, scheduled: t.summary.scheduled });
      }
    }

    const generalTemplates = hasMembership
      ? await getMyGeneralTemplates(client, context.client)
      : [];

  const todayWeekday = clock ? weekdayOf(clock.today) : new Date().getDay();

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-zinc-800">Mi plan semanal</h1>

      {/* Aviso de planes bloqueados (membresía caducada > 3 días hábiles) */}
      {!plansVisible && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-800 font-semibold">Planes no disponibles</p>
          <p className="text-sm text-red-700 mt-1">
            Tu membresía venció el {expiredDate} y han pasado más de 3 días hábiles sin renovación.
            Acércate a recepción para reactivar tu acceso.
          </p>
        </div>
      )}

      {/* ── PROGRAMACIÓN PERSONALIZADA ─────────────────────────── */}
      {plansVisible && <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-zinc-700">
            Programación personalizada
          </h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">
            Asignada a ti
          </span>
        </div>

        {activePlan ? (
          <div className="space-y-4">
            {/* Header del plan */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-zinc-800">
                    {activePlan.template?.name ?? "Plan personalizado"}
                  </p>
                  {activePlan.template?.description && (
                    <p className="text-sm text-zinc-500 mt-0.5">
                      {activePlan.template.description}
                    </p>
                  )}
                  <p className="text-xs text-zinc-400 mt-1">
                    {formatDate(activePlan.start_date)} –{" "}
                    {formatDate(activePlan.end_date)}
                    {activePlan.trainer && (
                      <>
                        {" "}
                        · Entrenador: {activePlan.trainer.first_name}{" "}
                        {activePlan.trainer.last_name}
                      </>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-black text-zinc-800">
                    {tracking ? `${tracking.summary.completed}/${tracking.summary.scheduled}` : "—"}
                  </p>
                  <p className="text-xs text-zinc-400">entrenamientos completados</p>
                </div>
              </div>
            </div>

            {/* Días programados del plan (solo lectura) */}
            <div className="space-y-3">
              {activePlan.days.map((day) => (
                <PlanDayCard
                  key={day.id}
                  day={day}
                  weekdayName={WEEKDAY_NAMES[day.weekday]}
                  isToday={day.weekday === todayWeekday}
                />
              ))}
            </div>

            {/* Mis entrenamientos por fecha */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-700">Mis entrenamientos por fecha</h3>
              {!clock ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  El registro por fecha aún no está disponible: tu gimnasio debe configurar su zona horaria.
                </p>
              ) : (
                <>
                  <p className="text-xs text-zinc-500">
                    Lo que reportas es un autorreporte; tu entrenador lo revisa y la asistencia a clases se confirma por separado.
                    Puedes reportar los últimos {CLIENT_REPORT_WINDOW_DAYS} días.
                  </p>
                  <PlanExecutionReport items={occurrenceItems} />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 text-center">
            <p className="text-zinc-600 font-medium">
              No tienes un plan semanal personalizado activo.
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Tu entrenador o el equipo del gimnasio pueden asignarte uno.
            </p>
          </div>
        )}

        {/* Historial de planes personalizados */}
        {allPlans.length > 1 && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
              Planes anteriores
            </p>
            <ul className="divide-y divide-zinc-100">
              {pastPlans.map((plan) => {
                  const sum = pastSummaries.get(plan.id);
                  return (
                    <li
                      key={plan.id}
                      className="py-2.5 flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-800">
                          {plan.template?.name ?? "Plan personalizado"}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {formatDate(plan.start_date)} –{" "}
                          {formatDate(plan.end_date)}
                        </p>
                      </div>
                      <span className="text-xs text-zinc-500 shrink-0">
                        {sum ? `${sum.completed}/${sum.scheduled} completados` : "—"}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </section>}

      {/* ── PROGRAMACIÓN GENERAL ───────────────────────────────── */}
      {plansVisible && <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-zinc-700">
            Programación general
          </h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700">
            Según tu perfil
          </span>
        </div>

        {!hasMembership ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-amber-800 font-medium">
              Membresía requerida
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Necesitas una membresía activa y vigente para acceder a la
              programación general del gimnasio.
            </p>
          </div>
        ) : generalTemplates.length > 0 ? (
          <div className="space-y-4">
            {generalTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-sky-50 border border-sky-200 rounded-xl overflow-hidden"
              >
                {/* Header de la plantilla */}
                <div className="px-5 py-4 border-b border-sky-100">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold text-zinc-800">
                        {template.name}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {template.target_sport && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                            {template.target_sport.name}
                          </span>
                        )}
                        {template.target_goal && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                            {template.target_goal.name}
                          </span>
                        )}
                        {!template.target_sport && !template.target_goal && (
                          <span className="text-xs text-zinc-400">
                            Programa general
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-sky-600 shrink-0">
                      {template.days.length} día
                      {template.days.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {/* Días de la plantilla (solo lectura) */}
                {template.days.length > 0 ? (
                  <ul className="divide-y divide-sky-100">
                    {template.days.map((day) => (
                      <li key={day.id}>
                        <details className="group">
                          <summary className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer hover:bg-sky-100/60 transition-colors list-none">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border ${
                                  day.weekday === todayWeekday
                                    ? "bg-sky-200 border-sky-400 text-sky-800"
                                    : "bg-white border-sky-200 text-sky-700"
                                }`}
                              >
                                {WEEKDAY_NAMES[day.weekday].slice(0, 3)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-zinc-800 truncate">
                                  {day.session_name ??
                                    WEEKDAY_NAMES[day.weekday]}
                                </p>
                                {day.focus_area && (
                                  <p className="text-xs text-zinc-500 truncate">
                                    {day.focus_area}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-zinc-400">
                                {day.duration_minutes} min
                              </span>
                              {day.weekday === todayWeekday && (
                                <span className="text-xs bg-sky-200 text-sky-800 font-semibold px-1.5 py-0.5 rounded">
                                  Hoy
                                </span>
                              )}
                              <span className="text-zinc-400 text-xs group-open:rotate-90 transition-transform inline-block">
                                ▶
                              </span>
                            </div>
                          </summary>

                          {day.exercise_block && (
                            <div className="px-5 pb-4 pt-1">
                              <pre className="text-xs text-zinc-600 whitespace-pre-wrap font-sans bg-white rounded-lg border border-sky-100 p-3">
                                {day.exercise_block}
                              </pre>
                              {day.trainer_notes && (
                                <p className="mt-2 text-xs text-sky-700 bg-sky-100 rounded-lg px-3 py-2">
                                  <span className="font-semibold">Notas: </span>
                                  {day.trainer_notes}
                                </p>
                              )}
                            </div>
                          )}
                        </details>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-4 text-sm text-zinc-500">
                    Esta plantilla aún no tiene días definidos.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 text-center">
            <p className="text-zinc-600 font-medium">
              No hay programación general disponible para tu perfil.
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              El equipo del gimnasio puede publicar programas según tu
              deporte, meta o nivel.
            </p>
          </div>
        )}
      </section>}
    </div>
    );
  } finally {
    await dispose();
  }
}
