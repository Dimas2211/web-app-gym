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
  /**
   * true si la acción abre una captura (crear registro). En un contexto de
   * solo lectura (Support Session) no se anuncia: las escrituras se
   * bloquean en servidor y el botón sería engañoso.
   */
  writes: boolean;
};

// Orden = prioridad. La primera acción visible se muestra como principal.
// Cada destino exige los mismos roles que el item del que depende:
// sales/new (operador commerce: SA/BA/recepción), clients/new (SA/BA/recepción),
// purchases/new (SA/BA), cash y classes (página índice del módulo).
export const QUICK_ACTIONS: QuickAction[] = [
  { label: "Nueva venta", href: "/dashboard/sales/new", requiresNavHref: "/dashboard/sales", writes: true },
  { label: "Nuevo socio", href: "/dashboard/clients/new", requiresNavHref: "/dashboard/clients", writes: true },
  { label: "Caja", href: "/dashboard/cash", requiresNavHref: "/dashboard/cash", writes: false },
  { label: "Nueva compra", href: "/dashboard/purchases/new", requiresNavHref: "/dashboard/purchases", writes: true },
  { label: "Agenda y asistencia", href: "/dashboard/classes", requiresNavHref: "/dashboard/classes", writes: false },
];

/**
 * Acciones rápidas permitidas a partir de los grupos ya filtrados por acceso.
 * `readOnly` (Support Session) oculta las acciones de captura.
 */
export function getVisibleQuickActions(
  visibleGroups: ModuleGroup[],
  options: { readOnly?: boolean } = {},
): QuickAction[] {
  const visibleHrefs = new Set(
    visibleGroups.flatMap((g) => g.items.filter((i) => !i.disabled).map((i) => i.href)),
  );
  return QUICK_ACTIONS.filter(
    (a) => visibleHrefs.has(a.requiresNavHref) && !(options.readOnly && a.writes),
  );
}
