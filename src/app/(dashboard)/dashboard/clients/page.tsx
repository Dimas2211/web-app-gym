import Link from "next/link";
import { Suspense } from "react";
import { requireClientManager } from "@/lib/permissions/guards";
import { getClients, getGoalOptions, getSportOptions } from "@/modules/clients/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import { toggleClientStatusAction } from "@/modules/clients/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ClientFilters } from "@/components/ui/client-filters";
import type { Status } from "@prisma/client";

type SearchParams = Promise<{
  search?: string;
  status?: string;
  branch_id?: string;
  goal_id?: string;
  sport_id?: string;
  trainer_id?: string;
}>;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionUser = await requireClientManager();
  const params = await searchParams;

  const filters = {
    search: params.search,
    status: params.status as Status | undefined,
    branch_id: params.branch_id,
    goal_id: params.goal_id,
    sport_id: params.sport_id,
    trainer_id: params.trainer_id,
  };

  const [clients, branches, goals, sports] = await Promise.all([
    getClients(sessionUser, filters),
    getBranchOptions(sessionUser),
    getGoalOptions(),
    getSportOptions(),
  ]);

  const showBranchFilter = sessionUser.role === "super_admin";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Clientes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{clients.length} cliente(s) encontrado(s)</p>
        </div>
        <Link
          href="/dashboard/clients/new"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          + Nuevo cliente
        </Link>
      </div>

      {/* Filtros */}
      <Suspense>
        <ClientFilters
          branches={branches}
          goals={goals}
          sports={sports}
          showBranchFilter={showBranchFilter}
        />
      </Suspense>

      {/* Tabla */}
      {clients.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
          <p className="text-zinc-400 text-sm">No hay clientes que coincidan con los filtros.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Nombre
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden md:table-cell">
                    Contacto
                  </th>
                  {showBranchFilter && (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden lg:table-cell">
                      Sucursal
                    </th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">
                    Meta / Deporte
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
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/clients/${c.id}`}
                        className="font-medium text-zinc-800 hover:text-zinc-900 hover:underline"
                      >
                        {c.first_name} {c.last_name}
                      </Link>
                      {c.document_id && (
                        <p className="text-xs text-zinc-400 mt-0.5">{c.document_id}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-zinc-600">{c.email ?? "—"}</p>
                      <p className="text-xs text-zinc-400">{c.phone ?? ""}</p>
                    </td>
                    {showBranchFilter && (
                      <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell">
                        {c.branch.name}
                      </td>
                    )}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-zinc-600 text-xs">{c.goal?.name ?? "—"}</p>
                      <p className="text-zinc-400 text-xs">{c.sport?.name ?? ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/clients/${c.id}`}
                          className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Ver
                        </Link>
                        <Link
                          href={`/dashboard/clients/${c.id}/edit`}
                          className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={toggleClientStatusAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              c.status === "active"
                                ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                                : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            }`}
                          >
                            {c.status === "active" ? "Desactivar" : "Activar"}
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
