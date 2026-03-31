import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions/guards";
import { getGoals } from "@/modules/settings/queries";
import { toggleGoalStatusAction } from "@/modules/settings/actions";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function GoalsPage() {
  await requireSuperAdmin();
  const goals = await getGoals();

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
            <span className="text-zinc-800 font-medium">Metas</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-800">Metas de entrenamiento</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {goals.length} meta(s) en el catálogo global
          </p>
        </div>
        <Link
          href="/dashboard/settings/goals/new"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          + Nueva meta
        </Link>
      </div>

      {/* Tabla */}
      {goals.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
          <p className="text-zinc-400 text-sm">No hay metas registradas.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Meta
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
                {goals.map((goal) => (
                  <tr key={goal.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-800">{goal.name}</td>
                    <td className="px-4 py-3 text-zinc-500 hidden md:table-cell max-w-xs">
                      <span className="line-clamp-1">{goal.description ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className="text-zinc-600 font-medium">{goal._count.clients}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className="text-zinc-600 font-medium">
                        {goal._count.weekly_plan_templates}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={goal.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/settings/goals/${goal.id}/edit`}
                          className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={toggleGoalStatusAction}>
                          <input type="hidden" name="id" value={goal.id} />
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              goal.status === "active"
                                ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                                : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            }`}
                          >
                            {goal.status === "active" ? "Desactivar" : "Activar"}
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
        Las metas son un catálogo global compartido por todos los gimnasios. Los cambios afectan a
        todos los entornos.
      </p>
    </div>
  );
}
