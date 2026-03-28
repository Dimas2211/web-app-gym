import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type {
  ActiveClientItem,
  ActiveClientsFilters,
  ActiveClientsResponse,
  ActiveMembershipsByBranchFilters,
  ActiveMembershipsByBranchItem,
  ActiveMembershipsByBranchPlanItem,
  ActiveMembershipsByBranchResponse,
  AttendanceByDayItem,
  AttendanceByPeriodFilters,
  AttendanceByPeriodItem,
  AttendanceByPeriodResponse,
  ExpiringMembershipItem,
  ExpiringMembershipsFilters,
  ExpiringMembershipsResponse,
  LowAdherenceClientItem,
  LowAdherenceFilters,
  LowAdherenceResponse,
  RevenueByBranchFilters,
  RevenueByBranchItem,
  RevenueByBranchPlanItem,
  RevenueByBranchResponse,
  TrainerClassesTaughtFilters,
  TrainerClassesTaughtItem,
  TrainerClassesTaughtResponse,
} from "./types";

// ─── Membresías: Ingresos por sucursal ────────────────────────────────────────

export async function getRevenueByBranch(
  filters: RevenueByBranchFilters
): Promise<RevenueByBranchResponse> {
  const { gymId, branchId, dateFrom, dateTo } = filters;

  const where: Prisma.ClientMembershipWhereInput = {
    gym_id: gymId,
    status: "active",
    payment_status: { in: ["paid", "partial"] },
    ...(branchId && { branch_id: branchId }),
    ...(dateFrom || dateTo
      ? {
          start_date: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          },
        }
      : {}),
  };

  // Group by branch + plan to build nested breakdown
  const grouped = await prisma.clientMembership.groupBy({
    by: ["branch_id", "membership_plan_id"],
    where,
    _sum: { final_amount: true },
    _count: { id: true },
  });

  if (grouped.length === 0) {
    return {
      summary: { netRevenue: 0, membershipsSold: 0, averageTicket: 0, topBranch: null },
      items: [],
    };
  }

  const branchIds = [...new Set(grouped.map((g) => g.branch_id))];
  const planIds = [...new Set(grouped.map((g) => g.membership_plan_id))];

  const [branches, plans] = await Promise.all([
    prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }),
    prisma.membershipPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } }),
  ]);

  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const planMap = new Map(plans.map((p) => [p.id, p.name]));

  // Aggregate by branch accumulating plan breakdown
  const branchDataMap = new Map<
    string,
    { membershipsSold: number; netRevenue: number; planBreakdown: RevenueByBranchPlanItem[] }
  >();

  for (const g of grouped) {
    const revenue = Number(g._sum.final_amount ?? 0);
    const count = g._count.id;
    const planItem: RevenueByBranchPlanItem = {
      planId: g.membership_plan_id,
      planName: planMap.get(g.membership_plan_id) ?? "Desconocido",
      membershipsSold: count,
      netRevenue: revenue,
      averageTicket: count > 0 ? revenue / count : 0,
    };
    const existing = branchDataMap.get(g.branch_id);
    if (existing) {
      existing.membershipsSold += count;
      existing.netRevenue += revenue;
      existing.planBreakdown.push(planItem);
    } else {
      branchDataMap.set(g.branch_id, {
        membershipsSold: count,
        netRevenue: revenue,
        planBreakdown: [planItem],
      });
    }
  }

  const items: RevenueByBranchItem[] = Array.from(branchDataMap.entries())
    .map(([bId, data]) => ({
      branchId: bId,
      branchName: branchMap.get(bId) ?? "Desconocida",
      membershipsSold: data.membershipsSold,
      netRevenue: data.netRevenue,
      averageTicket: data.membershipsSold > 0 ? data.netRevenue / data.membershipsSold : 0,
      planBreakdown: data.planBreakdown.sort((a, b) => b.netRevenue - a.netRevenue),
    }))
    .sort((a, b) => b.netRevenue - a.netRevenue);

  const totalRevenue = items.reduce((s, i) => s + i.netRevenue, 0);
  const totalCount = items.reduce((s, i) => s + i.membershipsSold, 0);

  return {
    summary: {
      netRevenue: totalRevenue,
      membershipsSold: totalCount,
      averageTicket: totalCount > 0 ? totalRevenue / totalCount : 0,
      topBranch: items[0]
        ? { branchId: items[0].branchId, branchName: items[0].branchName, revenue: items[0].netRevenue }
        : null,
    },
    items,
  };
}

// ─── Membresías: Por vencer ────────────────────────────────────────────────────

