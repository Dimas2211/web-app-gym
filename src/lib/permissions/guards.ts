import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: UserRole;
  gym_id: string;
  branch_id: string | null;
};

const ADMIN_ROLES: UserRole[] = ["super_admin", "branch_admin"];

/**
 * Indica si un rol puede ejecutar eliminaciones definitivas de forma directa,
 * sin requerir autorización administrativa excepcional.
 * Solo super_admin y branch_admin tienen este privilegio.
 */
export function canDeleteDirectly(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}
const CLIENT_MANAGER_ROLES: UserRole[] = ["super_admin", "branch_admin", "reception"];
const MEMBERSHIP_MANAGER_ROLES: UserRole[] = ["super_admin", "branch_admin", "reception"];
const CLASS_VIEWER_ROLES: UserRole[] = ["super_admin", "branch_admin", "reception", "trainer"];

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
  return session.user as SessionUser;
}

/** Requiere rol admin (super_admin o branch_admin), redirige al dashboard si no */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (!ADMIN_ROLES.includes(user.role)) redirect("/dashboard");
  return user;
}

/** Requiere super_admin exclusivamente */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (user.role !== "super_admin") redirect("/dashboard");
  return user;
}

/** ¿Puede el usuario de sesión gestionar una sucursal dada? */
export function canManageBranch(user: SessionUser, branchId: string): boolean {
  if (user.role === "super_admin") return true;
  if (user.role === "branch_admin") return user.branch_id === branchId;
  return false;
}

/** Requiere rol que puede gestionar clientes (super_admin, branch_admin, reception) */
export async function requireClientManager(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (!CLIENT_MANAGER_ROLES.includes(user.role)) redirect("/dashboard");
  return user;
}

/** Requiere rol que puede gestionar membresías (super_admin, branch_admin, reception) */
export async function requireMembershipManager(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (!MEMBERSHIP_MANAGER_ROLES.includes(user.role)) redirect("/dashboard");
  return user;
}

/** Requiere rol que puede ver clases (super_admin, branch_admin, reception, trainer) */
export async function requireClassViewer(): Promise<SessionUser> {
  const user = await getSessionOrRedirect();
  if (!CLASS_VIEWER_ROLES.includes(user.role)) redirect("/dashboard");
  return user;
}

/** ¿Puede el usuario de sesión gestionar un plan de membresía? */
export function canManagePlan(
  sessionUser: SessionUser,
  plan: { branch_id: string | null }
): boolean {
  if (sessionUser.role === "super_admin") return true;
  if (sessionUser.role === "branch_admin") {
    return plan.branch_id === sessionUser.branch_id;
  }
  return false;
}

/** ¿Puede el usuario de sesión gestionar una membresía de cliente? */
export function canManageMembership(
  sessionUser: SessionUser,
  membership: { branch_id: string }
): boolean {
  if (sessionUser.role === "super_admin") return true;
  if (sessionUser.role === "branch_admin" || sessionUser.role === "reception") {
    return sessionUser.branch_id === membership.branch_id;
  }
  return false;
}

/** ¿Puede el usuario de sesión gestionar una clase programada? */
export function canManageClass(
  sessionUser: SessionUser,
  scheduledClass: { branch_id: string }
): boolean {
  if (sessionUser.role === "super_admin") return true;
  if (sessionUser.role === "branch_admin" || sessionUser.role === "reception") {
    return sessionUser.branch_id === scheduledClass.branch_id;
  }
  return false;
}

/** ¿Puede el usuario de sesión gestionar un entrenador dado? */
export function canManageTrainer(
  sessionUser: SessionUser,
  trainer: { branch_id: string }
): boolean {
  if (sessionUser.role === "super_admin") return true;
  if (sessionUser.role === "branch_admin") {
    return sessionUser.branch_id === trainer.branch_id;
  }
  return false;
}

/** ¿Puede el usuario de sesión gestionar un cliente dado? */
export function canManageClient(
  sessionUser: SessionUser,
  client: { branch_id: string }
): boolean {
  if (sessionUser.role === "super_admin") return true;
  if (
    sessionUser.role === "branch_admin" ||
    sessionUser.role === "reception"
  ) {
    return sessionUser.branch_id === client.branch_id;
  }
  return false;
}

/** ¿Puede el usuario de sesión gestionar una plantilla de plan semanal? */
export function canManageWeeklyPlanTemplate(
  sessionUser: SessionUser,
  template: { branch_id: string | null }
): boolean {
  if (sessionUser.role === "super_admin") return true;
  if (sessionUser.role === "branch_admin") {
    return (
      template.branch_id === null ||
      template.branch_id === sessionUser.branch_id
    );
  }
  return false;
}

/** ¿Puede el usuario de sesión gestionar un plan semanal de cliente? */
export function canManageClientWeeklyPlan(
  sessionUser: SessionUser,
  plan: { branch_id: string }
): boolean {
  if (sessionUser.role === "super_admin") return true;
  if (
    sessionUser.role === "branch_admin" ||
    sessionUser.role === "reception" ||
    sessionUser.role === "trainer"
  ) {
    return sessionUser.branch_id === plan.branch_id;
  }
  return false;
}

/** ¿Puede el usuario de sesión gestionar a otro usuario? */
export function canManageUser(
  sessionUser: SessionUser,
  target: { branch_id: string | null; role: UserRole }
): boolean {
  if (sessionUser.role === "super_admin") return true;
  if (sessionUser.role === "branch_admin") {
    return (
      sessionUser.branch_id === target.branch_id &&
      target.role !== "super_admin" &&
      target.role !== "branch_admin"
    );
  }
  return false;
}
