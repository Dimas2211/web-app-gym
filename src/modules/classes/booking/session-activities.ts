// ─────────────────────────────────────────────────────────────────
// GYM-4 — registro de actividades impartidas en una sesión.
//
// Modelos de 2A, sin tablas nuevas:
//  - ScheduledClassActivity  → actividad COMÚN de la sesión (una vez por
//    sesión y actividad; p. ej. calentamiento de un GROUP).
//  - ClassAttendanceActivity → actividad INDIVIDUAL de un alumno, colgada de
//    su asistencia (attended / late) con reserva confirmada.
//
// Reglas:
//  - Una operación = una transacción READ COMMITTED de context.client.
//  - Locks en GYM_BOOKING_LOCK_ORDER, todos FOR SHARE (no escriben al padre):
//      común      [trainers] → scheduled_classes → gym_activities → INSERT
//      individual [trainers] → scheduled_classes → class_bookings → class_attendance → gym_activities → INSERT
//    [trainers] solo en canal TRAINER (auditoría H04): el Trainer asignado
//    no puede desactivarse ni cambiar de usuario en medio de la escritura.
//    Los triggers de 2A vuelven a tomar FOR SHARE sobre los mismos padres:
//    sin escalamiento. recordAttendance / cancelBooking / edición de sesión
//    toman FOR UPDATE de la sesión y se serializan con esta operación.
//  - Autorización bajo el lock de la sesión (checkSessionOperator): entrenador
//    activo asignado (TRAINER) o SA/BA de su alcance (STAFF). Recepción no.
//  - Ventana (checkTrainingRecordAccess, auditoría H03): nunca antes del
//    inicio real por ningún canal; luego R32 igual que la asistencia. La
//    excepción STAFF de OPEN heredado es solo del check-in, no se hereda.
//  - Actividad: del tenant, ACTIVA y global o de la sede de la sesión. El
//    nombre se copia como snapshot (activity_name) y no se reescribe después.
//  - Idempotencia por clave natural: unique (sesión|asistencia, actividad) +
//    INSERT … ON CONFLICT DO NOTHING. Repetir o enviar en paralelo deja una
//    sola fila; la respuesta indica created = false.
//  - Mínima mutación (decisión conservadora, §10 de la etapa 4): solo alta.
//    Sin edición ni borrado de actividades registradas (historial).
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { Prisma, type GymBookingChannel, type PrismaClient } from "@prisma/client";
import {
  GYM_BOOKING_MAX_CONCURRENCY_RETRIES,
  type GymBookingActor,
  type GymBookingErrorCode,
  type GymBookingScope,
} from "./booking-contracts";
import { checkSessionOperator, checkTrainingRecordAccess, normalizeReason, resolveSessionInstants } from "./booking-eligibility";
import { GymBookingRejection, loadGymBookingPolicy, lockAssignedTrainerShared, mapServiceError } from "./booking-service";

type Tx = Prisma.TransactionClient;

export interface AddSessionActivityCommand {
  scope: GymBookingScope;
  actor: GymBookingActor;
  channel: GymBookingChannel;
  sessionId: string;
  activityId: string;
  notes?: string | null;
  now?: Date;
}

export interface AddAttendanceActivityCommand {
  scope: GymBookingScope;
  actor: GymBookingActor;
  channel: GymBookingChannel;
  attendanceId: string;
  activityId: string;
  notes?: string | null;
  now?: Date;
}

export type SessionActivityResult =
  | { ok: true; value: { id: string; sessionId: string; created: boolean } }
  | { ok: false; code: GymBookingErrorCode; message?: string };

export interface SessionActivityService {
  addSessionActivity(cmd: AddSessionActivityCommand): Promise<SessionActivityResult>;
  addAttendanceActivity(cmd: AddAttendanceActivityCommand): Promise<SessionActivityResult>;
}

const RETRYABLE: ReadonlySet<GymBookingErrorCode> = new Set<GymBookingErrorCode>([
  "CONCURRENT_UPDATE_RETRY",
  "SESSION_CHANGED_RETRY",
]);

function reject(code: GymBookingErrorCode, message?: string): never {
  throw new GymBookingRejection(code, message);
}

const SESSION_SELECT = {
  id: true,
  branch_id: true,
  session_kind: true,
  status: true,
  class_date: true,
  start_time: true,
  end_time: true,
  starts_at: true,
  ends_at: true,
  trainer_id: true,
  trainer: { select: { user_id: true, status: true } },
} satisfies Prisma.ScheduledClassSelect;

type SessionRow = Prisma.ScheduledClassGetPayload<{ select: typeof SESSION_SELECT }>;

