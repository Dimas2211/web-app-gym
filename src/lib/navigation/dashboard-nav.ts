import type { UserRole } from "@prisma/client";

export type ModuleItem = {
  label: string;
  href: string;
  roles: UserRole[];
  disabled?: boolean;
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
      { label: "Clientes", href: "/dashboard/clients", roles: ["super_admin", "branch_admin", "reception"] },
      { label: "Membresías", href: "/dashboard/memberships/client-memberships", roles: ["super_admin", "branch_admin", "reception"] },
      { label: "Entrenadores", href: "/dashboard/trainers", roles: ["super_admin", "branch_admin"] },
      { label: "Agenda", href: "/dashboard/classes", roles: ["super_admin", "branch_admin", "reception", "trainer"] },
      { label: "Planes semanales", href: "/dashboard/weekly-plans/client-plans", roles: ["super_admin", "branch_admin", "reception", "trainer"] },
      { label: "Reportes", href: "/dashboard/reports", roles: ["super_admin", "branch_admin"] },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    abbr: "CMR",
    items: [
      { label: "Productos", href: "/dashboard/products", roles: ["super_admin", "branch_admin"] },
      { label: "Inventario", href: "/dashboard/inventory", roles: ["super_admin", "branch_admin"] },
      { label: "Proveedores", href: "/dashboard/suppliers", roles: ["super_admin", "branch_admin"] },
      { label: "Clientes fiscales", href: "/dashboard/customers", roles: ["super_admin", "branch_admin"] },
      { label: "Compras", href: "/dashboard/purchases", roles: ["super_admin", "branch_admin"] },
      { label: "Ventas", href: "/dashboard/sales", roles: ["super_admin", "branch_admin", "reception"] },
      { label: "Caja", href: "/dashboard/cash", roles: ["super_admin", "branch_admin", "reception"], disabled: true },
      { label: "Consultas y reportes", href: "/dashboard/reports/commerce", roles: ["super_admin", "branch_admin"] },
    ],
  },
  {
    id: "admin",
    label: "Administración",
    abbr: "ADM",
    items: [
      { label: "Usuarios", href: "/dashboard/users", roles: ["super_admin", "branch_admin"] },
      { label: "Sucursales", href: "/dashboard/branches", roles: ["super_admin"] },
      { label: "Configuración", href: "/dashboard/settings", roles: ["super_admin"] },
    ],
  },
];