export async function getExpiringMemberships(
  filters: ExpiringMembershipsFilters
): Promise<ExpiringMembershipsResponse> {
  const { gymId, branchId, daysAhead = 30 } = filters;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const future = new Date(today);
  future.setDate(future.getDate() + daysAhead);

  const oneWeekAhead = new Date(today);
  oneWeekAhead.setDate(oneWeekAhead.getDate() + 7);

  const records = await prisma.clientMembership.findMany({
    where: {
      gym_id: gymId,
      status: "active",
      end_date: { gte: today, lte: future },
      ...(branchId && { branch_id: branchId }),
    },
    include: {
      client: { select: { first_name: true, last_name: true } },
      branch: { select: { name: true } },
      membership_plan: { select: { name: true } },
    },
    orderBy: { end_date: "asc" },
  });

  const items: ExpiringMembershipItem[] = records.map((r) => {
    const endDate = new Date(r.end_date);
    const diffMs = endDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return {
      membershipId: r.id,
      clientId: r.client_id,
      clientName: `${r.client.first_name} ${r.client.last_name}`,
      branchId: r.branch_id,
      branchName: r.branch.name,
      planName: r.membership_plan.name,
      endDate: endDate.toISOString().split("T")[0],
      daysRemaining,
      paymentStatus: r.payment_status,
      finalAmount: Number(r.final_amount),
    };
  });

  const expiringThisWeek = items.filter((i) => i.daysRemaining <= 7).length;
  const revenueAtRisk = items.reduce((s, i) => s + i.finalAmount, 0);

  return {
    summary: { total: items.length, expiringThisWeek, revenueAtRisk },
    items,
  };
}

// ─── Membresías: Activas por sucursal ─────────────────────────────────────────

export async function getActiveMembershipsByBranch(
  filters: ActiveMembershipsByBranchFilters
): Promise<ActiveMembershipsByBranchResponse> {
  const { gymId, branchId } = filters;

  const grouped = await prisma.clientMembership.groupBy({
    by: ["branch_id", "membership_plan_id"],
    where: {
      gym_id: gymId,
      status: "active",
      ...(branchId && { branch_id: branchId }),
    },
    _count: { id: true },
    _sum: { final_amount: true },
  });

  if (grouped.length === 0) {
    return {
      summary: { totalActive: 0, branchesWithActive: 0, totalValue: 0 },
      items: [],
    };
  }

  const branchIds = [...new Set(grouped.map((g) => g.branch_id))];
  const planIds = [...new Set(grouped.map((g) => g.membership_plan_id))];

  const [branches, plans] = await Promise.all([
    prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }),
    prisma.membershipPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } }),
  ]);

  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const planMap = new Map(plans.map((p) => [p.id, p.name]));

  const branchDataMap = new Map<
    string,
    { activeCount: number; totalValue: number; planBreakdown: ActiveMembershipsByBranchPlanItem[] }
  >();

  for (const g of grouped) {
    const count = g._count.id;
    const value = Number(g._sum.final_amount ?? 0);
    const planItem: ActiveMembershipsByBranchPlanItem = {
      planId: g.membership_plan_id,
      planName: planMap.get(g.membership_plan_id) ?? "Desconocido",
      activeCount: count,
      totalValue: value,
    };
    const existing = branchDataMap.get(g.branch_id);
    if (existing) {
      existing.activeCount += count;
      existing.totalValue += value;
      existing.planBreakdown.push(planItem);
    } else {
      branchDataMap.set(g.branch_id, { activeCount: count, totalValue: value, planBreakdown: [planItem] });
    }
  }

  const items: ActiveMembershipsByBranchItem[] = Array.from(branchDataMap.entries())
    .map(([bId, data]) => ({
      branchId: bId,
      branchName: branchMap.get(bId) ?? "Desconocida",
      activeCount: data.activeCount,
      totalValue: data.totalValue,
      planBreakdown: data.planBreakdown.sort((a, b) => b.activeCount - a.activeCount),
    }))
    .sort((a, b) => b.activeCount - a.activeCount);

  const totalActive = items.reduce((s, i) => s + i.activeCount, 0);
  const totalValue = items.reduce((s, i) => s + i.totalValue, 0);

  return {
    summary: { totalActive, branchesWithActive: items.length, totalValue },
    items,
  };
}

// ─── Clientes: Activos ────────────────────────────────────────────────────────

