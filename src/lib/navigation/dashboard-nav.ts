import type { UserRole } from "@prisma/client";

export type ModuleItem = {
  label: string;
  href: string;
  roles: UserRole[];
  disabled?: boolean;
  /**
   * Bloque B — module code del catálogo Platform (ver
   * src/modules/platform/constants/platform-modules.constants.ts) que
   * gobierna la visibilidad comercial de este item, ADEMÁS del filtro
   * por rol. Omitido = el item no depende de ningún módulo comercial
   * (settings de core, reportes transversales, o el grupo Platform
   * Admin, que siempre queda exento del contrato del cliente).
   */
  moduleCode?: string;
};

export type ModuleGroup = {
  id: string;
  label: string;
  abbr: string;
  items: ModuleItem[];
};

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "gym",
    label: "Gestión GYM",
    abbr: "GYM",
    items: [
      // "Clientes" (gym) no tiene module code propio en el catálogo Platform
      // (solo existen gym.memberships/trainers/classes/weekly_plans) — no se
      // inventa un módulo nuevo solo para encajar esta pantalla.
      { label: "Clientes", href: "/dashboard/clients", roles: ["super_admin", "branch_admin", "reception"] },
      { label: "Membresías", href: "/dashboard/memberships/client-memberships", roles: ["super_admin", "branch_admin", "reception"], moduleCode: "gym.memberships" },
      { label: "Entrenadores", href: "/dashboard/trainers", roles: ["super_admin", "branch_admin"], moduleCode: "gym.trainers" },
      { label: "Agenda", href: "/dashboard/classes", roles: ["super_admin", "branch_admin", "reception", "trainer"], moduleCode: "gym.classes" },
      { label: "Planes semanales", href: "/dashboard/weekly-plans/client-plans", roles: ["super_admin", "branch_admin", "reception", "trainer"], moduleCode: "gym.weekly_plans" },
      // Reportes es transversal a varios módulos gym — no se amarra a uno solo.
      { label: "Reportes", href: "/dashboard/reports", roles: ["super_admin", "branch_admin"] },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    abbr: "CMR",
    items: [
      { label: "Productos", href: "/dashboard/products", roles: ["super_admin", "branch_admin"], moduleCode: "commerce.products" },
      { label: "Inventario", href: "/dashboard/inventory", roles: ["super_admin", "branch_admin"], moduleCode: "commerce.inventory" },
      { label: "Proveedores", href: "/dashboard/suppliers", roles: ["super_admin", "branch_admin"], moduleCode: "commerce.suppliers" },
      { label: "Clientes fiscales", href: "/dashboard/customers", roles: ["super_admin", "branch_admin"], moduleCode: "core.customers" },
      { label: "Compras", href: "/dashboard/purchases", roles: ["super_admin", "branch_admin"], moduleCode: "commerce.purchases" },
      { label: "Ventas", href: "/dashboard/sales", roles: ["super_admin", "branch_admin", "reception"], moduleCode: "commerce.sales" },
      { label: "Exportaciones", href: "/dashboard/sales/export", roles: ["super_admin", "branch_admin"], moduleCode: "commerce.sales" },
      { label: "Caja", href: "/dashboard/cash", roles: ["super_admin", "branch_admin", "reception"], moduleCode: "commerce.cash" },
      { label: "DTE emitidos", href: "/dashboard/dte/outgoing", roles: ["super_admin", "branch_admin"], moduleCode: "fiscal.dte" },
      { label: "Facturación Electrónica", href: "/dashboard/settings/dte", roles: ["super_admin", "branch_admin"], moduleCode: "fiscal.dte" },
      { label: "Correlativos DTE", href: "/dashboard/dte/correlatives", roles: ["super_admin"], moduleCode: "fiscal.dte" },
      // Reporting transversal a varios módulos commerce — no se amarra a uno solo.
      { label: "Consultas y reportes", href: "/dashboard/reports/commerce", roles: ["super_admin", "branch_admin"] },
    ],
  },
  {
    id: "admin",
    label: "Administración",
    abbr: "ADM",
    items: [
      { label: "Usuarios", href: "/dashboard/users", roles: ["super_admin", "branch_admin"], moduleCode: "core.users" },
      { label: "Sucursales", href: "/dashboard/branches", roles: ["super_admin"], moduleCode: "core.locations" },
      // Configuración es administración de sistema, no un módulo comercial opcional.
      { label: "Configuración", href: "/dashboard/settings", roles: ["super_admin"] },
    ],
  },
  {
    id: "platform",
    label: "Platform Admin",
    abbr: "PLT",
    // Grupo completo EXENTO de module entitlement del cliente — es
    // administración del Control Plane, no depende del plan contratado
    // por ninguna organización (ver requireSuperAdmin en cada page.tsx).
    items: [
      { label: "Panel Platform",         href: "/dashboard/platform",                              roles: ["super_admin"] },
      { label: "Organizaciones",         href: "/dashboard/platform/organizations",                  roles: ["super_admin"] },
      { label: "Planes",                 href: "/dashboard/platform/plans",                          roles: ["super_admin"] },
      { label: "Módulos",                href: "/dashboard/platform/modules",                        roles: ["super_admin"] },
      { label: "Verticales",             href: "/dashboard/platform/verticals",                      roles: ["super_admin"] },
      { label: "Provisioning",           href: "/dashboard/platform/provisioning",                   roles: ["super_admin"] },
      { label: "Deployment Preparation", href: "/dashboard/platform/deployment-preparation",         roles: ["super_admin"] },
      { label: "Deployment Exports",     href: "/dashboard/platform/deployment-exports",             roles: ["super_admin"] },
      { label: "Deployments",            href: "/dashboard/platform/deployments",                    roles: ["super_admin"] },
      { label: "Manual Deployment",      href: "/dashboard/platform/manual-deployment",              roles: ["super_admin"] },
      { label: "Perfiles de BD",          href: "/dashboard/platform/database-profiles",               roles: ["super_admin"] },
    ],
  },
];

/**
 * Bloque B — filtra MODULE_GROUPS por rol (como siempre) Y por módulo
 * comercial habilitado. `enabledModuleCodes` es el set de module codes
 * efectivamente habilitados para el tenant actual (ya resuelto por el
 * caller vía Commercial Enforcement Context) — items sin `moduleCode`
 * pasan siempre (no dependen de ningún módulo opcional). El grupo
 * `platform` nunca se filtra por módulo (ver comentario arriba).
 *
 * Grupos que quedan sin items visibles se omiten del resultado.
 */
export function filterModuleGroupsByAccess(
  groups: ModuleGroup[],
  role: UserRole,
  enabledModuleCodes: Set<string>,
): ModuleGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.roles.includes(role)) return false;
        if (group.id === "platform") return true;
        if (!item.moduleCode) return true;
        return enabledModuleCodes.has(item.moduleCode);
      }),
    }))
    .filter((group) => group.items.length > 0);
}
