"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULE_GROUPS, filterModuleGroupsByAccess } from "@/lib/navigation/dashboard-nav";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@prisma/client";

type Props = {
  role: UserRole;
  /**
   * Bloque B — module codes efectivamente habilitados para el tenant
   * actual (resuelto server-side en layout.tsx contra el Commercial
   * Enforcement Context). En LEGACY_UNMANAGED, el layout ya incluye
   * todos los codes referenciados en MODULE_GROUPS (bypass explícito).
   */
  enabledModuleCodes: string[];
};

export function DashboardSidebar({ role, enabledModuleCodes }: Props) {
  const { open, close } = useSidebar();
  const pathname = usePathname();

  const visibleGroups = filterModuleGroupsByAccess(
    MODULE_GROUPS,
    role,
    new Set(enabledModuleCodes),
  );

  return (
    <>
      {/* Backdrop — solo visible en mobile cuando el sidebar está abierto */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={close}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          // Base: fixed en mobile, relativo en desktop
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-zinc-200 transition-all duration-200 overflow-hidden",
          // Mobile: ancho fijo 240px, desliza desde la izquierda
          "w-60",
          // Desktop: posición relativa en el flujo, ancho variable
          "md:relative md:inset-auto md:z-auto md:h-full",
          // Visibilidad según estado
          open
            ? "translate-x-0 md:w-52"
            : "-translate-x-full md:translate-x-0 md:w-0 md:border-r-0"
        )}
      >
        {/* Encabezado del sidebar */}
        <div className="flex items-center justify-between h-14 border-b border-zinc-100 px-3 shrink-0">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest truncate">
            Módulos
          </span>
          <button
            onClick={close}
            aria-label="Cerrar menú lateral"
            className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors shrink-0"
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Grupos de navegación */}
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleGroups.map((group) => (
            <div key={group.id} className="mb-2">
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
                {group.label}
              </p>

              {group.items.map((item) => {
                const isActive =
                  item.href !== "/dashboard" && pathname.startsWith(item.href);

                if (item.disabled) {
                  return (
                    <div
                      key={item.href}
                      className="flex items-center px-3 py-1.5 text-sm text-zinc-300 cursor-not-allowed"
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto text-[9px] text-zinc-200 shrink-0">Pronto</span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className={cn(
                      "flex items-center mx-2 px-2 py-1.5 rounded text-sm transition-colors",
                      isActive
                        ? "bg-zinc-100 text-zinc-900 font-medium"
                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
