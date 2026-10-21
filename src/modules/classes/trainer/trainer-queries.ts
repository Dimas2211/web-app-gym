// ─────────────────────────────────────────────────────────────────
// GYM-4 — lecturas de la agenda y del detalle de sesión del entrenador.
//
//  - Siempre tenant_id explícito + base runtime efectiva (client).
//  - La agenda filtra por ScheduledClass.trainer_id del Trainer vinculado
//    (las tres modalidades; no se filtra por modalidad).
//  - "Hoy" es la fecha local del gimnasio (GymSettings.timezone).
//  - Datos del alumno: solo nombre. Sin email, teléfono ni datos fiscales.
//  - training_notes (R36) solo se selecciona si el llamador lo autoriza.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { localDate } from "../booking/booking-eligibility";
import { loadGymBookingPolicy } from "../booking/booking-service";

const AGENDA_SELECT = {
  id: true,
  title: true,
  class_date: true,
  start_time: true,
  end_time: true,
  status: true,
  session_kind: true,
  capacity: true,
  booked_count: true,
  room_name: true,
  branch: { select: { name: true } },
  class_type: { select: { name: true } },
  _count: { select: { attendance: true } },
} as const;

export const TRAINER_AGENDA_LIMITS = { upcoming: 60, past: 30 } as const;

/** Sesiones de hoy, próximas y anteriores del entrenador (fecha local del gimnasio). */
export async function getTrainerAgenda(
  client: PrismaClient | undefined,
  tenantId: string,
  trainerId: string,
  now: Date = new Date()
) {
  const db = client ?? prisma;
  const policy = await loadGymBookingPolicy(db, tenantId);
  const today = localDate(now, policy.timezone);
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const where = { tenant_id: tenantId, trainer_id: trainerId };
  const [todaySessions, upcoming, past] = await Promise.all([
    db.scheduledClass.findMany({
      where: { ...where, class_date: todayDate },
      select: AGENDA_SELECT,
      orderBy: [{ start_time: "asc" }],
    }),
    db.scheduledClass.findMany({
      where: { ...where, class_date: { gt: todayDate } },
      select: AGENDA_SELECT,
      orderBy: [{ class_date: "asc" }, { start_time: "asc" }],
      take: TRAINER_AGENDA_LIMITS.upcoming,
    }),
    db.scheduledClass.findMany({
      where: { ...where, class_date: { lt: todayDate } },
      select: AGENDA_SELECT,
      orderBy: [{ class_date: "desc" }, { start_time: "desc" }],
      take: TRAINER_AGENDA_LIMITS.past,
    }),
  ]);
  return { today, timezone: policy.timezone, todaySessions, upcoming, past };
}

export type TrainerAgenda = Awaited<ReturnType<typeof getTrainerAgenda>>;
export type TrainerAgendaSession = TrainerAgenda["todaySessions"][number];

/**
 * Detalle operativo de una sesión del tenant: alumnos con reserva confirmada,
 * asistencia, actividades comunes e individuales y, si `includePrivateNotes`,
 * training_notes. El llamador valida el acceso ANTES de pedir notas privadas
 * (H01): el entrenador pasa `assignedTrainerId` y la consulta solo resuelve
 * su sesión asignada; SA/BA llegan aquí tras canManageClass con identidad
 * LIVE. El servidor revalida todo al escribir.
 */
export async function getSessionTrainingDetail(
  client: PrismaClient | undefined,
  tenantId: string,
  sessionId: string,
  opts: { includePrivateNotes: boolean; assignedTrainerId?: string }
) {
  const db = client ?? prisma;
  const session = await db.scheduledClass.findFirst({
    where: {
      id: sessionId,
      tenant_id: tenantId,
      ...(opts.assignedTrainerId !== undefined ? { trainer_id: opts.assignedTrainerId } : {}),
    },
    select: {
      id: true,
      title: true,
      class_date: true,
      start_time: true,
      end_time: true,
      starts_at: true,
      ends_at: true,
      status: true,
      session_kind: true,
      capacity: true,
      booked_count: true,
      room_name: true,
      branch_id: true,
      branch: { select: { name: true } },
      class_type: { select: { name: true } },
      trainer: { select: { id: true, first_name: true, last_name: true, user_id: true, status: true } },
      bookings: {
        where: { booking_status: "confirmed" },
        select: { id: true, client_id: true, client: { select: { first_name: true, last_name: true } } },
        // Lista para pasar asistencia: alfabética y estable.
        orderBy: [{ client: { first_name: "asc" } }, { client: { last_name: "asc" } }, { id: "asc" }],
      },
      attendance: {
        select: {
          id: true,
          client_id: true,
          booking_id: true,
          attendance_status: true,
          training_notes: opts.includePrivateNotes,
          activities: {
            select: { id: true, activity_name: true, notes: true, created_at: true },
            orderBy: { created_at: "asc" },
          },
        },
      },
      activities: {
        select: { id: true, activity_name: true, notes: true, created_at: true },
        orderBy: { created_at: "asc" },
      },
    },
  });
  if (!session) return null;

  const [policy, catalog] = await Promise.all([
    loadGymBookingPolicy(db, tenantId),
    db.gymActivity.findMany({
      where: { tenant_id: tenantId, status: "active", OR: [{ location_id: null }, { location_id: session.branch_id }] },
      select: { id: true, name: true },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    }),
  ]);
  return { session, policy, catalog };
}

export type SessionTrainingDetail = NonNullable<Awaited<ReturnType<typeof getSessionTrainingDetail>>>;
