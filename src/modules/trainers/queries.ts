import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";
import type { Status } from "@prisma/client";

export interface TrainerFilters {
  search?: string;
  status?: Status;
  branch_id?: string;
}

function buildWhereClause(user: SessionUser, filters: TrainerFilters) {
  const where: Record<string, unknown> = { gym_id: user.gym_id };

  // branch_admin solo ve su sucursal
  if (user.role === "branch_admin") {
    where.branch_id = user.branch_id!;
  } else if (filters.branch_id) {
    where.branch_id = filters.branch_id;
  }

  if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = { not: "deleted" };
  }

  if (filters.search) {
    where.OR = [
      { first_name: { contains: filters.search, mode: "insensitive" } },
      { last_name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search, mode: "insensitive" } },
      { specialty: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function getTrainers(
  user: SessionUser,
  filters: TrainerFilters = {}
) {
  const where = buildWhereClause(user, filters);

  return prisma.trainer.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, first_name: true, last_name: true } },
    },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
}

export async function getTrainerById(id: string, user: SessionUser) {
  const where: Record<string, unknown> = { id, gym_id: user.gym_id };
  if (user.role === "branch_admin") {
    where.branch_id = user.branch_id!;
  }

  return prisma.trainer.findFirst({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      user: {
        select: { id: true, email: true, first_name: true, last_name: true, role: true },
      },
      availability: {
        where: { status: "active" },
        orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
      },
    },
  });
}

export async function getTrainerAvailability(trainerId: string) {
  return prisma.trainerAvailability.findMany({
    where: { trainer_id: trainerId, status: "active" },
    orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
  });
}

// Clientes asignados al entrenador mediante su user_id
export async function getAssignedClients(trainer: { user_id: string | null }, user: SessionUser) {
  if (!trainer.user_id) return [];

  const where: Record<string, unknown> = {
    gym_id: user.gym_id,
    assigned_trainer_id: trainer.user_id,
    status: { not: "deleted" },
  };

  if (user.role === "branch_admin") {
    where.branch_id = user.branch_id!;
  }

  return prisma.client.findMany({
    where,
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      phone: true,
      status: true,
      branch: { select: { id: true, name: true } },
      memberships: {
        where: { status: "active" },
        select: { id: true, end_date: true, membership_plan: { select: { name: true } } },
        take: 1,
        orderBy: { end_date: "desc" },
      },
    },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
}

// Opciones de usuario con role=trainer disponibles para vincular a un trainer
// (usuarios que aún no tienen perfil de entrenador)
export async function getAvailableUserOptions(user: SessionUser, excludeTrainerId?: string) {
  const where: Record<string, unknown> = {
    gym_id: user.gym_id,
    role: "trainer",
    status: "active",
    // Excluir usuarios ya vinculados a otro trainer
    trainer_profile: null,
  };

  if (user.role === "branch_admin") {
    where.branch_id = user.branch_id!;
  }

  const available = await prisma.user.findMany({
    where,
    select: { id: true, first_name: true, last_name: true, email: true },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });

  // Si estamos editando, incluir también el usuario ya vinculado al trainer actual
  if (excludeTrainerId) {
    const current = await prisma.trainer.findUnique({
      where: { id: excludeTrainerId },
      select: { user: { select: { id: true, first_name: true, last_name: true, email: true } } },
    });
    if (current?.user) {
      const alreadyIn = available.find((u) => u.id === current.user!.id);
      if (!alreadyIn) available.unshift(current.user);
    }
  }

  return available;
}

export async function getBranchOptions(user: SessionUser) {
  const where: Record<string, unknown> = {
    gym_id: user.gym_id,
    status: "active",
  };
  if (user.role === "branch_admin") {
    where.id = user.branch_id!;
  }
  return prisma.branch.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