export async function getActiveClients(
  filters: ActiveClientsFilters
): Promise<ActiveClientsResponse> {
  const { gymId, branchId } = filters;

  const clients = await prisma.client.findMany({
    where: {
      gym_id: gymId,
      status: "active",
      ...(branchId && { branch_id: branchId }),
    },
    include: {
      branch: { select: { name: true } },
      sport: { select: { name: true } },
      goal: { select: { name: true } },
      assigned_trainer: { select: { first_name: true, last_name: true } },
      memberships: {
        where: { status: "active" },
        select: { id: true, membership_plan: { select: { name: true } } },
        orderBy: { start_date: "desc" },
        take: 1,
      },
    },
    orderBy: [{ branch: { name: "asc" } }, { last_name: "asc" }],
  });

  const items: ActiveClientItem[] = clients.map((c) => ({
    clientId: c.id,
    clientName: `${c.first_name} ${c.last_name}`,
    branchId: c.branch_id,
    branchName: c.branch.name,
    email: c.email,
    phone: c.phone,
    sport: c.sport?.name ?? null,
    goal: c.goal?.name ?? null,
    assignedTrainer: c.assigned_trainer
      ? `${c.assigned_trainer.first_name} ${c.assigned_trainer.last_name}`
      : null,
    hasActiveMembership: c.memberships.length > 0,
    membershipPlanName: c.memberships[0]?.membership_plan?.name ?? null,
    createdAt: c.created_at.toISOString().split("T")[0],
  }));

  const withActiveMembership = items.filter((i) => i.hasActiveMembership).length;

  return {
    summary: {
      totalActive: items.length,
      withActiveMembership,
      withoutActiveMembership: items.length - withActiveMembership,
    },
    items,
  };
}

// ─── Clientes: Baja adherencia ────────────────────────────────────────────────

export async function getLowAdherenceClients(
  filters: LowAdherenceFilters
): Promise<LowAdherenceResponse> {
  const { gymId, branchId, dateFrom, dateTo, threshold = 50 } = filters;

  const attendances = await prisma.classAttendance.findMany({
    where: {
      scheduled_class: {
        gym_id: gymId,
        ...(branchId && { branch_id: branchId }),
        ...(dateFrom || dateTo
          ? {
              class_date: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo) }),
              },
            }
          : {}),
      },
    },
    select: {
      client_id: true,
      attendance_status: true,
      client: {
        select: { first_name: true, last_name: true, branch_id: true, branch: { select: { name: true } } },
      },
    },
  });

  if (attendances.length === 0) {
    return {
      summary: { totalAnalyzed: 0, lowAdherenceCount: 0, avgAttendanceRate: 0, threshold },
      items: [],
    };
  }

  // Aggregate by client
  const clientMap = new Map<
    string,
    { name: string; branchId: string; branchName: string; total: number; attended: number; absent: number }
  >();

  for (const a of attendances) {
    const existing = clientMap.get(a.client_id);
    const isAttended = a.attendance_status === "attended" || a.attendance_status === "late";
    const isAbsent = a.attendance_status === "absent";

    if (existing) {
      existing.total += 1;
      if (isAttended) existing.attended += 1;
      if (isAbsent) existing.absent += 1;
    } else {
      clientMap.set(a.client_id, {
        name: `${a.client.first_name} ${a.client.last_name}`,
        branchId: a.client.branch_id,
        branchName: a.client.branch.name,
        total: 1,
        attended: isAttended ? 1 : 0,
        absent: isAbsent ? 1 : 0,
      });
    }
  }

  const allItems: LowAdherenceClientItem[] = Array.from(clientMap.entries()).map(
    ([clientId, data]) => ({
      clientId,
      clientName: data.name,
      branchId: data.branchId,
      branchName: data.branchName,
      totalClasses: data.total,
      attended: data.attended,
      absent: data.absent,
      attendanceRate: data.total > 0 ? Math.round((data.attended / data.total) * 100) : 0,
    })
  );

  const lowItems = allItems
    .filter((i) => i.attendanceRate < threshold)
    .sort((a, b) => a.attendanceRate - b.attendanceRate);

  const avgRate =
    allItems.length > 0
      ? Math.round(allItems.reduce((s, i) => s + i.attendanceRate, 0) / allItems.length)
      : 0;

  return {
    summary: {
      totalAnalyzed: allItems.length,
      lowAdherenceCount: lowItems.length,
      avgAttendanceRate: avgRate,
      threshold,
    },
    items: lowItems,
  };
}

// ─── Entrenadores: Clases impartidas ──────────────────────────────────────────

