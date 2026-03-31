import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { getSports } from "@/modules/settings/queries";
import { toggleSportStatusAction } from "@/modules/settings/actions";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function SportsPage() {
  await requireSuperAdmin();
  const sports = await getSports();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <Link href="/dashboard/settings" className="hover:text-zinc-800 transition-colors">
              Configuración
            </Link>
            <span>/</span>
            <span className="text-zinc-800 font-medium">Deportes</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-800">Deportes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {sports.length} deporte(s) en el catálogo global
          </p>
        </div>
        <Link
          href="/dashboard/settings/sports/new"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          + Nuevo deporte
        </Link>
      </div>

      {/* Tabla */}
      {sports.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
          <p className="text-zinc-400 text-sm">No hay deportes registrados.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Deporte
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden md:table-cell">
                    Descripción
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">
                    Clientes
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">
                    Plantillas
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Estado
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sports.map((sport) => (
                  <tr key={sport.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-800">{sport.name}</td>
                    <td className="px-4 py-3 text-zinc-500 hidden md:table-cell max-w-xs">
                      <span className="line-clamp-1">{sport.description ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className="text-zinc-600 font-medium">{sport._count.clients}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className="text-zinc-600 font-medium">
                        {sport._count.weekly_plan_templates}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sport.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/settings/sports/${sport.id}/edit`}
                          className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={toggleSportStatusAction}>
                          <input type="hidden" name="id" value={sport.id} />
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              sport.status === "active"
                                ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                                : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            }`}
                          >
                            {sport.status === "active" ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Nota informativa */}
      <p className="text-xs text-zinc-400">
        Los deportes son un catálogo global compartido por todos los gimnasios. Los cambios afectan
        a todos los entornos.
      </p>
    </div>
  );
}