async function lockSessionShared(tx: Tx, sessionId: string, tenantId: string): Promise<SessionRow | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "scheduled_classes" WHERE "id" = ${sessionId} AND "tenant_id" = ${tenantId} FOR SHARE`;
  if (rows.length !== 1) return null;
  return tx.scheduledClass.findUniqueOrThrow({ where: { id: sessionId }, select: SESSION_SELECT });
}

/**
 * H04: canal TRAINER → bloquea el Trainer asignado ANTES de la sesión (orden
 * global). Devuelve el id bloqueado, o undefined en canal STAFF (sin lock).
 */
async function lockTrainerForChannel(tx: Tx, channel: GymBookingChannel, sessionId: string, tenantId: string) {
  if (channel !== "TRAINER") return undefined;
  return lockAssignedTrainerShared(tx, sessionId, tenantId);
}

/** Bajo el lock de la sesión: la asignación no cambió desde que se bloqueó el Trainer. */
function assertTrainerStillLocked(lockedTrainerId: string | null | undefined, session: SessionRow) {
  if (lockedTrainerId !== undefined && session.trainer_id !== lockedTrainerId) reject("SESSION_CHANGED_RETRY");
}

/** Autorización, estado y ventana R32 sobre la sesión ya bloqueada. */
async function assertSessionWritable(
  tx: Tx,
  cmd: { scope: GymBookingScope; actor: GymBookingActor; channel: GymBookingChannel },
  session: SessionRow,
  now: Date
) {
  if (
    !checkSessionOperator({
      channel: cmd.channel,
      actor: cmd.actor,
      scopeLocationId: cmd.scope.locationId,
      session,
    })
  ) {
    reject("FORBIDDEN");
  }
  if (session.status === "cancelled") reject("SESSION_NOT_BOOKABLE", "La clase está cancelada.");
  const policy = await loadGymBookingPolicy(tx, cmd.scope.tenantId);
  const { startsAt, endsAt } = resolveSessionInstants(session, policy.timezone);
  // H03: nunca antes del inicio real; sin la excepción STAFF de OPEN heredado.
  const access = checkTrainingRecordAccess({
    policy,
    now,
    startsAt,
    endsAt,
    sessionStatus: session.status,
    channel: cmd.channel,
    role: cmd.actor.role,
  });
  if (!access.ok) reject(access.code);
}

/** Actividad del tenant, activa y global o de la sede de la sesión (FOR SHARE: no cambia de sede ni se desactiva en medio). */
async function lockActivity(tx: Tx, tenantId: string, activityId: string, sessionBranchId: string) {
  const rows = await tx.$queryRaw<{ id: string; name: string; status: string; location_id: string | null }[]>`
    SELECT "id", "name", "status"::text AS "status", "location_id" FROM "gym_activities"
     WHERE "id" = ${activityId} AND "tenant_id" = ${tenantId} FOR SHARE`;
  const activity = rows[0];
  if (!activity || activity.status !== "active") reject("ACTIVITY_UNAVAILABLE");
  if (activity.location_id !== null && activity.location_id !== sessionBranchId) reject("ACTIVITY_UNAVAILABLE");
  return activity;
}

export function createSessionActivityService(db: PrismaClient): SessionActivityService {
  const txOptions = {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: 20_000,
    maxWait: 15_000,
  };

  async function run(body: (tx: Tx, now: Date) => Promise<SessionActivityResult>, now?: Date): Promise<SessionActivityResult> {
    let lastCode: GymBookingErrorCode = "CONCURRENT_UPDATE_RETRY";
    for (let attempt = 0; attempt <= GYM_BOOKING_MAX_CONCURRENCY_RETRIES; attempt++) {
      try {
        return await db.$transaction((tx) => body(tx, now ?? new Date()), txOptions);
      } catch (err) {
        const code = err instanceof GymBookingRejection ? err.code : mapServiceError(err);
        if (!code) throw err;
        if (RETRYABLE.has(code)) {
          lastCode = code;
          continue;
        }
        return { ok: false, code, message: err instanceof GymBookingRejection ? err.message : undefined };
      }
    }
    return { ok: false, code: lastCode };
  }

  async function addSessionActivity(cmd: AddSessionActivityCommand): Promise<SessionActivityResult> {
    return run(async (tx, now) => {
      const { tenantId } = cmd.scope;
      const lockedTrainerId = await lockTrainerForChannel(tx, cmd.channel, cmd.sessionId, tenantId);
      const session = await lockSessionShared(tx, cmd.sessionId, tenantId);
      if (!session) reject("NOT_FOUND", "Clase no encontrada.");
      assertTrainerStillLocked(lockedTrainerId, session);
      await assertSessionWritable(tx, cmd, session, now);
      const activity = await lockActivity(tx, tenantId, cmd.activityId, session.branch_id);

      const inserted = await tx.scheduledClassActivity.createMany({
        data: [
          {
            id: randomUUID(),
            tenant_id: tenantId,
            scheduled_class_id: session.id,
            activity_id: activity.id,
            activity_name: activity.name,
            notes: normalizeReason(cmd.notes),
            created_by: cmd.actor.userId,
            created_at: now,
          },
        ],
        skipDuplicates: true,
      });
      const row = await tx.scheduledClassActivity.findUniqueOrThrow({
        where: { scheduled_class_id_activity_id: { scheduled_class_id: session.id, activity_id: activity.id } },
        select: { id: true },
      });
      return { ok: true, value: { id: row.id, sessionId: session.id, created: inserted.count === 1 } };
    }, cmd.now);
  }

  async function addAttendanceActivity(cmd: AddAttendanceActivityCommand): Promise<SessionActivityResult> {
    return run(async (tx, now) => {
      const { tenantId } = cmd.scope;
      // Lectura sin lock para conocer la sesión; se revalida bajo lock.
      const before = await tx.classAttendance.findFirst({
        where: { id: cmd.attendanceId, tenant_id: tenantId },
        select: { scheduled_class_id: true },
      });
      if (!before) reject("NOT_FOUND", "Asistencia no encontrada.");

      const lockedTrainerId = await lockTrainerForChannel(tx, cmd.channel, before.scheduled_class_id, tenantId);
      const session = await lockSessionShared(tx, before.scheduled_class_id, tenantId);
      if (!session) reject("SESSION_CHANGED_RETRY");
      assertTrainerStillLocked(lockedTrainerId, session);
      await assertSessionWritable(tx, cmd, session, now);

      // class_bookings → class_attendance (FOR SHARE) en el orden global.
      const bookingRows = await tx.$queryRaw<{ id: string; booking_status: string; scheduled_class_id: string }[]>`
        SELECT b."id", b."booking_status"::text AS "booking_status", b."scheduled_class_id"
          FROM "class_bookings" b
          JOIN "class_attendance" a ON a."booking_id" = b."id"
         WHERE a."id" = ${cmd.attendanceId} AND b."tenant_id" = ${tenantId}
           FOR SHARE OF b`;
      const attendanceRows = await tx.$queryRaw<
        { id: string; scheduled_class_id: string; booking_id: string | null; attendance_status: string }[]
      >`
        SELECT "id", "scheduled_class_id", "booking_id", "attendance_status"::text AS "attendance_status"
          FROM "class_attendance" WHERE "id" = ${cmd.attendanceId} AND "tenant_id" = ${tenantId} FOR SHARE`;
      const attendance = attendanceRows[0];
      if (!attendance || attendance.scheduled_class_id !== session.id) reject("SESSION_CHANGED_RETRY");
      const booking = bookingRows[0];
      // Sin reserva válida no hay actividad individual (no se crea asistencia ficticia).
      if (!booking || booking.id !== attendance.booking_id || booking.scheduled_class_id !== session.id) {
        reject("ATTENDANCE_REQUIRED", "El alumno no tiene una reserva válida en esta clase.");
      }
      if (booking.booking_status !== "confirmed") reject("NOT_CONFIRMED");
      if (attendance.attendance_status !== "attended" && attendance.attendance_status !== "late") {
        reject("ATTENDANCE_REQUIRED", "El alumno no figura como presente en esta clase.");
      }

      const activity = await lockActivity(tx, tenantId, cmd.activityId, session.branch_id);
      const inserted = await tx.classAttendanceActivity.createMany({
        data: [
          {
            id: randomUUID(),
            tenant_id: tenantId,
            attendance_id: attendance.id,
            activity_id: activity.id,
            activity_name: activity.name,
            notes: normalizeReason(cmd.notes),
            created_by: cmd.actor.userId,
            created_at: now,
          },
        ],
        skipDuplicates: true,
      });
      const row = await tx.classAttendanceActivity.findUniqueOrThrow({
        where: { attendance_id_activity_id: { attendance_id: attendance.id, activity_id: activity.id } },
        select: { id: true },
      });
      return { ok: true, value: { id: row.id, sessionId: session.id, created: inserted.count === 1 } };
    }, cmd.now);
  }

  return { addSessionActivity, addAttendanceActivity };
}
