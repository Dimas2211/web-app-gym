import type { ModuleGroup } from "@/lib/navigation/dashboard-nav";

export type QuickAction = {
  label: string;
  href: string;
  /**
   * href del item de MODULE_GROUPS del que depende. La acción solo se muestra
   * si ese item ya es visible para el usuario (rol + módulo comercial +
   * vertical), es decir, hereda exactamente el filtro del sidebar. Defensa de
   * UI únicamente: cada página destino conserva su guard server-side.
   */
  requiresNavHref: string;
};

// Orden = prioridad. La primera acción visible se muestra como principal.
// Cada destino exige los mismos roles que el item del que depende:
// sales/new (operador commerce: SA/BA/recepción), clients/new (SA/BA/recepción),
// purchases/new (SA/BA), cash y classes (página índice del módulo).
export const QUICK_ACTIONS: QuickAction[] = [
  { label: "Nueva venta", href: "/dashboard/sales/new", requiresNavHref: "/dashboard/sales" },
  { label: "Nuevo socio", href: "/dashboard/clients/new", requiresNavHref: "/dashboard/clients" },
  { label: "Caja", href: "/dashboard/cash", requiresNavHref: "/dashboard/cash" },
  { label: "Nueva compra", href: "/dashboard/purchases/new", requiresNavHref: "/dashboard/purchases" },
  { label: "Agenda y asistencia", href: "/dashboard/classes", requiresNavHref: "/dashboard/classes" },
];

/** Acciones rápidas permitidas a partir de los grupos ya filtrados por acceso. */
export function getVisibleQuickActions(visibleGroups: ModuleGroup[]): QuickAction[] {
  const visibleHrefs = new Set(
    visibleGroups.flatMap((g) => g.items.filter((i) => !i.disabled).map((i) => i.href)),
  );
  return QUICK_ACTIONS.filter((a) => visibleHrefs.has(a.requiresNavHref));
}
