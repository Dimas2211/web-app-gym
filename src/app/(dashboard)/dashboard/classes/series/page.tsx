import Link from "next/link";
import { openGymAdminPage } from "@/modules/classes/scheduling/admin-page-context";
import { getClassSeriesList } from "@/modules/classes/admin-queries";
import { SESSION_KIND_LABELS } from "@/modules/classes/scheduling/scheduling-rules";
import { dateOnly } from "@/modules/classes/booking/booking-eligibility";
import { DAY_OF_WEEK_LABELS } from "@/lib/utils/labels";
import { StatusBadge } from "@/components/ui/status-badge";

// GYM-BOOKINGS 3A — series recurrentes (ClassSeries). SA: tenant; BA: su sede.
export default async function ClassSeriesListPage() {
  const opened = await openGymAdminPage("gym.classes");
  if (!opened.ok) return <div className="p-8 text-sm text-red-500">{opened.error}</div>;
  const { handle, scope } = opened;

  try {
    const { context } = handle;
    const series = await getClassSeriesList(context.client, context.tenantId, scope.locationId);

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Link href="/dashboard/classes" className="hover:text-zinc-800 transition-colors">
                Agenda
              </Link>
              <span>/</span>
              <span className="text-zinc-800 font-medium">Series recurrentes</span>
            </div>
            <h1 className="text-xl font-bold text-zinc-800 mt-1">Series recurrentes</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Plantillas semanales. Las sesiones se generan con una acción explícita desde cada serie.
            </p>
          </div>
          {!context.readOnly && (
            <Link
              href="/dashboard/classes/series/new"
              className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              + Nueva serie
            </Link>
          )}
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-x-auto">
          {series.length === 0 ? (
            <p className="p-6 text-sm text-zinc-400">No hay series registradas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Serie</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">Horario</th>
                  <th className="text-left px-4 py-3">Entrenador</th>
                  <th className="text-left px-4 py-3">Vigencia</th>
                  <th className="text-left px-4 py-3">Sesiones</th>
                  <th className="text-left px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {series.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/classes/series/${s.id}`} className="font-medium text-zinc-800 hover:underline">
                        {s.title}
                      </Link>
                      <p className="text-xs text-zinc-400">
                        {s.class_type.name} · {s.location.name}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{SESSION_KIND_LABELS[s.session_kind]}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {DAY_OF_WEEK_LABELS[s.weekday]} {s.start_time}–{s.end_time}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {s.trainer.first_name} {s.trainer.last_name}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {dateOnly(s.valid_from)} → {s.valid_until ? dateOnly(s.valid_until) : "sin fin"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{s._count.sessions}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  } finally {
    await handle.dispose();
  }
}
