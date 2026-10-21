import Link from "next/link";
import { notFound } from "next/navigation";
import { openGymAdminPage } from "@/modules/classes/scheduling/admin-page-context";
import { getClassSeriesDetail } from "@/modules/classes/admin-queries";
import {
  generateClassSeriesSessionsAction,
  toggleClassSeriesStatusAction,
  updateClassSeriesAction,
} from "@/modules/classes/series-actions";
import { loadGymBookingPolicy } from "@/modules/classes/booking/booking-service";
import { SESSION_KIND_LABELS } from "@/modules/classes/scheduling/scheduling-rules";
import { dateOnly } from "@/modules/classes/booking/booking-eligibility";
import { DAY_OF_WEEK_LABELS, CLASS_STATUS_LABELS } from "@/lib/utils/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import { ClassSeriesEditForm } from "@/components/forms/class-series-form";
import { ClassSeriesActionsPanel } from "@/components/forms/class-series-actions-panel";

type Props = { params: Promise<{ id: string }> };

export default async function ClassSeriesDetailPage({ params }: Props) {
  const { id } = await params;
  const opened = await openGymAdminPage("gym.classes");
  if (!opened.ok) return <div className="p-8 text-sm text-red-500">{opened.error}</div>;
  const { handle, scope } = opened;

  try {
    const { context } = handle;
    const [series, policy] = await Promise.all([
      getClassSeriesDetail(context.client, context.tenantId, scope.locationId, id),
      loadGymBookingPolicy(context.client, context.tenantId),
    ]);
    if (!series) notFound();
    const canEdit = !context.readOnly;

    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard/classes/series" className="hover:text-zinc-800 transition-colors">
            Series recurrentes
          </Link>
          <span>/</span>
          <span className="text-zinc-800 font-medium">{series.title}</span>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-zinc-800">{series.title}</h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                {SESSION_KIND_LABELS[series.session_kind]} · {series.class_type.name} · {series.location.name}
              </p>
            </div>
            <StatusBadge status={series.status} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-zinc-400">Horario</p>
              <p className="text-zinc-800 font-medium">
                {DAY_OF_WEEK_LABELS[series.weekday]} {series.start_time}–{series.end_time}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Entrenador</p>
              <p className="text-zinc-800 font-medium">
                {series.trainer.first_name} {series.trainer.last_name}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Vigencia</p>
              <p className="text-zinc-800 font-medium">
                {dateOnly(series.valid_from)} → {series.valid_until ? dateOnly(series.valid_until) : "sin fin"}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-400">Generada hasta</p>
              <p className="text-zinc-800 font-medium">
                {series.generated_until ? dateOnly(series.generated_until) : "—"}
              </p>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-3">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Generación</h2>
            <p className="text-xs text-zinc-500">
              Crea las sesiones de las próximas {policy.seriesGenerationWeeks} semana(s) según la configuración de
              reservas. Repetirla no duplica sesiones ni modifica las existentes; las fechas con conflicto (ausencia,
              disponibilidad o solapamiento) se omiten y se informan.
            </p>
            <ClassSeriesActionsPanel
              seriesId={series.id}
              isActive={series.status === "active"}
              weeks={policy.seriesGenerationWeeks}
              generateAction={generateClassSeriesSessionsAction}
              toggleAction={toggleClassSeriesStatusAction}
            />
          </div>
        )}

        {canEdit && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-3">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Editar plantilla</h2>
            <ClassSeriesEditForm
              action={updateClassSeriesAction}
              seriesId={series.id}
              defaultValues={{
                title: series.title,
                capacity: series.capacity,
                room_name: series.room_name,
                valid_until: series.valid_until ? dateOnly(series.valid_until) : null,
              }}
            />
          </div>
        )}

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Sesiones generadas (últimas {series.sessions.length})
          </h2>
          {series.sessions.length === 0 ? (
            <p className="text-sm text-zinc-400">Aún no se generaron sesiones.</p>
          ) : (
            <ul className="space-y-1.5">
              {series.sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 bg-zinc-50 rounded-lg px-3 py-2 text-sm">
                  <Link href={`/dashboard/classes/${s.id}`} className="text-zinc-700 hover:underline">
                    {dateOnly(s.class_date)} · {s.start_time}–{s.end_time}
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {CLASS_STATUS_LABELS[s.status]} · {s.booked_count}/{s.capacity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  } finally {
    await handle.dispose();
  }
}
