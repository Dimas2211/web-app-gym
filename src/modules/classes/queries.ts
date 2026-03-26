import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";
import type { Status } from "@prisma/client";

// ── Tipos de filtros ─────────────────────────────────────────

export interface ClassTypeFilters {
  search?: string;
  status?: Status;
}

export interface ScheduledClassFilters {
  date?: string;        // ISO date string "YYYY-MM-DD"
  branch_id?: string;
  trainer_id?: string;
  status?: string;
}

// ── Helpers ──────────────────────────────────────────────────

function branchScope(user: SessionUser): Record<string, unknown> {
  if (user.role === "branch_admin" || user.role === "reception") {
    return { branch_id: user.branch_id! };
  }
  return {};
}

// ── Class Types ───────────────────────────────────────────────

export async function getClassTypes(
  user: SessionUser,
  filters: ClassTypeFilters = {}
) {
  const where: Record<string, unknown> = { gym_id: user.gym_id };

  if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = { not: "deleted" };
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { code: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return prisma.classType.findMany({
    where,
    orderBy: { name: "asc" },
  });
}

export async function getClassTypeById(id: string, user: SessionUser) {
  return prisma.classType.findFirst({
    where: { id, gym_id: user.gym_id },
  });
}

export async function getClassTypeOptions(user: SessionUser) {
  return prisma.classType.findMany({
    where: { gym_id: user.gym_id, status: "active" },
    select: {
      id: true,
      name: true,
      default_duration_minutes: true,
      capacity_default: true,
    },
    orderBy: { name: "asc" },
  });
}

// ── Scheduled Classes ─────────────────────────────────────────

export async function getScheduledClasses(
  user: SessionUser,
  filters: ScheduledClassFilters = {}
) {
  const where: Record<string, unknown> = {
    gym_id: user.gym_id,
    ...branchScope(user),
  };

  if (filters.branch_id && user.role === "super_admin") {
    where.branch_id = filters.branch_id;
  }

  if (filters.trainer_id) where.trainer_id = filters.trainer_id;

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.date) {
    where.class_date = new Date(filters.date + "T00:00:00.000Z");
  }

  return prisma.scheduledClass.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      class_type: { select: { id: true, name: true } },
      trainer: { select: { id: true, first_name: true, last_name: true } },
      _count: {
        select: {
          bookings: { where: { booking_status: "confirmed" } },
        },
      },
    },
    orderBy: [{ class_date: "asc" }, { start_time: "asc" }],
  });
}

export async function getScheduledClassById(id: string, user: SessionUser) {
  const where: Record<string, unknown> = {
    id,
    gym_id: user.gym_id,
    ...branchScope(user),
  };

  return prisma.scheduledClass.findFirst({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      class_type: { select: { id: true, name: true, default_duration_minutes: true } },
      trainer: {
        select: { id: true, first_name: true, last_name: true, specialty: true },
      },
      creator: { select: { id: true, first_name: true, last_name: true } },
      bookings: {
        include: {
          client: {
            select: { id: true, first_name: true, last_name: true, email: true, phone: true },
          },
        },
        orderBy: { booked_at: "asc" },
      },
      attendance: {
        include: {
          client: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
        orderBy: { created_at: "asc" },
      },
    },
  });
}

// ── Form helpers ──────────────────────────────────────────────

export async function getTrainerOptionsForClass(user: SessionUser) {
  const where: Record<string, unknown> = {
    gym_id: user.gym_id,
    status: "active",
  };
  if (user.role === "branch_admin" || user.role === "reception") {
    where.branch_id = user.branch_id!;
  }
  return prisma.trainer.findMany({
    where,
    select: {
      id: true,
      first_name: true,
      last_name: true,
      branch_id: true,
      specialty: true,
    },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
}

export async function getBranchOptionsForClass(user: SessionUser) {
  const where: Record<string, unknown> = {
    gym_id: user.gym_id,
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

// Clientes de una sucursal no reservados aún para esta clase
export async function getAvailableClientsForBooking(
  scheduledClassId: string,
  user: SessionUser
) {
  // IDs ya reservados
  const bookedIds = await prisma.classBooking.findMany({
    where: {
      scheduled_class_id: scheduledClassId,
      booking_status: "confirmed",
    },
    select: { client_id: true },
  });
  const excludeIds = bookedIds.map((b) => b.client_id);

  const where: Record<string, unknown> = {
    gym_id: user.gym_id,
    status: "active",
    id: excludeIds.length ? { notIn: excludeIds } : undefined,
    ...branchScope(user),
  };

  return prisma.client.findMany({
    where,
    select: { id: true, first_name: true, last_name: true, email: true },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
    take: 200,
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

// ── Clases del entrenador (para ficha de trainer) ─────────────

export async function getTrainerUpcomingClasses(
  trainerId: string,
  user: SessionUser
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const where: Record<string, unknown> = {
    trainer_id: trainerId,
    gym_id: user.gym_id,
    class_date: { gte: today },
    status: { in: ["scheduled", "in_progress"] },
    ...branchScope(user),
  };

  return prisma.scheduledClass.findMany({
    where,
    include: {
      class_type: { select: { name: true } },
      branch: { select: { name: true } },
      _count: { select: { bookings: { where: { booking_status: "confirmed" } } } },
    },
    orderBy: [{ class_date: "asc" }, { start_time: "asc" }],
    take: 10,
  });
}
