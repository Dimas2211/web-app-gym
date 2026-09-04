import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/utils/roles";
import { MODULE_GROUPS, filterModuleGroupsByAccess } from "@/lib/navigation/dashboard-nav";
import { resolveCommercialEnforcementContext } from "@/modules/platform/runtime/commercial-enforcement";
import type { UserRole } from "@prisma/client";

function credentialHref(role: UserRole): string {
  return role === "client" ? "/portal/credencial" : "/dashboard/credential";
}

const COMMERCIAL_ERROR_MESSAGES: Record<string, string> = {
  module_not_enabled: "Este módulo no está habilitado para tu organización.",
  capacity_limit_reached: "Alcanzaste el límite de tu plan.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ commercial_error?: string }>;
}) {
  const session = await auth();
  const user = session!.user;
  const params = await searchParams;
  const commercialErrorMessage = params?.commercial_error
    ? COMMERCIAL_ERROR_MESSAGES[params.commercial_error]
    : undefined;

  // Bloque B — module codes habilitados para el tenant de sesión (mismo
  // criterio LEGACY_UNMANAGED que dashboard/layout.tsx: bypass = todos).
  const ALL_NAV_MODULE_CODES = MODULE_GROUPS.flatMap((g) =>
    g.items.map((i) => i.moduleCode).filter((c): c is string => Boolean(c)),
  );
  let enabledModuleCodes = new Set<string>();
  if (user.tenant_id) {
    const commercialCtx = await resolveCommercialEnforcementContext(user.tenant_id);
    enabledModuleCodes =
      commercialCtx.mode === "LEGACY_UNMANAGED"
        ? new Set(ALL_NAV_MODULE_CODES)
        : new Set(ALL_NAV_MODULE_CODES.filter((code) => commercialCtx.effectiveModules.get(code)?.enabled === true));
  }

  const visibleGroups = filterModuleGroupsByAccess(MODULE_GROUPS, user.role, enabledModuleCodes);

  return (
    <div className="space-y-6">
      {commercialErrorMessage && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          {commercialErrorMessage}
        </div>
      )}
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
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${ROLE_COLORS[user.role]}`}>
            {ROLE_LABELS[user.role]}
          </span>
          <Link
            href={credentialHref(user.role)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors whitespace-nowrap"
          >
            Mi Carnet
          </Link>
        </div>
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
              {user.location_id ? "Asignada" : "— (global)"}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs text-zinc-400">ID de usuario</p>
            <p className="text-xs font-mono text-zinc-500 break-all">{user.id}</p>
          </div>
        </div>
      </div>

      {/* Módulos por sección */}
      {visibleGroups.map((group) => (
        <div key={group.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
            {group.label}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {group.items.map((m) =>
              m.disabled ? (
                <div
                  key={m.href}
                  className="border border-dashed border-zinc-200 rounded-lg p-3 text-center opacity-50 cursor-not-allowed"
                >
                  <p className="text-sm font-medium text-zinc-400">{m.label}</p>
                  <p className="text-xs text-zinc-300 mt-0.5">Próximamente</p>
                </div>
              ) : (
                <Link
                  key={m.href}
                  href={m.href}
                  className="border border-zinc-200 rounded-lg p-3 text-center hover:border-zinc-400 hover:bg-zinc-50 transition-colors group"
                >
                  <p className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900">
                    {m.label}
                  </p>
                </Link>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
