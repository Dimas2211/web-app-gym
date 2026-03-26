import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { getBranches } from "@/modules/branches/queries";
import { toggleBranchStatusAction } from "@/modules/branches/actions";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function BranchesPage() {
  const user = await requireAdmin();
  const branches = await getBranches(user);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Sucursales</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{branches.length} sucursal(es) registrada(s)</p>
        </div>
        {user.role === "super_admin" && (
          <Link
            href="/dashboard/branches/new"
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            + Nueva sucursal
          </Link>
        )}
      </div>

      {/* Tabla */}
      {branches.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
          <p className="text-zinc-400 text-sm">No hay sucursales registradas.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Sucursal
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden md:table-cell">
                    Dirección
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">
                    Teléfono
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">
                    Usuarios
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
                {branches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-800">{branch.name}</td>
                    <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">
                      {branch.address ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">
                      {branch.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className="text-zinc-600 font-medium">{branch._count.users}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={branch.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/branches/${branch.id}/edit`}
                          className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={toggleBranchStatusAction}>
                          <input type="hidden" name="id" value={branch.id} />
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              branch.status === "active"
                                ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                                : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            }`}
                          >
                            {branch.status === "active" ? "Desactivar" : "Activar"}
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