export async function getTrainerClassesTaught(
  filters: TrainerClassesTaughtFilters
): Promise<TrainerClassesTaughtResponse> {
  const { gymId, branchId, trainerId, dateFrom, dateTo } = filters;

  const classWhere: Prisma.ScheduledClassWhereInput = {
    gym_id: gymId,
    status: "completed",
    ...(branchId && { branch_id: branchId }),
    ...(trainerId && { trainer_id: trainerId }),
    ...(dateFrom || dateTo
      ? {
          class_date: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          },
        }
      : {}),
  };

  const classes = await prisma.scheduledClass.findMany({
    where: classWhere,
    select: {
      id: true,
      trainer_id: true,
      branch_id: true,
      trainer: { select: { first_name: true, last_name: true } },
      branch: { select: { name: true } },
      attendance: {
        where: { attendance_status: { in: ["attended", "late"] } },
        select: { id: true },
      },
    },
  });

  if (classes.length === 0) {
    return {
      summary: { totalClasses: 0, totalTrainers: 0, totalAttendees: 0, avgClassesPerTrainer: 0 },
      items: [],
    };
  }

  const trainerMap = new Map<
    string,
    { name: string; branchId: string; branchName: string; classes: number; attendees: number }
  >();

  for (const c of classes) {
    const existing = trainerMap.get(c.trainer_id);
    if (existing) {
      existing.classes += 1;
      existing.attendees += c.attendance.length;
    } else {
      trainerMap.set(c.trainer_id, {
        name: `${c.trainer.first_name} ${c.trainer.last_name}`,
        branchId: c.branch_id,
        branchName: c.branch.name,
        classes: 1,
        attendees: c.attendance.length,
      });
    }
  }

  const items: TrainerClassesTaughtItem[] = Array.from(trainerMap.entries())
    .map(([trainerId, data]) => ({
      trainerId,
      trainerName: data.name,
      branchId: data.branchId,
      branchName: data.branchName,
      classesTaught: data.classes,
      totalAttendees: data.attendees,
      avgAttendance: data.classes > 0 ? Math.round(data.attendees / data.classes) : 0,
    }))
    .sort((a, b) => b.classesTaught - a.classesTaught);

  const totalClasses = items.reduce((s, i) => s + i.classesTaught, 0);
  const totalAttendees = items.reduce((s, i) => s + i.totalAttendees, 0);

  return {
    summary: {
      totalClasses,
      totalTrainers: items.length,
      totalAttendees,
      avgClassesPerTrainer: items.length > 0 ? Math.round(totalClasses / items.length) : 0,
    },
    items,
  };
}

// ─── Asistencia: Por período ───────────────────────────────────────────────────

export async function getAttendanceByPeriod(
  filters: AttendanceByPeriodFilters
): Promise<AttendanceByPeriodResponse> {
  const { gymId, branchId, dateFrom, dateTo } = filters;

  const classes = await prisma.scheduledClass.findMany({
    where: {
      gym_id: gymId,
      class_date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
      ...(branchId && { branch_id: branchId }),
    },
    include: {
      branch: { select: { name: true } },
      trainer: { select: { first_name: true, last_name: true } },
      attendance: { select: { attendance_status: true } },
    },
    orderBy: { class_date: "asc" },
  });

  if (classes.length === 0) {
    return {
      summary: {
        totalSessions: 0,
        totalAttended: 0,
        totalAbsent: 0,
        overallAttendanceRate: 0,
        avgAttendancePerSession: 0,
      },
      byDay: [],
      items: [],
    };
  }

  // Per-class detail
  const items: AttendanceByPeriodItem[] = classes.map((c) => {
    const attended = c.attendance.filter(
      (a) => a.attendance_status === "attended" || a.attendance_status === "late"
    ).length;
    const absent = c.attendance.filter((a) => a.attendance_status === "absent").length;
    const total = c.attendance.length;
    return {
      scheduledClassId: c.id,
      date: new Date(c.class_date).toISOString().split("T")[0],
      classTitle: c.title,
      branchName: c.branch.name,
      trainerName: `${c.trainer.first_name} ${c.trainer.last_name}`,
      capacity: c.capacity,
      attended,
      absent,
      attendanceRate: total > 0 ? Math.round((attended / total) * 100) : 0,
    };
  });

  // Group by day for chart
  const dayMap = new Map<
    string,
    { sessions: number; attended: number; absent: number }
  >();
  for (const item of items) {
    const existing = dayMap.get(item.date);
    if (existing) {
      existing.sessions += 1;
      existing.attended += item.attended;
      existing.absent += item.absent;
    } else {
      dayMap.set(item.date, { sessions: 1, attended: item.attended, absent: item.absent });
    }
  }

  const byDay: AttendanceByDayItem[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => {
      const total = data.attended + data.absent;
      return {
        date,
        totalSessions: data.sessions,
        totalAttended: data.attended,
        totalAbsent: data.absent,
        attendanceRate: total > 0 ? Math.round((data.attended / total) * 100) : 0,
      };
    });

  const totalAttended = items.reduce((s, i) => s + i.attended, 0);
  const totalAbsent = items.reduce((s, i) => s + i.absent, 0);
  const total = totalAttended + totalAbsent;

  return {
    summary: {
      totalSessions: items.length,
      totalAttended,
      totalAbsent,
      overallAttendanceRate: total > 0 ? Math.round((totalAttended / total) * 100) : 0,
      avgAttendancePerSession: items.length > 0 ? Math.round(totalAttended / items.length) : 0,
    },
    byDay,
    items,
  };
}
