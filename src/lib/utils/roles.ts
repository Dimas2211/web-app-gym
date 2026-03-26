import type { UserRole } from "@prisma/client";

/**
 * Etiquetas en español para mostrar en la UI.
 * Los valores internos en BD permanecen en inglés (snake_case).
 * Usar este archivo como única fuente de verdad para labels de roles.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  branch_admin: "Administrador de sucursal",
  reception: "Recepción",
  trainer: "Entrenador",
  client: "Cliente",
};

/**
 * Clases Tailwind para badges de rol.
 * Reutilizable en tablas, fichas y cualquier componente visual.
 */
export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: "bg-violet-100 text-violet-800",
  branch_admin: "bg-blue-100 text-blue-800",
  reception: "bg-emerald-100 text-emerald-800",
  trainer: "bg-orange-100 text-orange-800",
  client: "bg-zinc-100 text-zinc-600",
};

/**
 * Roles gestionables en el CRUD de usuarios administrativos.
 * Excluye `client`: los clientes se gestionan desde su propio módulo.
 */
export const ADMIN_CRUD_ROLES: UserRole[] = [
  "super_admin",
  "branch_admin",
  "reception",
  "trainer",
];

/**
 * Roles que branch_admin puede asignar.
 * No puede crear ni escalar a super_admin ni branch_admin.
 */
export const BRANCH_ADMIN_ASSIGNABLE_ROLES: UserRole[] = ["reception", "trainer"];

/**
 * Retorna los roles que el usuario de sesión puede asignar en el CRUD admin.
 * - super_admin: todos los roles administrativos (sin client)
 * - branch_admin: solo reception y trainer
 * - otros: ninguno (no deberían llegar aquí)
 */
export function getAssignableRoles(sessionRole: UserRole): UserRole[] {
  if (sessionRole === "super_admin") return ADMIN_CRUD_ROLES;
  if (sessionRole === "branch_admin") return BRANCH_ADMIN_ASSIGNABLE_ROLES;
  return [];
}
