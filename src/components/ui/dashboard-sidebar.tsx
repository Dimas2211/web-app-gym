"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULE_GROUPS, filterModuleGroupsByAccess } from "@/lib/navigation/dashboard-nav";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils/cn";
import { ModuleIcon, moduleIconForHref } from "@/components/ui/module-icons";
import { useEffect, useState } from "react";

const COLLAPSED_STORAGE_KEY = "zolvi.sidebar.collapsedGroups";
import type { UserRole } from "@prisma/client";

type Props = {
  role: UserRole;
  /**
   * Bloque B — module codes efectivamente habilitados para la
   * organización EFECTIVA (resuelto server-side en layout.tsx contra el
   * Commercial Enforcement Context del tenant efectivo — el de la
   * sesión runtime "Operar como cliente" si hay una activa). En
   * LEGACY_UNMANAGED, el layout ya incluye todos los codes referenciados
   * en MODULE_GROUPS (bypass explícito).
   */
  enabledModuleCodes: string[];
  /**
   * PASO 6F — código de vertical efectivo (ej. "GYM"), o null si la
   * organización efectiva no tiene vertical (ej. TrustMe: Commerce-only).
   * Gobierna items con `requiredVerticalCode` (Clientes/Reportes GYM).
   */
  effectiveVerticalCode: string | null;
  /**
   * PASO 6F — true si el tenant efectivo no tiene fila PlatformOrganization
   * (bypass legacy, mismo criterio que enabledModuleCodes en ese modo):
   * ningún `requiredVerticalCode` oculta items.
   */
  isLegacyUnmanaged: boolean;
  /**
   * FASE VI-B — resultado de canAccessPlatformAdmin(user) calculado
   * server-side en layout.tsx (auth_scope === "PLATFORM" && isGlobal).
   * Controla la visibilidad del grupo "Platform Admin" ADEMÁS del rol.
   * Defensa de UI únicamente — requireSuperAdmin sigue siendo la autoridad
   * real en cada page.tsx/Server Action de /dashboard/platform/*.
   */
  canAccessPlatformAdmin: boolean;
};

export function DashboardSidebar({ role, enabledModuleCodes, effectiveVerticalCode, isLegacyUnmanaged, canAccessPlatformAdmin }: Props) {
  const { open, close } = useSidebar();
  const pathname = usePathname();

  // Grupos plegados: preferencia visual por navegador (sin efecto en accesos).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) setCollapsed(new Set(saved.filter((v) => typeof v === "string")));
    } catch {
      // Sin almacenamiento disponible: todos los grupos abiertos.
    }
  }, []);

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Preferencia no persistida; el plegado sigue funcionando en la sesión.
      }
      return next;
    });
  }

  const visibleGroups = filterModuleGroupsByAccess(
    MODULE_GROUPS,
    role,
    new Set(enabledModuleCodes),
    effectiveVerticalCode,
    isLegacyUnmanaged,
    canAccessPlatformAdmin,
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
            ? "translate-x-0 md:w-60"
            : "-translate-x-full md:translate-x-0 md:w-0 md:border-r-0"
        )}
      >
        {/* Encabezado del sidebar */}
        <div className="flex items-center justify-between h-14 border-b border-zinc-100 px-3 shrink-0">
          <span className="text-xs font-semibold text-brand-navy/60 uppercase tracking-widest truncate">
            Módulos
          </span>
          <button
            onClick={close}
            aria-label="Cerrar menú lateral"
            className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-brand-navy hover:bg-brand-blue-soft transition-colors shrink-0"
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
          {visibleGroups.map((group) => {
            const isCollapsed = collapsed.has(group.id);
            return (
            <div key={group.id} className="mb-2">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center justify-between gap-2 px-4 pt-3 pb-1.5 text-xs font-semibold text-dark/45 uppercase tracking-wide hover:text-dark transition-colors"
              >
                <span className="truncate">{group.label}</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isCollapsed && "-rotate-90")}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {!isCollapsed && group.items.map((item) => {
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
                      "group flex items-center gap-2.5 mx-2 px-2 py-1.5 rounded-lg text-sm transition-colors duration-200",
                      isActive
                        ? "bg-primary/5 text-dark font-semibold"
                        : "text-dark/70 hover:bg-secondary/10 hover:text-dark"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                        isActive
                          ? "bg-primary/10 text-primary-dark"
                          : "bg-secondary/10 text-secondary-dark group-hover:bg-secondary/20"
                      )}
                    >
                      <ModuleIcon name={moduleIconForHref(item.href)} className="h-4 w-4" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
