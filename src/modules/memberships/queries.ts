import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";
import type { Status, PaymentStatus, MembershipStatus } from "@prisma/client";

// ── Helpers de scope ────────────────────────────────────────

function gymScope(user: SessionUser) {
  return { gym_id: user.gym_id };
}

function branchScope(user: SessionUser): Record<string, unknown> {
  if (user.role === "super_admin") return {};
  return { branch_id: user.branch_id! };
}

// ── Planes de membresía ─────────────────────────────────────

export interface PlanFilters {
  search?: string;
  status?: Status;
  branch_id?: string;
}

export async function getMembershipPlans(user: SessionUser, filters: PlanFilters = {}) {
  const where: Record<string, unknown> = { ...gymScope(user) };

  if (user.role !== "super_admin") {
    // branch_admin ve planes globales + los de su sucursal
    where.OR = [{ branch_id: null }, { branch_id: user.branch_id }];
  } else if (filters.branch_id) {
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
    where.AND = [searchCondition];
  }

  return prisma.membershipPlan.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      _count: { select: { client_memberships: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function getMembershipPlanById(id: string, user: SessionUser) {
  return prisma.membershipPlan.findFirst({
    where: { id, ...gymScope(user) },
  });
}

/** Planes activos disponibles para asignar (global + de la sucursal del usuario) */
export async function getActivePlansForAssignment(user: SessionUser) {
  const where: Record<string, unknown> = {
    ...gymScope(user),
    status: "active",
  };

  if (user.role !== "super_admin") {
    where.OR = [{ branch_id: null }, { branch_id: user.branch_id }];
  }

  const plans = await prisma.membershipPlan.findMany({
    where,
    select: {
      id: true,
      name: true,
      code: true,
      price: true,
      duration_days: true,
      access_type: true,
      sessions_limit: true,
    },
    orderBy: { name: "asc" },
  });

  // Convertir Decimal a string para serialización segura en Client Components
  return plans.map((p) => ({
    ...p,
    price: p.price.toString(),
  }));
}

// ── Membresías de clientes ───────────────────────────────────

export interface MembershipFilters {
  search?: string;
  status?: MembershipStatus;
  payment_status?: PaymentStatus;
  branch_id?: string;
  /** "expiring" = vence en 7 días · "expired" = ya venció */
  view?: "expiring" | "expired" | "active";
}

export async function getClientMemberships(
  user: SessionUser,
  filters: MembershipFilters = {}
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);

  const where: Record<string, unknown> = { ...gymScope(user), ...branchScope(user) };

  if (user.role === "super_admin" && filters.branch_id) {
    where.branch_id = filters.branch_id;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.payment_status) {
    where.payment_status = filters.payment_status;
  }

  if (filters.view === "expiring") {
    where.status = "active";
    where.end_date = { gte: today, lte: in7Days };
  } else if (filters.view === "expired") {
    where.OR = [{ status: "expired" }, { end_date: { lt: today } }];
  } else if (filters.view === "active") {
    where.status = "active";
    where.end_date = { gte: today };
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

  return prisma.clientMembership.findMany({
    where,
    include: {
      client: { select: { id: true, first_name: true, last_name: true, email: true } },
      membership_plan: { select: { id: true, name: true, access_type: true } },
      branch: { select: { id: true, name: true } },
      sold_by: { select: { id: true, first_name: true, last_name: true } },
    },
    orderBy: { end_date: "asc" },
  });
}

export async function getClientMembershipById(id: string, user: SessionUser) {
  return prisma.clientMembership.findFirst({
    where: { id, ...gymScope(user), ...branchScope(user) },
    include: {
      client: { select: { id: true, first_name: true, last_name: true, email: true } },
      membership_plan: {
        select: { id: true, name: true, price: true, duration_days: true, access_type: true },
      },
      branch: { select: { id: true, name: true } },
      sold_by: { select: { id: true, first_name: true, last_name: true } },
    },
  });
}

/** Membresías de un cliente específico (para ficha de cliente) */
export async function getClientMembershipsByClientId(
  clientId: string,
  user: SessionUser
) {
  return prisma.clientMembership.findMany({
    where: { client_id: clientId, ...gymScope(user), ...branchScope(user) },
    include: {
      membership_plan: { select: { id: true, name: true, access_type: true } },
    },
    orderBy: { start_date: "desc" },
    take: 10,
  });
}

/** Clientes activos para selector (scope por sucursal) */
export async function getActiveClientsForSelect(user: SessionUser) {
  const where: Record<string, unknown> = {
    ...gymScope(user),
    ...branchScope(user),
    status: "active",
  };

  return prisma.client.findMany({
    where,
    select: { id: true, first_name: true, last_name: true, document_id: true },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
}
