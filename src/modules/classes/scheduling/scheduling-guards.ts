// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — validaciones con datos para programar sesiones.
//
// Todas se ejecutan dentro de la transacción READ COMMITTED de la acción,
// DESPUÉS de lockTrainerForScheduling (H03 de 2B): dos altas, ediciones,
// generaciones de serie o ausencias del mismo entrenador se serializan y
// la segunda ve lo que confirmó la primera.
// ─────────────────────────────────────────────────────────────────

import type { Prisma, PrismaClient } from "@prisma/client";
import { dbDate, timeOffCoversSlot } from "./scheduling-rules";

export type SchedulingDb = PrismaClient | Prisma.TransactionClient;

/** trainers FOR UPDATE: primer lock de GYM_BOOKING_LOCK_ORDER tras el advisory. */
export async function lockTrainerForScheduling(tx: Prisma.TransactionClient, trainerId: string, tenantId: string) {
  await tx.$queryRaw`SELECT "id" FROM "trainers" WHERE "id" = ${trainerId} AND "tenant_id" = ${tenantId} FOR UPDATE`;
}

/** Otra sesión no cancelada del entrenador que se cruza con [start, end) ese día (R14). */
export async function validateTrainerOverlap(
  db: SchedulingDb,
  trainerId: string,
  classDate: string,
  startTime: string,
  endTime: string,
  excludeId?: string
) {
  return db.scheduledClass.findFirst({
    where: {
      trainer_id: trainerId,
      class_date: dbDate(classDate),
      status: { not: "cancelled" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      // existing.start_time < new.end_time AND existing.end_time > new.start_time
      start_time: { lt: endTime },
      end_time: { gt: startTime },
    },
    select: { id: true, title: true, start_time: true, end_time: true },
  });
}

/** Ausencia activa del entrenador que cubre el horario (TrainerTimeOff, 2A). */
export async function findTimeOffConflict(
  db: SchedulingDb,
  tenantId: string,
  trainerId: string,
  classDate: string,
  startTime: string,
  endTime: string
) {
  const day = dbDate(classDate);
  const candidates = await db.trainerTimeOff.findMany({
    where: {
      tenant_id: tenantId,
      trainer_id: trainerId,
      status: "active",
      starts_on: { lte: day },
      ends_on: { gte: day },
    },
    select: { id: true, starts_on: true, ends_on: true, start_time: true, end_time: true, reason: true },
    orderBy: { starts_on: "asc" },
  });
  return candidates.find((t) => timeOffCoversSlot(t, classDate, startTime, endTime)) ?? null;
}

export function timeOffConflictMessage(t: { start_time: string | null; end_time: string | null }): string {
  return t.start_time && t.end_time
    ? `El entrenador tiene una ausencia registrada de ${t.start_time} a ${t.end_time} en esa fecha.`
    : "El entrenador tiene una ausencia registrada (día completo) en esa fecha.";
}
