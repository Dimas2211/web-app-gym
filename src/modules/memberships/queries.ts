import { parseCalendarDate } from "@/lib/utils/business-date";
import { getMembershipToday } from "./membership-calendar";
import { membershipStatusWhere, withMembershipValidity } from "./membership-validity";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";
import type { Status, PaymentStatus, MembershipStatus } from "@prisma/client";

// ── Helpers de scope ────────────────────────────────────────
//
// PASO 6C — Runtime awareness (Auditoría de aislamiento GYM):
// Todas las queries exportadas de este archivo aceptan un `client`
// opcional (PrismaClient). En modo normal se usa el singleton `prisma`
// (comportamiento sin cambios). En páginas runtime-aware ("Operar como
// cliente"), el caller resuelve `resolveEffectiveTenantContext(user)` y
// pasa `context.client` aquí, junto con un `user` cuyo `tenant_id` ya es
// el tenant EFECTIVO — así el scope (gymScope/branchScope) y la fuente
// de datos (client) quedan siempre alineados al mismo tenant.

function gymScope(user: SessionUser) {
  return { tenant_id: user.tenant_id };
}

function branchScope(user: SessionUser): Record<string, unknown> {
  if (user.role === "super_admin") return {};
  return { branch_id: user.location_id! };
}

// ── Planes de membresía ─────────────────────────────────────

export interface PlanFilters {
  search?: string;
  status?: Status;
  branch_id?: string;
}

export async function getMembershipPlans(
  user: SessionUser,
  filters: PlanFilters = {},
  client: PrismaClient = prisma,
) {
  const where: Record<string, unknown> = { ...gymScope(user) };

  if (user.role !== "super_admin") {
    // branch_admin ve planes globales + los de su sucursal
    where.OR = [{ branch_id: null }, { branch_id: user.location_id }];
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

  return client.membershipPlan.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      _count: { select: { client_memberships: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function getMembershipPlanById(
  id: string,
  user: SessionUser,
  client: PrismaClient = prisma,
) {
  return client.membershipPlan.findFirst({
    where: { id, ...gymScope(user) },
  });
}

/** Planes activos disponibles para asignar (global + de la sucursal del usuario) */
export async function getActivePlansForAssignment(
  user: SessionUser,
  client: PrismaClient = prisma,
) {
  const where: Record<string, unknown> = {
    ...gymScope(user),
    status: "active",
  };

  if (user.role !== "super_admin") {
    where.OR = [{ branch_id: null }, { branch_id: user.location_id }];
  }

  const plans = await client.membershipPlan.findMany({
    where,
    select: {
      id: true,
      name: true,
      code: true,
      price: true,
      duration_days: true,
      access_type: true,
      sessions_limit: true,
      modality: true,
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
  filters: MembershipFilters = {},
  client: PrismaClient = prisma,
  todayIso?: string,
) {
  const today = todayIso ?? await getMembershipToday(client, user.tenant_id!);
  const todayDate = parseCalendarDate(today);
  const in7Days = new Date(todayDate.getTime() + 7 * 86400000);
  const conditions: Prisma.ClientMembershipWhereInput[] = [];

  const where: Record<string, unknown> = { ...gymScope(user), ...branchScope(user) };

  if (user.role === "super_admin" && filters.branch_id) {
    where.branch_id = filters.branch_id;
  }

  if (filters.status) {
    conditions.push(membershipStatusWhere(filters.status, today));
  }

  if (filters.payment_status) {
    where.payment_status = filters.payment_status;
  }

  if (filters.view === "expired") {
    conditions.push(membershipStatusWhere("expired", today));
  } else if (filters.view === "active" || filters.view === "expiring") {
    conditions.push(membershipStatusWhere("active", today));
    conditions.push({ start_date: { lte: todayDate } });
    if (filters.view === "expiring") conditions.push({ end_date: { lte: in7Days } });
  }
  if (conditions.length) where.AND = conditions;

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

  const rows = await client.clientMembership.findMany({
    where,
    include: {
      client: { select: { id: true, first_name: true, last_name: true, email: true } },
      membership_plan: { select: { id: true, name: true, access_type: true } },
      branch: { select: { id: true, name: true } },
      sold_by: { select: { id: true, first_name: true, last_name: true } },
    },
    orderBy: { end_date: "asc" },
  });
  return rows.map(row => withMembershipValidity(row, today));
}

export async function getClientMembershipById(
  id: string,
  user: SessionUser,
  client: PrismaClient = prisma,
) {
  const row = await client.clientMembership.findFirst({
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
  if (!row) return null;
  return withMembershipValidity(row, await getMembershipToday(client, user.tenant_id!));
}

/** Membresías de un cliente específico (para ficha de cliente) */
export async function getClientMembershipsByClientId(
  clientId: string,
  user: SessionUser,
  client: PrismaClient = prisma,
  todayIso?: string,
) {
  const today = todayIso ?? await getMembershipToday(client, user.tenant_id!);
  const rows = await client.clientMembership.findMany({
    where: { client_id: clientId, ...gymScope(user), ...branchScope(user) },
    include: {
      membership_plan: { select: { id: true, name: true, access_type: true } },
    },
    orderBy: { start_date: "desc" },
    take: 10,
  });
  return rows.map(row => withMembershipValidity(row, today));
}

/** Clientes activos para selector (scope por sucursal) */
export async function getActiveClientsForSelect(
  user: SessionUser,
  client: PrismaClient = prisma,
) {
  const where: Record<string, unknown> = {
    ...gymScope(user),
    ...branchScope(user),
    status: "active",
  };

  return client.client.findMany({
    where,
    select: { id: true, first_name: true, last_name: true, document_id: true },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });
}
