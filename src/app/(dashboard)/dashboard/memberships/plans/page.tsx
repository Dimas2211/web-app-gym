import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { getMembershipPlans } from "@/modules/memberships/queries";
import { getBranchOptions } from "@/modules/branches/queries";
import { togglePlanStatusAction, deletePlanAction } from "@/modules/memberships/actions";
import { DeleteAuthorizationDialog } from "@/components/forms/delete-authorization-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { ACCESS_TYPE_LABELS } from "@/lib/utils/labels";
import type { Status } from "@prisma/client";

type SearchParams = Promise<{ search?: string; status?: string; branch_id?: string }>;

export default async function MembershipPlansPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sessionUser = await requireAdmin();
  const params = await searchParams;

  const plans = await getMembershipPlans(sessionUser, {
    search: params.search,
    status: params.status as Status | undefined,
    branch_id: params.branch_id,
  });

  const branches = await getBranchOptions(sessionUser);
  const showBranchFilter = sessionUser.role === "super_admin";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Planes de membresía</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{plans.length} plan(es)</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/memberships/client-memberships"
            className="text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            Ver membresías de clientes
          </Link>
          <Link
            href="/dashboard/memberships/plans/new"
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            + Nuevo plan
          </Link>
        </div>
      </div>

      {/* Filtros simples */}
      <div className="flex flex-wrap gap-3">
        <form className="flex flex-wrap gap-3 flex-1">
          <input
            name="search"
            type="search"
            placeholder="Buscar por nombre o código..."
            defaultValue={params.search ?? ""}
            className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-w-[220px] flex-1"
          />
          {showBranchFilter && (
            <select
              name="branch_id"
              defaultValue={params.branch_id ?? ""}
              className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="">Todas las sucursales</option>
              <option value="global">Global (sin sucursal)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">Activos e inactivos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <button
            type="submit"
            className="bg-zinc-100 border border-zinc-300 text-zinc-700 px-4 py-2 rounded-lg text-sm hover:bg-zinc-200 transition-colors"
          >
            Filtrar
          </button>
        </form>
      </div>

      {/* Tabla */}
      {plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
          <p className="text-zinc-400 text-sm">No hay planes de membresía registrados.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Plan
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden md:table-cell">
                    Duración
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Precio
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">
                    Acceso
                  </th>
                  {showBranchFilter && (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden lg:table-cell">
                      Sucursal
                    </th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">
                    Asignaciones
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
                {plans.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-800">{p.name}</p>
                      {p.code && (
                        <p className="text-xs text-zinc-400 font-mono mt-0.5">{p.code}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 hidden md:table-cell">
                      {p.duration_days} días
                      {p.sessions_limit && (
                        <span className="text-zinc-400 ml-1">· {p.sessions_limit} ses.</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-zinc-800">
                      ${Number(p.price).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-zinc-500">
                        {ACCESS_TYPE_LABELS[p.access_type]}
                      </span>
                    </td>
                    {showBranchFilter && (
                      <td className="px-4 py-3 text-zinc-500 text-xs hidden lg:table-cell">
                        {p.branch?.name ?? "— Global"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">
                      {p._count.client_memberships}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/memberships/plans/${p.id}/edit`}
                          className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={togglePlanStatusAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              p.status === "active"
                                ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                                : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            }`}
                          >
                            {p.status === "active" ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                        <DeleteAuthorizationDialog
                          entityLabel={`el plan "${p.name}"`}
                          userRole={sessionUser.role}
                          hiddenFields={{ id: p.id }}
                          action={deletePlanAction}
                        />
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
