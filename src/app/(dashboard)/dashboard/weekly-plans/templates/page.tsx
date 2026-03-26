import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { getWeeklyPlanTemplates } from "@/modules/weekly-plans/queries";
import { toggleTemplateStatusAction } from "@/modules/weekly-plans/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  PLAN_LEVEL_LABELS,
  PLAN_LEVEL_COLORS,
  GENDER_LABELS,
} from "@/lib/utils/labels";
import type { PlanLevel, Gender, Status } from "@prisma/client";

type SearchParams = Promise<{
  search?: string;
  status?: string;
  target_level?: string;
}>;

export default async function WeeklyPlanTemplatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionUser = await requireAdmin();
  const sp = await searchParams;

  const templates = await getWeeklyPlanTemplates(sessionUser, {
    search: sp.search,
    status: sp.status as Status | undefined,
    target_level: sp.target_level,
  });

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Plantillas de plan semanal</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Gestiona las plantillas reutilizables para planes semanales de entrenamiento.
          </p>
        </div>
        <Link
          href="/dashboard/weekly-plans/templates/new"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          + Nueva plantilla
        </Link>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <input
          name="search"
          type="search"
          placeholder="Buscar por nombre o código…"
          defaultValue={sp.search ?? ""}
          className="border border-zinc-300 rounded-lg px-3.5 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activa</option>
          <option value="inactive">Inactiva</option>
        </select>
        <select
          name="target_level"
          defaultValue={sp.target_level ?? ""}
          className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">Todos los niveles</option>
          <option value="beginner">Principiante</option>
          <option value="intermediate">Intermedio</option>
          <option value="advanced">Avanzado</option>
        </select>
        <button
          type="submit"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-800 transition-colors"
        >
          Filtrar
        </button>
        <Link
          href="/dashboard/weekly-plans/templates"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Limpiar
        </Link>
      </form>

      {/* Tabla */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <p className="text-zinc-400 text-sm">No se encontraron plantillas.</p>
          <Link
            href="/dashboard/weekly-plans/templates/new"
            className="mt-3 inline-block text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Crear primera plantilla
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          {/* Escritorio */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Plantilla
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Segmentación
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Días
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Sucursal
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Estado
                  </th>
                  <th className="text-right px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/dashboard/weekly-plans/templates/${t.id}`}
                        className="font-medium text-zinc-800 hover:text-zinc-600"
                      >
                        {t.name}
                      </Link>
                      {t.code && (
                        <span className="ml-2 text-xs text-zinc-400">({t.code})</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {t.target_level && (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              PLAN_LEVEL_COLORS[t.target_level as PlanLevel]
                            }`}
                          >
                            {PLAN_LEVEL_LABELS[t.target_level as PlanLevel]}
                          </span>
                        )}
                        {t.target_gender && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-zinc-100 text-zinc-600">
                            {GENDER_LABELS[t.target_gender as Gender]}
                          </span>
                        )}
                        {t.target_sport && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                            {t.target_sport.name}
                          </span>
                        )}
                        {t.target_goal && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
                            {t.target_goal.name}
                          </span>
                        )}
                        {!t.target_level && !t.target_gender && !t.target_sport && !t.target_goal && (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-zinc-600 font-medium">{t._count.days}</span>
                    </td>
                    <td className="px-4 py-3.5 text-zinc-500">
                      {t.branch?.name ?? (
                        <span className="text-xs text-zinc-400 italic">Global</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/weekly-plans/templates/${t.id}`}
                          className="text-xs text-zinc-500 hover:text-zinc-800 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Ver
                        </Link>
                        <Link
                          href={`/dashboard/weekly-plans/templates/${t.id}/edit`}
                          className="text-xs text-zinc-500 hover:text-zinc-800 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={toggleTemplateStatusAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              t.status === "active"
                                ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {t.status === "active" ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil */}
          <div className="md:hidden divide-y divide-zinc-100">
            {templates.map((t) => (
              <div key={t.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/dashboard/weekly-plans/templates/${t.id}`}
                    className="font-medium text-zinc-800"
                  >
                    {t.name}
                    {t.code && (
                      <span className="ml-2 text-xs text-zinc-400">({t.code})</span>
                    )}
                  </Link>
                  <StatusBadge status={t.status} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {t.target_level && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        PLAN_LEVEL_COLORS[t.target_level as PlanLevel]
                      }`}
                    >
                      {PLAN_LEVEL_LABELS[t.target_level as PlanLevel]}
                    </span>
                  )}
                  {t._count.days > 0 && (
                    <span className="text-xs text-zinc-500">{t._count.days} días</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/dashboard/weekly-plans/templates/${t.id}`}
                    className="text-xs text-zinc-600 border border-zinc-200 px-2.5 py-1 rounded hover:bg-zinc-50"
                  >
                    Ver
                  </Link>
                  <Link
                    href={`/dashboard/weekly-plans/templates/${t.id}/edit`}
                    className="text-xs text-zinc-600 border border-zinc-200 px-2.5 py-1 rounded hover:bg-zinc-50"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-400">{templates.length} plantilla(s) encontrada(s).</p>
    </div>
  );
}
