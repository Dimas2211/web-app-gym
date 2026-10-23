import { requireClient } from "@/lib/permissions/guards";
import { openPortalContext } from "@/modules/client-portal/portal-context";
import { resolveGymClock } from "@/modules/weekly-plans/gym-clock";
import { loadPortalProgress, loadProgressGoal } from "@/modules/client-portal/progress-queries";
import { parseProgressRange, PROGRESS_RANGES } from "@/modules/client-portal/progress-rules";
import { formatCalendarDate } from "@/modules/client-portal/portal-schedule";
import { PortalAccessNotice } from "../portal-access-notice";
import {
  AttendanceSection,
  EvolutionSection,
  GoalSection,
  PlansSection,
  RangeSelector,
  SummarySection,
} from "./progress-sections";

// GYM-5B — "Mi progreso" del alumno. Lectura autorizada con openPortalContext:
// runtime efectivo, módulo gym.weekly_plans (FAIL CLOSED antes de consultar
// tablas de GYM-5A), rol LIVE client y Client desde la sesión + tenant. El
// único parámetro del navegador es el período (lista blanca); nunca un id.
// gym.classes es independiente: apagado ⇒ no se consulta asistencia ni se
// muestra como cero. La política de visibilidad de planes por membresía es
// la misma de /portal/plan-semanal.

type SearchParams = Promise<{ periodo?: string }>;

const TITLE = "Mi progreso";

export default async function ProgresoPage({ searchParams }: { searchParams: SearchParams }) {
  const sessionUser = await requireClient();
  const params = await searchParams;
  const range = parseProgressRange(params.periodo);

  const access = await openPortalContext(sessionUser, { module: "gym.weekly_plans", optionalModules: ["gym.classes"] });
  if (!access.ok) {
    const denied =
      access.reason === "MODULE_DISABLED" ? { ...access, message: "Esta sección no está disponible en tu gimnasio." } : access;
    return <PortalAccessNotice title={TITLE} denied={denied} />;
  }
  const { context, client, modules, dispose } = access;

  try {
    const db = context.client;
    const [clock, goal] = await Promise.all([resolveGymClock(db, context.tenantId), loadProgressGoal(db, client)]);

    if (!clock) {
      return (
        <div className="space-y-6">
          <h1 className="text-xl font-bold text-zinc-800">{TITLE}</h1>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Sin datos suficientes: tu gimnasio debe configurar su zona horaria para calcular tu progreso por fecha.
          </p>
          <GoalSection goal={goal} feedback={null} />
        </div>
      );
    }

    const progress = await loadPortalProgress({
      db,
      tenantId: context.tenantId,
      gymId: context.gymId,
      clientId: client.id,
      today: clock.today,
      timezone: clock.timezone,
      range,
      includeClasses: modules["gym.classes"] === true,
    });
    const rangeLabel = PROGRESS_RANGES[range].label;
    const { training } = progress;

    return (
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-zinc-800">{TITLE}</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Datos al {formatCalendarDate(progress.today, { day: "2-digit", month: "long", year: "numeric" })} (fecha de tu
              gimnasio).
            </p>
          </div>
          <RangeSelector current={range} />
        </div>

        {progress.plansHiddenByMembership && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <p className="text-red-800 font-semibold">Planes no disponibles</p>
            <p className="text-sm text-red-700 mt-1">
              Tu membresía venció el{" "}
              {formatCalendarDate(progress.plansHiddenByMembership.expiredOn, { day: "2-digit", month: "short", year: "numeric" })} y
              han pasado más de 3 días hábiles sin renovación. Acércate a recepción para reactivar tu acceso.
            </p>
          </div>
        )}

        {training?.trackingUnavailable && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            El seguimiento por fecha aún no está disponible en tu gimnasio.
          </p>
        )}

        {training && !training.trackingUnavailable && (
          <div className="grid gap-6 lg:grid-cols-2">
            <SummarySection
              summary={training.summary}
              rangeLabel={rangeLabel}
              trackingStart={training.trackingStart}
              incomplete={training.incomplete}
            />
            <EvolutionSection buckets={progress.buckets} perBucket={training.perBucket} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {progress.attendance ? (
            <AttendanceSection
              frequency={progress.attendance.frequency}
              recent={progress.attendance.recent}
              buckets={progress.buckets}
              rangeLabel={rangeLabel}
              incomplete={progress.attendance.incomplete}
            />
          ) : null}
          {training && !training.trackingUnavailable && <PlansSection plans={training.plans} />}
          <GoalSection goal={goal} feedback={training && !training.trackingUnavailable ? training.feedback : null} />
        </div>
      </div>
    );
  } finally {
    await dispose();
  }
}
