// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — lecturas de las pantallas administrativas nuevas
// (series recurrentes y catálogo de actividades).
//
// Siempre con el PrismaClient y el tenant del contexto operacional
// efectivo; `locationId` = sucursal LIVE del BA (null = SA, todo el tenant).
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";

export async function getClassSeriesList(client: PrismaClient, tenantId: string, locationId: string | null) {
  return client.classSeries.findMany({
    where: { tenant_id: tenantId, ...(locationId ? { location_id: locationId } : {}) },
    include: {
      location: { select: { name: true } },
      trainer: { select: { first_name: true, last_name: true } },
      class_type: { select: { name: true } },
      _count: { select: { sessions: true } },
    },
    orderBy: [{ status: "asc" }, { weekday: "asc" }, { start_time: "asc" }],
  });
}

export async function getClassSeriesDetail(
  client: PrismaClient,
  tenantId: string,
  locationId: string | null,
  id: string
) {
  return client.classSeries.findFirst({
    where: { id, tenant_id: tenantId, ...(locationId ? { location_id: locationId } : {}) },
    include: {
      location: { select: { name: true } },
      trainer: { select: { first_name: true, last_name: true } },
      class_type: { select: { name: true } },
      sessions: {
        select: { id: true, class_date: true, start_time: true, end_time: true, status: true, booked_count: true, capacity: true },
        orderBy: { class_date: "desc" },
        take: 30,
      },
    },
  });
}

/** Opciones del formulario de serie: sedes, tipos y entrenadores activos del alcance. */
export async function getSeriesFormOptions(client: PrismaClient, tenantId: string, locationId: string | null) {
  const [branches, classTypes, trainers] = await Promise.all([
    client.branch.findMany({
      where: { tenant_id: tenantId, status: "active", ...(locationId ? { id: locationId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    client.classType.findMany({
      where: { tenant_id: tenantId, status: "active" },
      select: { id: true, name: true, capacity_default: true, default_duration_minutes: true },
      orderBy: { name: "asc" },
    }),
    client.trainer.findMany({
      where: { tenant_id: tenantId, status: "active", ...(locationId ? { branch_id: locationId } : {}) },
      select: { id: true, first_name: true, last_name: true, branch_id: true, specialty: true },
      orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
    }),
  ]);
  return { branches, classTypes, trainers };
}

/** Catálogo de actividades: SA ve todo; BA ve las globales y las de su sede. */
export async function getGymActivities(
  client: PrismaClient,
  tenantId: string,
  locationId: string | null,
  filter: { location?: string | "global" } = {}
) {
  const scope = locationId ? { OR: [{ location_id: null }, { location_id: locationId }] } : {};
  const byLocation =
    filter.location === "global"
      ? { location_id: null }
      : filter.location
        ? { location_id: filter.location }
        : {};
  return client.gymActivity.findMany({
    where: { tenant_id: tenantId, AND: [scope, byLocation] },
    include: {
      location: { select: { name: true } },
      _count: { select: { session_activities: true, attendance_activities: true } },
    },
    orderBy: [{ status: "asc" }, { sort_order: "asc" }, { name: "asc" }],
  });
}

export async function getGymActivityById(client: PrismaClient, tenantId: string, id: string) {
  return client.gymActivity.findFirst({ where: { id, tenant_id: tenantId } });
}
