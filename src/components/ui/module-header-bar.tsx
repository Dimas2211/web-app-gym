"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULE_GROUPS, type ModuleGroup, type ModuleItem } from "@/lib/navigation/dashboard-nav";
import { ModuleIcon, moduleIconForHref } from "@/components/ui/module-icons";

type Match = { group: ModuleGroup; item: ModuleItem };

/**
 * Ubica el módulo de la ruta actual: primero el item cuyo href es el prefijo
 * más largo; si no hay, el primer item de la misma sección raíz
 * (ej. /dashboard/memberships/plans → Membresías). Solo presentación: no
 * decide accesos (cada página conserva su guard).
 */
export function findModuleForPath(pathname: string): Match | null {
  const all = MODULE_GROUPS.flatMap((group) => group.items.map((item) => ({ group, item })));

  const byPrefix = all
    .filter(({ item }) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.item.href.length - a.item.href.length)[0];
  if (byPrefix) return byPrefix;

  const root = pathname.split("/").slice(0, 3).join("/");
  if (root === "/dashboard") return null;
  return all.find(({ item }) => item.href.startsWith(`${root}/`)) ?? null;
}

// Rutas que renderizan un workspace ERP oscuro a pantalla completa: la barra
// usa el mismo fondo para continuar visualmente con la pantalla.
const DARK_WORKSPACE_ROUTES = [
  /^\/dashboard\/sales$/,
  /^\/dashboard\/sales\/new$/,
  /^\/dashboard\/sales\/export$/,
  /^\/dashboard\/purchases$/,
  /^\/dashboard\/purchases\/new$/,
  /^\/dashboard\/purchases\/[^/]+\/edit$/,
];

export function isDarkWorkspaceRoute(pathname: string): boolean {
  return DARK_WORKSPACE_ROUTES.some((re) => re.test(pathname));
}

/**
 * Franja de contexto a todo el ancho: icono del módulo + ruta
 * "Sección › Módulo". Altura fija (h-12): los workspaces de alto completo
 * descuentan --zv-module-bar-h (ver globals.css).
 */
export function ModuleHeaderBar() {
  const pathname = usePathname();
  const match = findModuleForPath(pathname);
  if (!match) return null;

  const { group, item } = match;
  const isModuleRoot = pathname === item.href;
  const lastSegment = pathname.split("/").pop();
  const subpageLabel = lastSegment === "new" ? "Nuevo" : lastSegment === "edit" ? "Editar" : "Detalle";
  const dark = isDarkWorkspaceRoute(pathname);

  return (
    <nav
      aria-label="Ubicación"
      className={`zv-module-bar flex h-12 shrink-0 items-center gap-3 border-b px-4 sm:px-6 ${
        dark ? "border-white/10 bg-zinc-950" : "border-dark/10 bg-white"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          dark ? "bg-white/10 text-secondary" : "bg-secondary/10 text-secondary-dark"
        }`}
      >
        <ModuleIcon name={moduleIconForHref(item.href)} className="h-4 w-4" />
      </span>
      <ol className="flex min-w-0 items-center gap-1.5 truncate text-sm">
        <li className={dark ? "text-white/60" : "text-dark/55"}>{group.label}</li>
        <li aria-hidden className={dark ? "text-white/30" : "text-dark/30"}>›</li>
        <li className="min-w-0 truncate">
          {isModuleRoot ? (
            <span aria-current="page" className={`font-semibold ${dark ? "text-white" : "text-dark"}`}>
              {item.label}
            </span>
          ) : (
            <Link
              href={item.href}
              className={`font-semibold transition-colors ${
                dark ? "text-white hover:text-secondary" : "text-dark hover:text-primary-dark"
              }`}
            >
              {item.label}
            </Link>
          )}
        </li>
        {!isModuleRoot && (
          <>
            <li aria-hidden className={dark ? "text-white/30" : "text-dark/30"}>›</li>
            <li className={dark ? "text-white/60" : "text-dark/55"}>{subpageLabel}</li>
          </>
        )}
      </ol>
    </nav>
  );
}
