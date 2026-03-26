import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/utils/roles";

const MODULES = [
  { label: "Sucursales", href: "/dashboard/branches", roles: ["super_admin"] },
  { label: "Usuarios", href: "/dashboard/users", roles: ["super_admin", "branch_admin"] },
  { label: "Clientes", href: "/dashboard/clients", roles: ["super_admin", "branch_admin", "reception"] },
  { label: "Membresías", href: "/dashboard/memberships/client-memberships", roles: ["super_admin", "branch_admin", "reception"] },
  { label: "Entrenadores", href: "/dashboard/trainers", roles: ["super_admin", "branch_admin"] },
  { label: "Agenda", href: "/dashboard/classes", roles: ["super_admin", "branch_admin", "reception", "trainer"] },
  { label: "Planes semanales", href: "/dashboard/weekly-plans/client-plans", roles: ["super_admin", "branch_admin", "reception", "trainer"] },
  { label: "Inventario", href: "/dashboard/inventory", roles: ["super_admin", "branch_admin"] },
  { label: "Ventas", href: "/dashboard/sales", roles: ["super_admin", "branch_admin", "reception"] },
  { label: "Reportes", href: "/dashboard/reports", roles: ["super_admin", "branch_admin"] },
];

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;

  const visibleModules = MODULES.filter((m) => m.roles.includes(user.role));

  return (
    <div className="space-y-6">
      {/* Bienvenida */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-800">
            Bienvenido, {user.name?.split(" ")[0]}
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            {new Date().toLocaleDateString("es-MX", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${ROLE_COLORS[user.role]}`}>
          {ROLE_LABELS[user.role]}
        </span>
      </div>

      {/* Info de sesión */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Sesión activa
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-zinc-400">Correo</p>
            <p className="text-sm text-zinc-800 font-medium truncate">{user.email}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Sucursal</p>
            <p className="text-sm text-zinc-800 font-medium">
              {user.branch_id ? "Asignada" : "— (global)"}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs text-zinc-400">ID de usuario</p>
            <p className="text-xs font-mono text-zinc-500 break-all">{user.id}</p>
          </div>
        </div>
      </div>

      {/* Módulos disponibles */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Módulos disponibles
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visibleModules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="border border-zinc-200 rounded-lg p-3 text-center hover:border-zinc-400 hover:bg-zinc-50 transition-colors group"
            >
              <p className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900">
                {m.label}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
