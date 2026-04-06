/**
 * Queries de lectura del dominio User core.
 *
 * FUENTE TEMPORAL: tabla `users` del schema actual.
 * Cuando se complete la Fase 3 del roadmap, solo cambia el mapper interno.
 *
 * MODO: read-only. Sin mutaciones, sin lógica GYM.
 * Excluye: password_hash, operational_code, qr_token, trainer_profile, client_profile.
 */

import { prisma } from "@/lib/db/prisma";
import type { CoreUser, UserSummary } from "./types";

// ─── Mapper interno ────────────────────────────────────────────────────────────

/**
 * Convierte un registro User al contrato CoreUser.
 *
 * Campos incluidos: id, gym_id→tenant_id, branch_id→location_id,
 *   email, first_name, last_name, role (string), status, avatar_url, timestamps.
 *
 * Campos excluidos deliberadamente:
 *   password_hash   — dato sensible, nunca exponer fuera del módulo de auth
 *   operational_code — semántica GYM (código interno de gymansio)
 *   qr_token        — semántica GYM (acceso físico por QR)
 *
 * NORMALIZACIÓN DE STATUS:
 * El enum Prisma Status incluye "deleted" (soft-delete interno GYM).
 * CoreUser no contempla ese estado — se normaliza a "inactive".
 * Las queries filtran status !== "deleted" para evitar exponerlos.
 */
function userToCoreUser(user: {
  id: string;
  gym_id: string;
  branch_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}): CoreUser {
  const statusMap: Record<string, CoreUser["status"]> = {
    active: "active",
    inactive: "inactive",
    suspended: "suspended",
    deleted: "inactive",
  };

  return {
    id: user.id,
    tenant_id: user.gym_id,
    location_id: user.branch_id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    status: statusMap[user.status] ?? "inactive",
    avatar_url: user.avatar_url,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

/** Campos User necesarios para el mapeo — excluye datos sensibles y GYM-específicos. */
const CORE_USER_SELECT = {
  id: true,
  gym_id: true,
  branch_id: true,
  email: true,
  first_name: true,
  last_name: true,
  role: true,
  status: true,
  avatar_url: true,
  created_at: true,
  updated_at: true,
  // Excluidos: password_hash, operational_code, qr_token
  // Excluidas relaciones: trainer_profile, client_profile, branch, memberships_sold, clients_assigned
} as const;

// ─── Queries públicas ──────────────────────────────────────────────────────────

/**
 * Retorna un usuario core por su ID o null si no existe o está eliminado.
 */
export async function getCoreUserById(id: string): Promise<CoreUser | null> {
  const user = await prisma.user.findFirst({
    where: { id, status: { not: "deleted" } },
    select: CORE_USER_SELECT,
  });
  return user ? userToCoreUser(user) : null;
}

/**
 * Lista todos los usuarios activos de un tenant.
 * Excluye el rol "client": los clientes son entidades separadas en GYM
 * y no deberían aparecer en listados de staff cross-industry.
 */
export async function getCoreUsersByTenantId(tenantId: string): Promise<CoreUser[]> {
  const users = await prisma.user.findMany({
    where: {
      gym_id: tenantId,
      status: { not: "deleted" },
      role: { not: "client" },
    },
    select: CORE_USER_SELECT,
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
  return users.map(userToCoreUser);
}

/**
 * Lista usuarios de una ubicación específica dentro de un tenant.
 * Incluye solo staff (excluye "client").
 */
export async function getCoreUsersByLocationId(
  tenantId: string,
  locationId: string
): Promise<CoreUser[]> {
  const users = await prisma.user.findMany({
    where: {
      gym_id: tenantId,
      branch_id: locationId,
      status: { not: "deleted" },
      role: { not: "client" },
    },
    select: CORE_USER_SELECT,
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
  return users.map(userToCoreUser);
}

/**
 * Verifica si un usuario existe y está activo.
 */
export async function isCoreUserActive(id: string): Promise<boolean> {
  const user = await getCoreUserById(id);
  return user?.status === "active";
}

/**
 * Lista liviana de usuarios de un tenant para referencias y selects.
 * Retorna solo id, nombre, email y rol.
 */
export async function getCoreUserSummaries(tenantId: string): Promise<UserSummary[]> {
  const users = await prisma.user.findMany({
    where: {
      gym_id: tenantId,
      status: { not: "deleted" },
      role: { not: "client" },
    },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      role: true,
    },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
  return users;
}
