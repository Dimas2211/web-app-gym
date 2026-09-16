import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";

// ──────────────────────────────────────────────
// Gym
// ──────────────────────────────────────────────

/**
 * Obtiene el gimnasio del tenant EFECTIVO. `client` opcional: en modo
 * normal usa el singleton `prisma`; en páginas runtime-aware ("Operar
 * como cliente") el caller pasa `context.client` junto con un `user`
 * cuyo tenant_id ya es el tenant EFECTIVO — evita mostrar el nombre del
 * gimnasio real del super_admin en credenciales de otro tenant.
 */
export async function getGym(user: SessionUser, client: PrismaClient = prisma) {
  if (!user.tenant_id) return null;
  return client.gym.findUnique({ where: { id: user.tenant_id } });
}

// ──────────────────────────────────────────────
// GymSettings
// ──────────────────────────────────────────────

/**
 * Devuelve la configuración del gym o los valores por defecto si no existe.
 * `client` opcional: en modo runtime ("Operar como cliente") el caller pasa
 * `context.client` junto con el tenantId EFECTIVO.
 */
export async function getGymSettings(tenantId: string, client: PrismaClient = prisma) {
  const s = await client.gymSettings.findUnique({ where: { gym_id: tenantId } });
  return {
    id: s?.id ?? null,
    gym_id: tenantId,
    staff_code_prefix: s?.staff_code_prefix ?? "A",
    staff_code_digits: s?.staff_code_digits ?? 4,
    staff_code_start: s?.staff_code_start ?? 1010,
    client_code_prefix: s?.client_code_prefix ?? "C",
    client_code_digits: s?.client_code_digits ?? 4,
    client_code_start: s?.client_code_start ?? 1010,
  };
}

// ──────────────────────────────────────────────
// Sports
// ──────────────────────────────────────────────

/** Lista todos los deportes (catálogo global). `client` opcional: runtime-aware. */
export async function getSports(client: PrismaClient = prisma) {
  return client.sport.findMany({
    where: { status: { not: "deleted" } },
    include: {
      _count: { select: { clients: true, weekly_plan_templates: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Obtiene un deporte por id. `client` opcional: runtime-aware. */
export async function getSportById(id: string, client: PrismaClient = prisma) {
  return client.sport.findUnique({ where: { id } });
}

// ──────────────────────────────────────────────
// Goals
// ──────────────────────────────────────────────

/** Lista todas las metas de entrenamiento (catálogo global). `client` opcional: runtime-aware. */
export async function getGoals(client: PrismaClient = prisma) {
  return client.goal.findMany({
    where: { status: { not: "deleted" } },
    include: {
      _count: { select: { clients: true, weekly_plan_templates: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Obtiene una meta por id. `client` opcional: runtime-aware. */
export async function getGoalById(id: string, client: PrismaClient = prisma) {
  return client.goal.findUnique({ where: { id } });
}
