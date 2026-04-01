import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";

// ──────────────────────────────────────────────
// Gym
// ──────────────────────────────────────────────

/** Obtiene el gimnasio del usuario de sesión */
export async function getGym(user: SessionUser) {
  return prisma.gym.findUnique({ where: { id: user.gym_id } });
}

// ──────────────────────────────────────────────
// GymSettings
// ──────────────────────────────────────────────

/** Devuelve la configuración del gym o los valores por defecto si no existe */
export async function getGymSettings(gymId: string) {
  const s = await prisma.gymSettings.findUnique({ where: { gym_id: gymId } });
  return {
    id: s?.id ?? null,
    gym_id: gymId,
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

/** Lista todos los deportes (catálogo global) */
export async function getSports() {
  return prisma.sport.findMany({
    where: { status: { not: "deleted" } },
    include: {
      _count: { select: { clients: true, weekly_plan_templates: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Obtiene un deporte por id */
export async function getSportById(id: string) {
  return prisma.sport.findUnique({ where: { id } });
}

// ──────────────────────────────────────────────
// Goals
// ──────────────────────────────────────────────

/** Lista todas las metas de entrenamiento (catálogo global) */
export async function getGoals() {
  return prisma.goal.findMany({
    where: { status: { not: "deleted" } },
    include: {
      _count: { select: { clients: true, weekly_plan_templates: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Obtiene una meta por id */
export async function getGoalById(id: string) {
  return prisma.goal.findUnique({ where: { id } });
}
