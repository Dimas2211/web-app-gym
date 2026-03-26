import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";
import type { Status } from "@prisma/client";

// ── Helpers de scope ─────────────────────────────────────────

function gymScope(user: SessionUser) {
  return { gym_id: user.gym_id };
}

function branchScope(user: SessionUser): Record<string, unknown> {
  if (user.role === "branch_admin" || user.role === "reception") {
    return { branch_id: user.branch_id! };
  }
  return {};
}

// ── Filtros ───────────────────────────────────────────────────

export interface TemplateFilters {
  search?: string;
  status?: Status;
  branch_id?: string;
  target_gender?: string;
  target_sport_id?: string;
  target_goal_id?: string;
  target_level?: string;
}

export interface ClientPlanFilters {
  search?: string;
  status?: Status;
  branch_id?: string;
  trainer_id?: string;
  client_id?: string;
}

// ── Plantillas ────────────────────────────────────────────────

export async function getWeeklyPlanTemplates(
  user: SessionUser,
  filters: TemplateFilters = {}
) {
  const where: Record<string, unknown> = { ...gymScope(user) };

  // branch_admin y reception: solo plantillas globales + de su sucursal
  if (user.role === "branch_admin" || user.role === "reception") {
    where.OR = [{ branch_id: null }, { branch_id: user.branch_id }];
  } else if (user.role === "super_admin" && filters.branch_id) {
    where.branch_id = filters.branch_id;
  }

  if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = { not: "deleted" };
  }

  if (filters.search) {
    const searchCondition = {
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { code: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ],
    };
    if (where.OR) {
      where.AND = [{ OR: where.OR as unknown[] }, searchCondition];
      delete where.OR;
    } else {
      Object.assign(where, searchCondition);
    }
  }

  if (filters.target_gender) where.target_gender = filters.target_gender;
  if (filters.target_sport_id) where.target_sport_id = filters.target_sport_id;
  if (filters.target_goal_id) where.target_goal_id = filters.target_goal_id;
  if (filters.target_level) where.target_level = filters.target_level;

  return prisma.weeklyPlanTemplate.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      target_sport: { select: { id: true, name: true } },
      target_goal: { select: { id: true, name: true } },
      _count: { select: { days: true, client_plans: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function getWeeklyPlanTemplateById(id: string, user: SessionUser) {
  const template = await prisma.weeklyPlanTemplate.findFirst({
    where: { id, ...gymScope(user) },
    include: {
      branch: { select: { id: true, name: true } },
      target_sport: { select: { id: true, name: true } },
      target_goal: { select: { id: true, name: true } },
      creator: { select: { id: true, first_name: true, last_name: true } },
      days: { orderBy: { weekday: "asc" } },
    },
  });
  return template;
}

export async function getTemplateOptions(user: SessionUser) {
  const where: Record<string, unknown> = {
    ...gymScope(user),
    status: "active",
  };

  if (user.role === "branch_admin" || user.role === "reception") {
    where.OR = [{ branch_id: null }, { branch_id: user.branch_id }];
  }

  return prisma.weeklyPlanTemplate.findMany({
    where,
    select: {
      id: true,
      name: true,
      code: true,
      target_level: true,
      _count: { select: { days: true } },
    },
    orderBy: { name: "asc" },
  });
}

// ── Planes de cliente ─────────────────────────────────────────

export async function getClientWeeklyPlans(
  user: SessionUser,
  filters: ClientPlanFilters = {}
) {
  const where: Record<string, unknown> = {
    ...gymScope(user),
    ...branchScope(user),
  };

  if (user.role === "super_admin" && filters.branch_id) {
    where.branch_id = filters.branch_id;
  }

  // trainer: solo sus planes asignados
  if (user.role === "trainer") {
    const linked = await getLinkedTrainerId(user.id, user.gym_id);
    where.trainer_id = linked ?? "__none__";
  } else if (filters.trainer_id) {
    where.trainer_id = filters.trainer_id;
  }

  if (filters.client_id) where.client_id = filters.client_id;

  if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = { not: "deleted" };
  }

  if (filters.search) {
    where.client = {
      OR: [
        { first_name: { contains: filters.search, mode: "insensitive" } },
        { last_name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { document_id: { contains: filters.search, mode: "insensitive" } },
      ],
    };
  }

  return prisma.clientWeeklyPlan.findMany({
    where,
    include: {
      client: { select: { id: true, first_name: true, last_name: true, email: true } },
      trainer: { select: { id: true, first_name: true, last_name: true } },
      template: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true } },
      _count: { select: { days: true } },
    },
    orderBy: [{ start_date: "desc" }],
  });
}

export async function getClientWeeklyPlanById(id: string, user: SessionUser) {
  const where: Record<string, unknown> = {
    id,
    ...gymScope(user),
    ...branchScope(user),
  };

  // trainer: solo sus planes
  if (user.role === "trainer") {
    const linked = await getLinkedTrainerId(user.id, user.gym_id);
    where.trainer_id = linked ?? "__none__";
  }

  return prisma.clientWeeklyPlan.findFirst({
    where,
    include: {
      client: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          branch_id: true,
        },
      },
      trainer: { select: { id: true, first_name: true, last_name: true } },
      template: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true } },
      days: { orderBy: { weekday: "asc" } },
    },
  });
}

/** Planes de un cliente para su ficha */
export async function getClientWeeklyPlansByClientId(
  clientId: string,
  user: SessionUser
) {
  return prisma.clientWeeklyPlan.findMany({
    where: {
      client_id: clientId,
      ...gymScope(user),
      ...branchScope(user),
      status: { not: "deleted" },
    },
    include: {
      trainer: { select: { id: true, first_name: true, last_name: true } },
      template: { select: { id: true, name: true } },
      days: { orderBy: { weekday: "asc" } },
    },
    orderBy: { start_date: "desc" },
    take: 10,
  });
}

// ── Helpers de formularios ────────────────────────────────────

export async function getTrainerOptionsForPlan(user: SessionUser) {
  const where: Record<string, unknown> = {
    ...gymScope(user),
    status: "active",
  };
  if (user.role === "branch_admin" || user.role === "reception") {
    where.branch_id = user.branch_id!;
  }
  return prisma.trainer.findMany({
    where,
    select: { id: true, first_name: true, last_name: true, branch_id: true },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
}

export async function getBranchOptionsForPlan(user: SessionUser) {
  const where: Record<string, unknown> = {
    ...gymScope(user),
    status: "active",
  };
  if (user.role === "branch_admin" || user.role === "reception") {
    where.id = user.branch_id!;
  }
  return prisma.branch.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getClientOptionsForPlan(user: SessionUser) {
  const where: Record<string, unknown> = {
    ...gymScope(user),
    ...branchScope(user),
    status: "active",
  };
  return prisma.client.findMany({
    where,
    select: { id: true, first_name: true, last_name: true, document_id: true, branch_id: true },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
    take: 500,
  });
}

export async function getSportOptions() {
  return prisma.sport.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getGoalOptions() {
  return prisma.goal.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// ── Trainer vinculado al usuario de sesión ────────────────────

export async function getLinkedTrainerId(
  userId: string,
  gymId: string
): Promise<string | null> {
  const trainer = await prisma.trainer.findFirst({
    where: { user_id: userId, gym_id: gymId, status: "active" },
    select: { id: true },
  });
  return trainer?.id ?? null;
}
