import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";
import type { Status } from "@prisma/client";

export interface ClientFilters {
  search?: string;
  status?: Status;
  branch_id?: string;
  goal_id?: string;
  sport_id?: string;
  trainer_id?: string;
}

function buildWhereClause(user: SessionUser, filters: ClientFilters) {
  const where: Record<string, unknown> = { gym_id: user.gym_id };

  // branch_admin y reception solo ven su sucursal
  if (user.role === "branch_admin" || user.role === "reception") {
    where.branch_id = user.branch_id!;
  } else if (filters.branch_id) {
    where.branch_id = filters.branch_id;
  }

  if (filters.status) {
    where.status = filters.status;
  } else {
    // Por defecto excluir eliminados
    where.status = { not: "deleted" };
  }

  if (filters.goal_id) where.goal_id = filters.goal_id;
  if (filters.sport_id) where.sport_id = filters.sport_id;
  if (filters.trainer_id) where.assigned_trainer_id = filters.trainer_id;

  if (filters.search) {
    where.OR = [
      { first_name: { contains: filters.search, mode: "insensitive" } },
      { last_name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search, mode: "insensitive" } },
      { document_id: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function getClients(user: SessionUser, filters: ClientFilters = {}) {
  const where = buildWhereClause(user, filters);

  return prisma.client.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
      sport: { select: { id: true, name: true } },
      assigned_trainer: {
        select: { id: true, first_name: true, last_name: true },
      },
    },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
}

export async function getClientById(id: string, user: SessionUser) {
  const where: Record<string, unknown> = { id, gym_id: user.gym_id };
  if (user.role === "branch_admin" || user.role === "reception") {
    where.branch_id = user.branch_id!;
  }

  return prisma.client.findFirst({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
      sport: { select: { id: true, name: true } },
      assigned_trainer: {
        select: { id: true, first_name: true, last_name: true },
      },
    },
  });
}

export async function getTrainersForClient(user: SessionUser) {
  const where: Record<string, unknown> = {
    gym_id: user.gym_id,
    role: "trainer",
    status: "active",
  };

  if (user.role === "branch_admin" || user.role === "reception") {
    where.branch_id = user.branch_id!;
  }

  return prisma.user.findMany({
    where,
    select: { id: true, first_name: true, last_name: true },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
}

export async function getGoalOptions() {
  return prisma.goal.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getSportOptions() {
  return prisma.sport.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
