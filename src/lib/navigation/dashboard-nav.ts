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
  /**
   * PASO 6F — código de vertical (ej. "GYM") requerido para que este
   * item sea visible, ADEMÁS del filtro por rol y moduleCode. Uso
   * exclusivo: superficies de una vertical que NO tienen module code
   * propio (Clientes GYM, Reportes GYM) — nunca se inventa un module
   * code ficticio (gym.clients, gym.reports) solo para encajar en el
   * filtro existente. Si el item YA tiene moduleCode propio de esa
   * vertical (gym.memberships, ...), NO se agrega requiredVerticalCode:
   * sería redundante, ese módulo nunca está habilitado fuera de su
   * vertical. Omitido = el item no depende de ninguna vertical
   * (Commerce es transversal; Platform Admin queda exento por rol).
   */
  requiredVerticalCode?: string;
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
      // inventa un módulo nuevo solo para encajar esta pantalla. En su lugar,
      // depende de la vertical efectiva (PASO 6F).
      { label: "Clientes", href: "/dashboard/clients", roles: ["super_admin", "branch_admin", "reception"], requiredVerticalCode: "GYM" },
      { label: "Membresías", href: "/dashboard/memberships/client-memberships", roles: ["super_admin", "branch_admin", "reception"], moduleCode: "gym.memberships" },
      { label: "Entrenadores", href: "/dashboard/trainers", roles: ["super_admin", "branch_admin"], moduleCode: "gym.trainers" },
      { label: "Agenda", href: "/dashboard/classes", roles: ["super_admin", "branch_admin", "reception", "trainer"], moduleCode: "gym.classes" },
      { label: "Planes semanales", href: "/dashboard/weekly-plans/client-plans", roles: ["super_admin", "branch_admin", "reception", "trainer"], moduleCode: "gym.weekly_plans" },
      // Reportes GYM es transversal a varios módulos gym (no se amarra a uno
      // solo) pero SÍ depende de la vertical efectiva (PASO 6F) — sin ella
      // no tiene sentido (TrustMe es Commerce-only, vertical null).
      { label: "Reportes", href: "/dashboard/reports", roles: ["super_admin", "branch_admin"], requiredVerticalCode: "GYM" },
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
 * Bloque B / PASO 6F — filtra MODULE_GROUPS por rol (como siempre), por
 * módulo comercial habilitado Y por vertical efectiva. `enabledModuleCodes`
 * es el set de module codes efectivamente habilitados para la
 * organización EFECTIVA (ya resuelto por el caller vía Commercial
 * Enforcement Context — nunca el tenant autenticado directo si hay
 * sesión runtime). `effectiveVerticalCode` es el código de vertical
 * efectivo (ej. "GYM"), o null si la organización no tiene vertical
 * (ej. TrustMe: Commerce-only).
 *
 * - Item sin `moduleCode` ni `requiredVerticalCode` → pasa siempre (no
 *   depende de ningún módulo/vertical opcional — ej. Commerce es
 *   transversal, Configuración es contenedor transversal).
 * - Item con `moduleCode` → pasa solo si ese módulo está habilitado.
 * - Item con `requiredVerticalCode` → pasa solo si coincide con
 *   `effectiveVerticalCode` (ambos requisitos se aplican si el item
 *   tuviera los dos, aunque hoy ningún item los combina).
 * - El grupo `platform` nunca se filtra por módulo ni vertical (ver
 *   comentario arriba de MODULE_GROUPS).
 *
 * `isLegacyUnmanaged` (mismo criterio que el bypass de `enabledModuleCodes`
 * en LEGACY_UNMANAGED): cuando es true, ningún `requiredVerticalCode` oculta
 * items — un tenant sin fila PlatformOrganization no debe perder superficies
 * por no tener vertical asignada.
 *
 * Grupos que quedan sin items visibles se omiten del resultado.
 */
export function filterModuleGroupsByAccess(
  groups: ModuleGroup[],
  role: UserRole,
  enabledModuleCodes: Set<string>,
  effectiveVerticalCode: string | null = null,
  isLegacyUnmanaged: boolean = false,
): ModuleGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.roles.includes(role)) return false;
        if (group.id === "platform") return true;
        if (item.moduleCode && !enabledModuleCodes.has(item.moduleCode)) return false;
        if (
          item.requiredVerticalCode &&
          !isLegacyUnmanaged &&
          item.requiredVerticalCode !== effectiveVerticalCode
        ) {
          return false;
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
