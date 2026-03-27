import { prisma } from "@/lib/db/prisma";
import type { Gender } from "@prisma/client";

// ============================================================
// PERFIL DEL CLIENTE
// ============================================================

/** Retorna el registro Client vinculado a un usuario, o null si no tiene perfil. */
export async function getClientByUserId(userId: string) {
  return prisma.client.findUnique({
    where: { user_id: userId },
    include: {
      branch: { select: { id: true, name: true } },
      sport: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
      assigned_trainer: {
        select: { id: true, first_name: true, last_name: true },
      },
    },
  });
}

// ============================================================
// MEMBRESÍAS
// ============================================================

/** Retorna la membresía activa y vigente del cliente (la más reciente si hay varias). */
export async function getMyActiveMembership(clientId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.clientMembership.findFirst({
    where: {
      client_id: clientId,
      status: "active",
      payment_status: { in: ["paid", "partial"] },
      start_date: { lte: today },
      end_date: { gte: today },
    },
    include: {
      membership_plan: {
        select: { name: true, access_type: true, description: true },
      },
    },
    orderBy: { end_date: "desc" },
  });
}

/** Historial completo de membresías del cliente. */
export async function getMyMemberships(clientId: string) {
  return prisma.clientMembership.findMany({
    where: { client_id: clientId },
    include: {
      membership_plan: {
        select: { name: true, access_type: true },
      },
    },
    orderBy: { start_date: "desc" },
  });
}

// ============================================================
// CLASES
// ============================================================

/** Clases próximas programadas en la sucursal del cliente (hoy en adelante). */
export async function getAvailableClasses(branchId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.scheduledClass.findMany({
    where: {
      branch_id: branchId,
      status: "scheduled",
      class_date: { gte: today },
    },
    include: {
      class_type: { select: { name: true } },
      trainer: { select: { first_name: true, last_name: true } },
      bookings: {
        where: { booking_status: "confirmed" },
        select: { id: true },
      },
    },
    orderBy: [{ class_date: "asc" }, { start_time: "asc" }],
    take: 30,
  });
}

/** Reserva activa del cliente para una clase específica. */
export async function getMyBookingForClass(clientId: string, classId: string) {
  return prisma.classBooking.findUnique({
    where: {
      scheduled_class_id_client_id: {
        scheduled_class_id: classId,
        client_id: clientId,
      },
    },
  });
}

/** Todas las reservas del cliente con detalle de clase. */
export async function getMyBookings(clientId: string) {
  return prisma.classBooking.findMany({
    where: { client_id: clientId },
    include: {
      scheduled_class: {
        include: {
          class_type: { select: { name: true } },
          trainer: { select: { first_name: true, last_name: true } },
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { scheduled_class: { class_date: "desc" } },
  });
}

// ============================================================
// PLAN SEMANAL
// ============================================================

/** Plan semanal activo y vigente del cliente. */
export async function getMyActivePlan(clientId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.clientWeeklyPlan.findFirst({
    where: {
      client_id: clientId,
      status: "active",
      start_date: { lte: today },
      end_date: { gte: today },
    },
    include: {
      template: { select: { name: true, description: true } },
      trainer: { select: { first_name: true, last_name: true } },
      days: { orderBy: { weekday: "asc" } },
    },
    orderBy: { start_date: "desc" },
  });
}

/** Historial de planes semanales del cliente. */
export async function getMyPlans(clientId: string) {
  return prisma.clientWeeklyPlan.findMany({
    where: { client_id: clientId },
    include: {
      template: { select: { name: true } },
      trainer: { select: { first_name: true, last_name: true } },
      days: { orderBy: { weekday: "asc" } },
    },
    orderBy: { start_date: "desc" },
  });
}

// ============================================================
// HISTORIAL DE ASISTENCIA
// ============================================================

// ============================================================
// MEMBRESÍA — VALIDACIÓN
// ============================================================

/** Devuelve true si el cliente tiene membresía activa y vigente hoy. */
export async function hasActiveMembership(clientId: string): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const found = await prisma.clientMembership.findFirst({
    where: {
      client_id: clientId,
      status: "active",
      payment_status: { in: ["paid", "partial"] },
      start_date: { lte: today },
      end_date: { gte: today },
    },
    select: { id: true },
  });
  return found !== null;
}

// ============================================================
// PROGRAMACIÓN GENERAL
// ============================================================

/**
 * Retorna plantillas activas que coinciden con el perfil del cliente.
 *
 * Lógica AND: cada criterio no nulo de la plantilla debe coincidir con el
 * atributo correspondiente del cliente.
 * - Si el cliente tiene sport_id → solo ve plantillas con target_sport_id null
 *   o igual a su sport_id.
 * - Si el cliente NO tiene sport_id → solo ve plantillas sin target_sport_id.
 * Igual para goal_id y gender.
 *
 * Plantillas con todos los criterios en null se muestran a cualquier cliente
 * del mismo gimnasio/sucursal (programación verdaderamente general).
 */
export async function getMyGeneralTemplates(client: {
  gym_id: string;
  branch_id: string;
  sport_id: string | null;
  goal_id: string | null;
  gender: Gender | null;
}) {
  return prisma.weeklyPlanTemplate.findMany({
    where: {
      gym_id: client.gym_id,
      status: "active",
      AND: [
        // scope de sucursal: global (null) o la sucursal del cliente
        { OR: [{ branch_id: null }, { branch_id: client.branch_id }] },
        // deporte: si el cliente tiene uno, acepta null o coincidencia exacta
        client.sport_id
          ? { OR: [{ target_sport_id: null }, { target_sport_id: client.sport_id }] }
          : { target_sport_id: null },
        // meta: ídem
        client.goal_id
          ? { OR: [{ target_goal_id: null }, { target_goal_id: client.goal_id }] }
          : { target_goal_id: null },
        // género: ídem
        client.gender
          ? { OR: [{ target_gender: null }, { target_gender: client.gender }] }
          : { target_gender: null },
      ],
    },
    include: {
      days: { orderBy: { weekday: "asc" } },
      target_sport: { select: { name: true } },
      target_goal: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Historial de asistencia registrada del cliente (últimas 60 entradas). */
export async function getMyAttendance(clientId: string) {
  return prisma.classAttendance.findMany({
    where: { client_id: clientId },
    include: {
      scheduled_class: {
        include: {
          class_type: { select: { name: true } },
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { scheduled_class: { class_date: "desc" } },
    take: 60,
  });
}
