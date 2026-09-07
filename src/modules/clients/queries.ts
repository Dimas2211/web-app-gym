import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";
import type { Status } from "@prisma/client";

// PASO 6D — Auditoría de aislamiento GYM (rutas transitivas): Client no
// tiene module code comercial propio (ver reports/clients/active/route.ts),
// pero SÍ es tenant-scoped. `client` opcional en toda query exportada: en
// modo normal usa el singleton `prisma` (sin cambios); en páginas
// runtime-aware ("Operar como cliente") el caller pasa `context.client`
// junto con un `user` cuyo tenant_id ya es el tenant EFECTIVO.

export interface ClientFilters {
  search?: string;
  status?: Status;
  branch_id?: string;
  goal_id?: string;
  sport_id?: string;
  trainer_id?: string;
}

function buildWhereClause(user: SessionUser, filters: ClientFilters) {
  const where: Record<string, unknown> = { tenant_id: user.tenant_id };

  // branch_admin y reception solo ven su sucursal
  if (user.role === "branch_admin" || user.role === "reception") {
    where.branch_id = user.location_id!;
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

export async function getClients(
  user: SessionUser,
  filters: ClientFilters = {},
  client: PrismaClient = prisma,
) {
  const where = buildWhereClause(user, filters);

  return client.client.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
      sport: { select: { id: true, name: true } },
      assigned_trainer: {
        select: { id: true, first_name: true, last_name: true },
      },
      user: { select: { id: true, email: true, status: true } },
    },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
}

export async function getClientById(id: string, user: SessionUser, client: PrismaClient = prisma) {
  const where: Record<string, unknown> = { id, tenant_id: user.tenant_id };
  if (user.role === "branch_admin" || user.role === "reception") {
    where.branch_id = user.location_id!;
  }

  return client.client.findFirst({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
      sport: { select: { id: true, name: true } },
      assigned_trainer: {
        select: { id: true, first_name: true, last_name: true },
      },
      user: { select: { id: true, email: true, status: true } },
    },
  });
}

export async function getTrainersForClient(user: SessionUser, client: PrismaClient = prisma) {
  const where: Record<string, unknown> = {
    tenant_id: user.tenant_id,
    role: "trainer",
    status: "active",
  };

  if (user.role === "branch_admin" || user.role === "reception") {
    where.branch_id = user.location_id!;
  }

  return client.user.findMany({
    where,
    select: { id: true, first_name: true, last_name: true },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
}

export async function getGoalOptions(client: PrismaClient = prisma) {
  return client.goal.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getSportOptions(client: PrismaClient = prisma) {
  return client.sport.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
