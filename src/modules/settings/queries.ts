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
