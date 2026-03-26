import Link from "next/link";
import { requireClassViewer } from "@/lib/permissions/guards";
import { getClientWeeklyPlans } from "@/modules/weekly-plans/queries";
import { toggleClientPlanStatusAction } from "@/modules/weekly-plans/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Status } from "@prisma/client";

type SearchParams = Promise<{
  search?: string;
  status?: string;
  trainer_id?: string;
  client_id?: string;
}>;

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ClientWeeklyPlansPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionUser = await requireClassViewer();
  const sp = await searchParams;

  const plans = await getClientWeeklyPlans(sessionUser, {
    search: sp.search,
    status: sp.status as Status | undefined,
    trainer_id: sp.trainer_id,
    client_id: sp.client_id,
  });

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Planes semanales de clientes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Planes de entrenamiento asignados a clientes.
          </p>
        </div>
        <Link
          href="/dashboard/weekly-plans/client-plans/new"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          + Asignar plan
        </Link>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <input
          name="search"
          type="search"
          placeholder="Buscar cliente…"
          defaultValue={sp.search ?? ""}
          className="border border-zinc-300 rounded-lg px-3.5 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="suspended">Suspendido</option>
        </select>
        <button
          type="submit"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-zinc-800 transition-colors"
        >
          Filtrar
        </button>
        <Link
          href="/dashboard/weekly-plans/client-plans"
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Limpiar
        </Link>
      </form>

      {/* Lista */}
      {plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <p className="text-zinc-400 text-sm">No se encontraron planes.</p>
          <Link
            href="/dashboard/weekly-plans/client-plans/new"
            className="mt-3 inline-block text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50"
          >
            Asignar primer plan
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
                    Cliente
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Plantilla
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Entrenador
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Periodo
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Días
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Estado
                  </th>
                  <th className="text-right px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {plans.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/dashboard/weekly-plans/client-plans/${p.id}`}
                        className="font-medium text-zinc-800 hover:text-zinc-600"
                      >
                        {p.client.last_name}, {p.client.first_name}
                      </Link>
                      {p.client.email && (
                        <p className="text-xs text-zinc-400 mt-0.5">{p.client.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-600">
                      {p.template?.name ?? (
                        <span className="text-zinc-400 italic text-xs">Manual</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-600">
                      {p.trainer
                        ? `${p.trainer.last_name}, ${p.trainer.first_name}`
                        : <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-500 text-xs">
                      {formatDate(p.start_date)} → {formatDate(p.end_date)}
                    </td>
                    <td className="px-4 py-3.5 text-center text-zinc-600 font-medium">
                      {p._count.days}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/weekly-plans/client-plans/${p.id}`}
                          className="text-xs text-zinc-500 hover:text-zinc-800 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Ver
                        </Link>
                        <Link
                          href={`/dashboard/weekly-plans/client-plans/${p.id}/edit`}
                          className="text-xs text-zinc-500 hover:text-zinc-800 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={toggleClientPlanStatusAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              p.status === "active"
                                ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {p.status === "active" ? "Desactivar" : "Activar"}
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
            {plans.map((p) => (
              <div key={p.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/dashboard/weekly-plans/client-plans/${p.id}`}
                    className="font-medium text-zinc-800"
                  >
                    {p.client.last_name}, {p.client.first_name}
                  </Link>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-xs text-zinc-500">
                  {formatDate(p.start_date)} → {formatDate(p.end_date)}
                </p>
                {p.trainer && (
                  <p className="text-xs text-zinc-500">
                    Entrenador: {p.trainer.first_name} {p.trainer.last_name}
                  </p>
                )}
                <div className="flex gap-2">
                  <Link
                    href={`/dashboard/weekly-plans/client-plans/${p.id}`}
                    className="text-xs text-zinc-600 border border-zinc-200 px-2.5 py-1 rounded hover:bg-zinc-50"
                  >
                    Ver
                  </Link>
                  <Link
                    href={`/dashboard/weekly-plans/client-plans/${p.id}/edit`}
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

      <p className="text-xs text-zinc-400">{plans.length} plan(es) encontrado(s).</p>
    </div>
  );
}
