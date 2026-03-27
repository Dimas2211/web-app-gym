import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { getTrainers } from "@/modules/trainers/queries";
import { toggleTrainerStatusAction, deleteTrainerAction } from "@/modules/trainers/actions";
import { DeleteAuthorizationDialog } from "@/components/forms/delete-authorization-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Status } from "@prisma/client";

type Props = {
  searchParams: Promise<{ search?: string; status?: string; branch_id?: string }>;
};

export default async function TrainersPage({ searchParams }: Props) {
  const sessionUser = await requireAdmin();
  const sp = await searchParams;

  const trainers = await getTrainers(sessionUser, {
    search: sp.search,
    status: sp.status as Status | undefined,
    branch_id: sp.branch_id,
  });

  const isBranchAdmin = sessionUser.role === "branch_admin";

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Entrenadores</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {trainers.length} entrenador{trainers.length !== 1 ? "es" : ""} encontrado
            {trainers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/dashboard/users/new"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          + Nuevo entrenador
        </Link>
      </div>

      {/* Filtros */}
      <form method="get" className="flex flex-wrap gap-3">
        <input
          type="text"
          name="search"
          defaultValue={sp.search ?? ""}
          placeholder="Buscar por nombre, email, especialidad..."
          className="border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 w-full sm:w-72"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="suspended">Suspendido</option>
        </select>
        <button
          type="submit"
          className="bg-zinc-100 border border-zinc-300 text-zinc-700 px-4 py-2 rounded-lg text-sm hover:bg-zinc-200 transition-colors"
        >
          Filtrar
        </button>
        {(sp.search || sp.status || sp.branch_id) && (
          <Link
            href="/dashboard/trainers"
            className="text-sm text-zinc-500 px-4 py-2 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            Limpiar
          </Link>
        )}
      </form>

      {/* Tabla */}
      {trainers.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-10 text-center">
          <p className="text-zinc-400 text-sm">No se encontraron entrenadores.</p>
          <Link
            href="/dashboard/users/new"
            className="inline-block mt-4 text-sm text-zinc-600 border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Registrar primer entrenador
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3">
                    Entrenador
                  </th>
                  <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                    Especialidad
                  </th>
                  {!isBranchAdmin && (
                    <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3 hidden md:table-cell">
                      Sucursal
                    </th>
                  )}
                  <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">
                    Cuenta vinculada
                  </th>
                  <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3">
                    Estado
                  </th>
                  <th className="text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide px-4 py-3">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {trainers.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/trainers/${t.id}`}
                        className="font-medium text-zinc-800 hover:text-zinc-600 transition-colors"
                      >
                        {t.first_name} {t.last_name}
                      </Link>
                      {t.email && (
                        <p className="text-xs text-zinc-400 mt-0.5">{t.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 hidden sm:table-cell">
                      {t.specialty || <span className="text-zinc-300">—</span>}
                    </td>
                    {!isBranchAdmin && (
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-full">
                          {t.branch.name}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {t.user ? (
                        <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {t.user.email}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-300">Sin cuenta</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/trainers/${t.id}`}
                          className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Ver
                        </Link>
                        <Link
                          href={`/dashboard/trainers/${t.id}/edit`}
                          className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        <form action={toggleTrainerStatusAction}>
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
                        <DeleteAuthorizationDialog
                          entityLabel={`al entrenador ${t.first_name} ${t.last_name}`}
                          userRole={sessionUser.role}
                          hiddenFields={{ id: t.id }}
                          action={deleteTrainerAction}
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
