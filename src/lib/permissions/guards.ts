import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import type { GymSessionUser } from "@/core/auth/types";
import { getCapabilities } from "@/core/permissions/role-capabilities";

/**
 * SessionUser extiende GymSessionUser para exponer también tenant_id y location_id
 * como aliases de gym_id y branch_id.
 *
 * gym_id y branch_id siguen presentes e intactos — ningún módulo existente se rompe.
 * tenant_id y location_id son aliases temporales que permiten que código nuevo
 * en src/core/ opere sobre CoreSessionUser sin esperar el cambio de JWT.
 *
 * role se narra con UserRole (enum Prisma) en lugar de string para mantener
 * type safety en los módulos GYM actuales.
 */
export type SessionUser = GymSessionUser & {
  role: UserRole; // narra el string genérico de GymSessionUser al enum GYM
};

/**
 * Indica si un rol puede ejecutar eliminaciones definitivas de forma directa,
 * sin requerir autorización administrativa excepcional.
 * Solo super_admin y branch_admin tienen este privilegio.
 */
export function canDeleteDirectly(role: UserRole): boolean {
  return getCapabilities(role).canManageStaff;
}

/** Requiere rol client, redirige al /dashboard si no corresponde */
export async function requireClient(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (user.role !== "client") redirect("/dashboard");
  return user;
}

/** Retorna el usuario de sesión o redirige a /login */
export async function getSessionOrRedirect(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const u = session.user;
  return {
    id: u.id!,
    name: u.name,
    email: u.email,
    role: u.role as UserRole,
    gym_id: u.gym_id,
    branch_id: u.branch_id,
    // Aliases core — tenant_id y location_id vienen directo del JWT desde Etapa 6
    tenant_id: u.tenant_id,
    location_id: u.location_id,
  };
}

/** Requiere rol admin (super_admin o branch_admin), redirige al dashboard si no */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (!getCapabilities(user.role).canManageStaff) redirect("/dashboard");
  return user;
}

/** Requiere super_admin exclusivamente */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (!getCapabilities(user.role).isGlobal) redirect("/dashboard");
  return user;
}

/** ¿Puede el usuario de sesión gestionar una sucursal dada? */
export function canManageBranch(user: SessionUser, branchId: string): boolean {
  const caps = getCapabilities(user.role);
  if (caps.isGlobal) return true;
  if (caps.canManageStaff) return user.location_id === branchId;
  return false;
}

/** Requiere rol que puede gestionar clientes (super_admin, branch_admin, reception) */
export async function requireClientManager(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (!getCapabilities(user.role).canManageMembers) redirect("/dashboard");
  return user;
}

/** Requiere rol que puede gestionar membresías (super_admin, branch_admin, reception) */
export async function requireMembershipManager(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (!getCapabilities(user.role).canManageMembers) redirect("/dashboard");
  return user;
}

/** Requiere rol que puede ver clases (super_admin, branch_admin, reception, trainer) */
export async function requireClassViewer(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (!getCapabilities(user.role).canViewOperations) redirect("/dashboard");
  return user;
}

/** ¿Puede el usuario de sesión gestionar un plan de membresía? */
export function canManagePlan(
  sessionUser: SessionUser,
  plan: { branch_id: string | null }
): boolean {
  const caps = getCapabilities(sessionUser.role);
  if (caps.isGlobal) return true;
  if (caps.canManageStaff) return plan.branch_id === sessionUser.location_id;
  return false;
}

/** ¿Puede el usuario de sesión gestionar una membresía de cliente? */
export function canManageMembership(
  sessionUser: SessionUser,
  membership: { branch_id: string }
): boolean {
  const caps = getCapabilities(sessionUser.role);
  if (caps.isGlobal) return true;
  if (caps.canManageMembers) return sessionUser.location_id === membership.branch_id;
  return false;
}

/** ¿Puede el usuario de sesión gestionar una clase programada? */
export function canManageClass(
  sessionUser: SessionUser,
  scheduledClass: { branch_id: string }
): boolean {
  // Usa canManageMembers porque en GYM los mismos roles que gestionan miembros
  // gestionan clases (super_admin, branch_admin, reception). Cuando se añada
  // una segunda industria, considerar agregar canManageSchedule al mapa de capacidades.
  const caps = getCapabilities(sessionUser.role);
  if (caps.isGlobal) return true;
  if (caps.canManageMembers) return sessionUser.location_id === scheduledClass.branch_id;
  return false;
}

/** ¿Puede el usuario de sesión gestionar un entrenador dado? */
export function canManageTrainer(
  sessionUser: SessionUser,
  trainer: { branch_id: string }
): boolean {
  const caps = getCapabilities(sessionUser.role);
  if (caps.isGlobal) return true;
  if (caps.canManageStaff) return sessionUser.location_id === trainer.branch_id;
  return false;
}

/** ¿Puede el usuario de sesión gestionar un cliente dado? */
export function canManageClient(
  sessionUser: SessionUser,
  client: { branch_id: string }
): boolean {
  const caps = getCapabilities(sessionUser.role);
  if (caps.isGlobal) return true;
  if (caps.canManageMembers) return sessionUser.location_id === client.branch_id;
  return false;
}

/** ¿Puede el usuario de sesión gestionar una plantilla de plan semanal? */
export function canManageWeeklyPlanTemplate(
  sessionUser: SessionUser,
  template: { branch_id: string | null }
): boolean {
  const caps = getCapabilities(sessionUser.role);
  if (caps.isGlobal) return true;
  if (caps.canManageStaff) {
    return (
      template.branch_id === null ||
      template.branch_id === sessionUser.location_id
    );
  }
  return false;
}

/** ¿Puede el usuario de sesión gestionar un plan semanal de cliente? */
export function canManageClientWeeklyPlan(
  sessionUser: SessionUser,
  plan: { branch_id: string }
): boolean {
  const caps = getCapabilities(sessionUser.role);
  if (caps.isGlobal) return true;
  if (caps.canViewOperations) return sessionUser.location_id === plan.branch_id;
  return false;
}

/** ¿Puede el usuario de sesión gestionar a otro usuario? */
export function canManageUser(
  sessionUser: SessionUser,
  target: { branch_id: string | null; role: UserRole }
): boolean {
  const caps = getCapabilities(sessionUser.role);
  if (caps.isGlobal) return true;
  if (caps.canManageStaff) {
    // Anti-escalación: no puede gestionar usuarios que también tienen canManageStaff
    // (equivale a no poder gestionar super_admin ni branch_admin)
    return (
      sessionUser.location_id === target.branch_id &&
      !getCapabilities(target.role).canManageStaff
    );
  }
  return false;
}
