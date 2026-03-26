import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { getClassTypes } from "@/modules/classes/queries";
import { toggleClassTypeStatusAction } from "@/modules/classes/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Status } from "@prisma/client";

type Props = {
  searchParams: Promise<{ search?: string; status?: string }>;
};

export default async function ClassTypesPage({ searchParams }: Props) {
  const sessionUser = await requireAdmin();
  const sp = await searchParams;

  const types = await getClassTypes(sessionUser, {
    search: sp.search,
    status: sp.status as Status | undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Tipos de clase</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Catálogo de tipos de clase del gimnasio
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/classes"
            className="text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            ← Agenda
          </Link>
          <Link
            href="/dashboard/classes/types/new"
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            + Nuevo tipo
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <form method="get" className="flex flex-wrap gap-3">
        <input
          type="text"
          name="search"
          defaultValue={sp.search ?? ""}
          placeholder="Buscar por nombre o código..."
          className="border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 w-full sm:w-64"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </select>
        <button
          type="submit"
          className="bg-zinc-100 border border-zinc-300 text-zinc-700 px-4 py-2 rounded-lg text-sm hover:bg-zinc-200 transition-colors"
        >
          Filtrar
        </button>
        {(sp.search || sp.status) && (
          <Link href="/dashboard/classes/types" className="text-sm text-zinc-500 px-4 py-2 rounded-lg hover:bg-zinc-100">
            Limpiar
          </Link>
        )}
      </form>

      {types.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-10 text-center">
          <p className="text-zinc-400 text-sm">No se encontraron tipos de clase.</p>
          <Link
            href="/dashboard/classes/types/new"
            className="inline-block mt-4 text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Crear primer tipo de clase
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3">Nombre</th>
                  <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">Código</th>
                  <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Duración</th>
                  <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Capacidad</th>
                  <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3">Estado</th>
                  <th className="text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {types.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-800">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-xs">{t.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">
                      {t.code || <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 hidden md:table-cell">
                      {t.default_duration_minutes ? `${t.default_duration_minutes} min` : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 hidden md:table-cell">
                      {t.capacity_default ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/classes/types/${t.id}/edit`}
                          className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={toggleClassTypeStatusAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              t.status === "active"
                                ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                                : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
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
        </div>
      )}
    </div>
  );
}
