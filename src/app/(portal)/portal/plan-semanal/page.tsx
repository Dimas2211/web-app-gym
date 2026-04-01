import { requireClient } from "@/lib/permissions/guards";
import {
  getClientByUserId,
  getMyActivePlan,
  getMyPlans,
  getMyGeneralTemplates,
  hasActiveMembership,
  getLastExpiredMembership,
} from "@/modules/client-portal/queries";
import { PlanDayCard } from "./plan-day-card";

/**
 * Cuenta días hábiles (lun–vie) transcurridos desde `date` hasta hoy,
 * sin incluir el día de vencimiento (empieza a contar el día siguiente).
 */
function countBusinessDaysSince(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(date);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  let count = 0;
  while (cursor <= today) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

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
  const client = await getClientByUserId(sessionUser.id);

  if (!client) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-zinc-800">Mi plan semanal</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">Perfil de cliente no configurado.</p>
        </div>
      </div>
    );
  }

  const [activePlan, allPlans, hasMembership] = await Promise.all([
    getMyActivePlan(client.id),
    getMyPlans(client.id),
    hasActiveMembership(client.id),
  ]);

  // ── Regla de visibilidad de planes tras vencimiento ───────────
  // Si no hay membresía activa, verificar si pasaron 3+ días hábiles desde el vencimiento.
  let plansVisible = true;
  let expiredDate: string | null = null;

  if (!hasMembership) {
    const lastExpired = await getLastExpiredMembership(client.id);
    if (lastExpired) {
      expiredDate = new Date(lastExpired.end_date).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const businessDays = countBusinessDaysSince(new Date(lastExpired.end_date));
      if (businessDays >= 3) plansVisible = false;
    }
  }
  // ─────────────────────────────────────────────────────────────

  const generalTemplates = hasMembership
    ? await getMyGeneralTemplates(client)
    : [];

  const todayWeekday = new Date().getDay();

  const completedCount =
    activePlan?.days.filter((d) => d.execution_status === "completed").length ?? 0;

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
                    {completedCount}/{activePlan.days.length}
                  </p>
                  <p className="text-xs text-zinc-400">días completados</p>
                </div>
              </div>
            </div>

            {/* Días del plan */}
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
              {allPlans
                .filter((p) => p.id !== activePlan?.id)
                .map((plan) => {
                  const done = plan.days.filter(
                    (d) => d.execution_status === "completed"
                  ).length;
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
                        {done}/{plan.days.length} días
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
}
