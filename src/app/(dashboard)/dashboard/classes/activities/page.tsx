import Link from "next/link";
import { openGymAdminPage } from "@/modules/classes/scheduling/admin-page-context";
import { getGymActivities } from "@/modules/classes/admin-queries";
import { scopeCoversLocation } from "@/modules/classes/scheduling/admin-support";
import { toggleGymActivityStatusAction } from "@/modules/classes/activities-actions";
import { StatusBadge } from "@/components/ui/status-badge";

type Props = { searchParams: Promise<{ location?: string }> };

// GYM-BOOKINGS 3A — catálogo de actividades (GymActivity). No es la rutina
// semanal: es el catálogo que usarán las sesiones/asistencias (Etapa 4).
export default async function GymActivitiesPage({ searchParams }: Props) {
  const { location } = await searchParams;
  const opened = await openGymAdminPage("gym.classes");
  if (!opened.ok) return <div className="p-8 text-sm text-red-500">{opened.error}</div>;
  const { handle, scope } = opened;

  try {
    const { context } = handle;
    const [activities, branches] = await Promise.all([
      getGymActivities(context.client, context.tenantId, scope.locationId, {
        location: location === "global" ? "global" : location || undefined,
      }),
      context.client.branch.findMany({
        where: { tenant_id: context.tenantId, ...(scope.locationId ? { id: scope.locationId } : {}) },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const canWrite = !context.readOnly;

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Link href="/dashboard/classes" className="hover:text-zinc-800 transition-colors">
                Agenda
              </Link>
              <span>/</span>
              <span className="text-zinc-800 font-medium">Actividades</span>
            </div>
            <h1 className="text-xl font-bold text-zinc-800 mt-1">Catálogo de actividades</h1>
          </div>
          {canWrite && (
            <Link
              href="/dashboard/classes/activities/new"
              className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              + Nueva actividad
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Link
            href="/dashboard/classes/activities"
            className={`px-3 py-1.5 rounded-lg border ${!location ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300 text-zinc-600"}`}
          >
            Todas
          </Link>
          <Link
            href="/dashboard/classes/activities?location=global"
            className={`px-3 py-1.5 rounded-lg border ${location === "global" ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300 text-zinc-600"}`}
          >
            Todas las sedes
          </Link>
          {branches.map((b) => (
            <Link
              key={b.id}
              href={`/dashboard/classes/activities?location=${b.id}`}
              className={`px-3 py-1.5 rounded-lg border ${location === b.id ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300 text-zinc-600"}`}
            >
              {b.name}
            </Link>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-x-auto">
          {activities.length === 0 ? (
            <p className="p-6 text-sm text-zinc-400">No hay actividades registradas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Orden</th>
                  <th className="text-left px-4 py-3">Actividad</th>
                  <th className="text-left px-4 py-3">Sucursal</th>
                  <th className="text-left px-4 py-3">Usos</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {activities.map((a) => {
                  const manageable = canWrite && scopeCoversLocation(scope, a.location_id);
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-3 text-zinc-500">{a.sort_order}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-800">{a.name}</p>
                        {a.code && <p className="text-xs font-mono text-zinc-400">{a.code}</p>}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{a.location?.name ?? "Todas"}</td>
                      <td className="px-4 py-3 text-zinc-600">
                        {a._count.session_activities + a._count.attendance_activities}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {manageable && (
                          <span className="inline-flex items-center gap-3">
                            <Link href={`/dashboard/classes/activities/${a.id}/edit`} className="text-xs text-zinc-600 hover:text-zinc-900">
                              Editar
                            </Link>
                            <form action={toggleGymActivityStatusAction}>
                              <input type="hidden" name="id" value={a.id} />
                              <button type="submit" className="text-xs text-amber-700 hover:text-amber-900">
                                {a.status === "active" ? "Desactivar" : "Activar"}
                              </button>
                            </form>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
