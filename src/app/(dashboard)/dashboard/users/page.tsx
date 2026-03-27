import Link from "next/link";
import { requireAdmin } from "@/lib/permissions/guards";
import { getAdminUsers } from "@/modules/users/queries";
import { toggleUserStatusAction, deleteUserAction } from "@/modules/users/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/utils/roles";
import { DeleteAuthorizationDialog } from "@/components/forms/delete-authorization-dialog";

export default async function UsersPage() {
  const user = await requireAdmin();
  const users = await getAdminUsers(user);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Usuarios</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{users.length} usuario(s) registrado(s)</p>
        </div>
        <Link
          href="/dashboard/users/new"
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          + Nuevo usuario
        </Link>
      </div>

      {/* Tabla */}
      {users.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
          <p className="text-zinc-400 text-sm">No hay usuarios registrados.</p>
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
                    Correo
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Rol
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">
                    Sucursal
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
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-800">
                        {u.first_name} {u.last_name}
                      </p>
                      {/* Email visible en móvil */}
                      <p className="text-xs text-zinc-400 mt-0.5 md:hidden">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role]}`}
                      >
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">
                      {u.branch?.name ?? "— (global)"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {u.role === "trainer" && (
                          u.trainer_profile ? (
                            <Link
                              href={`/dashboard/trainers/${u.trainer_profile.id}`}
                              className="text-xs text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded border border-blue-200 hover:border-blue-400 transition-colors"
                            >
                              Perfil
                            </Link>
                          ) : (
                            <span className="text-xs text-amber-600 px-2.5 py-1 rounded border border-amber-200">
                              Sin perfil
                            </span>
                          )
                        )}
                        <Link
                          href={`/dashboard/users/${u.id}/edit`}
                          className="text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition-colors"
                        >
                          Editar
                        </Link>
                        {u.id !== user.id && (
                          <>
                            <form action={toggleUserStatusAction}>
                              <input type="hidden" name="id" value={u.id} />
                              <button
                                type="submit"
                                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                                  u.status === "active"
                                    ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                                    : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                }`}
                              >
                                {u.status === "active" ? "Desactivar" : "Activar"}
                              </button>
                            </form>
                            <DeleteAuthorizationDialog
                              entityLabel={`al usuario ${u.first_name} ${u.last_name}`}
                              userRole={user.role}
                              hiddenFields={{ id: u.id }}
                              action={deleteUserAction}
                            />
                          </>
                        )}
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
