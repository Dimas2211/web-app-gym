/**
 * Guards genéricos para la capa core de la plataforma.
 *
 * ESTADO: Fase 2 — convive con @/lib/permissions/guards.ts sin reemplazarlo.
 * Los módulos GYM existentes siguen usando sus guards actuales sin cambio.
 * Estos guards están destinados a módulos nuevos en src/core/ y src/commerce/.
 *
 * DIFERENCIA CON LOS GUARDS GYM:
 * - Usan CoreSessionUser (tenant_id / location_id) en lugar de gym_id / branch_id.
 * - Las decisiones de acceso usan getCapabilities() en lugar de comparar
 *   nombres de rol hardcodeados.
 * - Son cross-industry: funcionan con cualquier mapa de capacidades registrado.
 *
 * DEPENDENCIAS:
 * - @/lib/auth/auth → auth() de NextAuth (no se modifica, solo se consume)
 * - @/core/auth/types → CoreSessionUser, GymSessionUser, toCoreSessionUser
 * - @/core/permissions/role-capabilities → getCapabilities
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import {
  toCoreSessionUser,
  type CoreSessionUser,
  type GymSessionUser,
} from "@/core/auth/types";
import { getCapabilities } from "@/core/permissions/role-capabilities";

// ─── Obtención de sesión ───────────────────────────────────────────────────────

/**
 * Retorna el usuario de sesión como CoreSessionUser o redirige a /login.
 * Punto de entrada para todos los guards core.
 */
export async function getCoreSession(): Promise<CoreSessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return toCoreSessionUser(session.user as GymSessionUser);
}

// ─── Guards de acceso por capacidad ───────────────────────────────────────────

/**
 * Requiere acceso global al tenant (isGlobal === true).
 * Equivalente a requireSuperAdmin() en el sistema GYM.
 * Redirige al dashboard si la capacidad no se cumple.
 */
export async function requireGlobalAccess(): Promise<CoreSessionUser> {
  const user = await getCoreSession();
  if (!getCapabilities(user.role).isGlobal) redirect("/dashboard");
  return user;
}

/**
 * Requiere capacidad de gestionar staff (canManageStaff === true).
 * Equivalente a requireAdmin() en el sistema GYM.
 */
export async function requireStaffManager(): Promise<CoreSessionUser> {
  const user = await getCoreSession();
  if (!getCapabilities(user.role).canManageStaff) redirect("/dashboard");
  return user;
}

/**
 * Requiere capacidad de gestionar miembros/clientes (canManageMembers === true).
 * Equivalente a requireClientManager() en el sistema GYM.
 */
export async function requireMemberManager(): Promise<CoreSessionUser> {
  const user = await getCoreSession();
  if (!getCapabilities(user.role).canManageMembers) redirect("/dashboard");
  return user;
}

/**
 * Requiere capacidad de ver operaciones (canViewOperations === true).
 * Equivalente a requireClassViewer() en el sistema GYM.
 */
export async function requireOperationsViewer(): Promise<CoreSessionUser> {
  const user = await getCoreSession();
  if (!getCapabilities(user.role).canViewOperations) redirect("/dashboard");
  return user;
}

/**
 * Requiere capacidad de ver reportes (canViewReports === true).
 */
export async function requireReportsViewer(): Promise<CoreSessionUser> {
  const user = await getCoreSession();
  if (!getCapabilities(user.role).canViewReports) redirect("/dashboard");
  return user;
}

// ─── Helpers de scope de recurso (síncronos) ──────────────────────────────────

/**
 * Verifica que el usuario pertenece al mismo tenant que el recurso.
 * Barrera mínima de multi-tenancy: siempre debe cumplirse.
 */
export function canAccessTenantResource(
  user: CoreSessionUser,
  resource: { tenant_id: string }
): boolean {
  return user.tenant_id === resource.tenant_id;
}

/**
 * Verifica que el usuario puede acceder a un recurso según su scope de ubicación.
 *
 * - scope "global"   → accede a cualquier recurso del tenant
 * - scope "location" → solo accede si su location_id coincide con el recurso
 * - scope "own_data" → no accede a recursos de ubicación (usa isOwnResource)
 */
export function canAccessLocationResource(
  user: CoreSessionUser,
  resource: { location_id: string | null }
): boolean {
  const { scopeType } = getCapabilities(user.role);
  if (scopeType === "global") return true;
  if (scopeType === "location") return user.location_id === resource.location_id;
  return false;
}

/**
 * Verifica que el recurso pertenece directamente al usuario autenticado.
 * Usado para scope "own_data" (clientes/miembros accediendo a sus propios registros).
 */
export function isOwnResource(
  user: CoreSessionUser,
  resourceOwnerId: string
): boolean {
  return user.id === resourceOwnerId;
}

/**
 * Combinación de tenant + location scope en una sola llamada.
 * Cubre el caso más común: recurso que pertenece a un tenant y una ubicación.
 */
export function canAccessResource(
  user: CoreSessionUser,
  resource: { tenant_id: string; location_id: string | null }
): boolean {
  return (
    canAccessTenantResource(user, resource) &&
    canAccessLocationResource(user, resource)
  );
}
