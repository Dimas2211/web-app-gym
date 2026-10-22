// ─────────────────────────────────────────────────────────────────
// GYM-5A — escritura del seguimiento por fecha (ClientPlanDayExecution).
//
// Dos comandos con fuentes independientes:
//  - recordClientReport: autorreporte del alumno (portal);
//  - recordTrainerExecution: registro del entrenador / administración,
//    con vínculo OPCIONAL y explícito a una asistencia GYM-4.
//
// La autorización (rol LIVE, alcance, módulo, sesión de soporte) la resuelve
// el caller ANTES (plan-access / portal). Aquí se garantiza la integridad:
//  - el día se resuelve por (id, plan, tenant, alumno): pertenencia exacta;
//  - la fila del DÍA se bloquea (FOR UPDATE) → escrituras concurrentes sobre
//    el mismo (día, fecha) se serializan; días distintos no se bloquean;
//  - unicidad (día, fecha) + reintento idéntico = sin cambio ni evento;
//  - cada cambio real incrementa `revision` y añade un evento append-only;
//  - NO toca ClassAttendance, reservas, cupos ni consumos de membresía.
// ─────────────────────────────────────────────────────────────────

import type { ClientPlanDayExecution, ExecutionStatus, Prisma, PrismaClient } from "@prisma/client";
import {
  CLIENT_COMMENT_MAX,
  CORRECTION_REASON_MAX,
  DATE_CHECK_MESSAGES,
  TRAINER_FEEDBACK_MAX,
  checkClientReportDate,
  checkTrainerRecordDate,
  dateKey,
  type DateCheck,
  type RecordableStatus,
} from "./training-tracking-rules";

export type ExecutionErrorCode =
  | "DAY_NOT_FOUND"
  | "PLAN_NOT_ACTIVE"
  | "DATE_INVALID"
  | "DATE_FUTURE"
  | "DATE_TOO_OLD"
  | "DATE_OUTSIDE_PLAN"
  | "DATE_WRONG_WEEKDAY"
  | "TRAINER_ALREADY_REVIEWED"
  | "REASON_REQUIRED"
  | "STALE_REVISION"
  | "ATTENDANCE_INVALID"
  | "ATTENDANCE_ALREADY_LINKED"
  | "TEXT_TOO_LONG";

export type ExecutionResult =
  | { ok: true; execution: ClientPlanDayExecution; created: boolean; changed: boolean }
  | { ok: false; code: ExecutionErrorCode; message: string };

const fail = (code: ExecutionErrorCode, message: string): ExecutionResult => ({ ok: false, code, message });

export const EXECUTION_MESSAGES: Record<Exclude<ExecutionErrorCode, "DATE_INVALID" | "DATE_FUTURE" | "DATE_TOO_OLD" | "DATE_OUTSIDE_PLAN" | "DATE_WRONG_WEEKDAY">, string> = {
  DAY_NOT_FOUND: "Día de plan no encontrado.",
  PLAN_NOT_ACTIVE: "El plan no está activo.",
  TRAINER_ALREADY_REVIEWED: "Tu entrenador ya registró esta sesión; no puedes modificar tu reporte. Escríbele si necesitas una corrección.",
  REASON_REQUIRED: "Indica el motivo para cambiar un estado ya registrado.",
  STALE_REVISION: "El registro cambió mientras lo editabas. Recarga la página e inténtalo de nuevo.",
  ATTENDANCE_INVALID: "La asistencia seleccionada no corresponde a este alumno, a esa fecha o no está confirmada como asistida.",
  ATTENDANCE_ALREADY_LINKED: "Esa asistencia ya está vinculada a otra ejecución.",
  TEXT_TOO_LONG: "El texto excede el largo permitido.",
};

function dateFailure(check: Exclude<DateCheck, { ok: true }>): ExecutionResult {
  const code = `DATE_${check.code}` as ExecutionErrorCode;
  return fail(code, DATE_CHECK_MESSAGES[check.code]);
}

function normText(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

async function lockDayRow(tx: Prisma.TransactionClient, dayId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM client_weekly_plan_days WHERE id = ${dayId} FOR UPDATE`;
}

const toDbDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// ── Autorreporte del alumno ──────────────────────────────────────

export interface ClientReportCommand {
  tenantId: string;
  /** Alumno resuelto desde la SESIÓN (nunca del navegador). */
  clientId: string;
  planDayId: string;
  localDate: string;
  status: RecordableStatus;
  comment: string | null;
  actorUserId: string;
  timezone: string;
  today: string;
  now?: Date;
}

export async function recordClientReport(db: PrismaClient, cmd: ClientReportCommand): Promise<ExecutionResult> {
  const comment = normText(cmd.comment);
  if (comment && comment.length > CLIENT_COMMENT_MAX) return fail("TEXT_TOO_LONG", EXECUTION_MESSAGES.TEXT_TOO_LONG);
  const now = cmd.now ?? new Date();

  return db.$transaction(async (tx) => {
    const day = await tx.clientWeeklyPlanDay.findFirst({
      where: { id: cmd.planDayId, plan: { tenant_id: cmd.tenantId, client_id: cmd.clientId } },
      include: { plan: true },
    });
    if (!day) return fail("DAY_NOT_FOUND", EXECUTION_MESSAGES.DAY_NOT_FOUND);
    if (day.plan.status !== "active") return fail("PLAN_NOT_ACTIVE", EXECUTION_MESSAGES.PLAN_NOT_ACTIVE);

    const check = checkClientReportDate({
      date: cmd.localDate,
      today: cmd.today,
      planStart: dateKey(day.plan.start_date),
      planEnd: dateKey(day.plan.end_date),
      weekday: day.weekday,
    });
    if (!check.ok) return dateFailure(check);

    await lockDayRow(tx, day.id);
    const existing = await tx.clientPlanDayExecution.findUnique({
      where: { plan_day_id_local_date: { plan_day_id: day.id, local_date: toDbDate(cmd.localDate) } },
    });

    if (existing?.trainer_status) return fail("TRAINER_ALREADY_REVIEWED", EXECUTION_MESSAGES.TRAINER_ALREADY_REVIEWED);
    if (existing && existing.client_status === cmd.status && normText(existing.client_comment) === comment) {
      return { ok: true, execution: existing, created: false, changed: false } as const;
    }

    const data = {
      client_status: cmd.status as ExecutionStatus,
      client_comment: comment,
      client_reported_at: now,
      client_reported_by: cmd.actorUserId,
    };
    const execution = existing
      ? await tx.clientPlanDayExecution.update({ where: { id: existing.id }, data: { ...data, revision: { increment: 1 } } })
      : await tx.clientPlanDayExecution.create({
          data: {
            tenant_id: cmd.tenantId,
            client_id: cmd.clientId,
            plan_id: day.plan.id,
            plan_day_id: day.id,
            local_date: toDbDate(cmd.localDate),
            timezone: cmd.timezone,
            ...data,
          },
        });
    await tx.clientPlanDayExecutionEvent.create({
      data: {
        tenant_id: cmd.tenantId,
        execution_id: execution.id,
        kind: "CLIENT_REPORT",
        actor_user_id: cmd.actorUserId,
        actor_role: "client",
        previous_status: existing?.client_status ?? null,
        new_status: cmd.status,
      },
    });
    return { ok: true, execution, created: !existing, changed: true } as const;
  });
}

// ── Registro del entrenador / administración ─────────────────────

export interface TrainerExecutionCommand {
  tenantId: string;
  planId: string;
  planDayId: string;
  localDate: string;
  status: RecordableStatus;
  feedback: string | null;
  /** Obligatorio si cambia un estado ya registrado por el entrenador. */
  reason: string | null;
  /** undefined = no cambiar; null = quitar el vínculo; string = vincular. */
  attendanceId?: string | null;
  /** Concurrencia optimista: revisión que el usuario estaba viendo (si la conoce). */
  expectedRevision?: number | null;
  actor: { userId: string; role: string };
  timezone: string;
  today: string;
  now?: Date;
}

const TRAINER_RECORDABLE_PLAN_STATUSES = ["active", "inactive", "suspended"] as const;

export async function recordTrainerExecution(db: PrismaClient, cmd: TrainerExecutionCommand): Promise<ExecutionResult> {
  const feedback = normText(cmd.feedback);
  const reason = normText(cmd.reason);
  if ((feedback && feedback.length > TRAINER_FEEDBACK_MAX) || (reason && reason.length > CORRECTION_REASON_MAX)) {
    return fail("TEXT_TOO_LONG", EXECUTION_MESSAGES.TEXT_TOO_LONG);
  }
  const now = cmd.now ?? new Date();

  return db.$transaction(async (tx) => {
    const day = await tx.clientWeeklyPlanDay.findFirst({
      where: { id: cmd.planDayId, client_weekly_plan_id: cmd.planId, plan: { tenant_id: cmd.tenantId } },
      include: { plan: true },
    });
    if (!day) return fail("DAY_NOT_FOUND", EXECUTION_MESSAGES.DAY_NOT_FOUND);
    if (!(TRAINER_RECORDABLE_PLAN_STATUSES as readonly string[]).includes(day.plan.status)) {
      return fail("PLAN_NOT_ACTIVE", EXECUTION_MESSAGES.PLAN_NOT_ACTIVE);
    }

    const check = checkTrainerRecordDate({
      date: cmd.localDate,
      today: cmd.today,
      planStart: dateKey(day.plan.start_date),
      planEnd: dateKey(day.plan.end_date),
      weekday: day.weekday,
    });
    if (!check.ok) return dateFailure(check);

    await lockDayRow(tx, day.id);
    const existing = await tx.clientPlanDayExecution.findUnique({
      where: { plan_day_id_local_date: { plan_day_id: day.id, local_date: toDbDate(cmd.localDate) } },
    });

    if (cmd.expectedRevision != null && (existing?.revision ?? 0) !== cmd.expectedRevision) {
      return fail("STALE_REVISION", EXECUTION_MESSAGES.STALE_REVISION);
    }
    if (existing?.trainer_status && existing.trainer_status !== cmd.status && !reason) {
      return fail("REASON_REQUIRED", EXECUTION_MESSAGES.REASON_REQUIRED);
    }

    // Vínculo explícito con una asistencia GYM-4 del MISMO alumno y tenant,
    // confirmada (attended/late) y de la MISMA fecha local. Nunca por coincidencia.
    let nextAttendance: string | null = existing?.attendance_id ?? null;
    if (cmd.attendanceId !== undefined) {
      nextAttendance = cmd.attendanceId;
      if (cmd.attendanceId) {
        const att = await tx.classAttendance.findFirst({
          where: {
            id: cmd.attendanceId,
            tenant_id: cmd.tenantId,
            client_id: day.plan.client_id,
            attendance_status: { in: ["attended", "late"] },
            scheduled_class: { class_date: toDbDate(cmd.localDate) },
          },
          select: { id: true },
        });
        if (!att) return fail("ATTENDANCE_INVALID", EXECUTION_MESSAGES.ATTENDANCE_INVALID);
        const taken = await tx.clientPlanDayExecution.findFirst({
          where: { attendance_id: cmd.attendanceId, ...(existing ? { id: { not: existing.id } } : {}) },
          select: { id: true },
        });
        if (taken) return fail("ATTENDANCE_ALREADY_LINKED", EXECUTION_MESSAGES.ATTENDANCE_ALREADY_LINKED);
      }
    }

    const sameAttendance = (existing?.attendance_id ?? null) === nextAttendance;
    if (
      existing &&
      existing.trainer_status === cmd.status &&
      normText(existing.trainer_feedback) === feedback &&
      sameAttendance
    ) {
      return { ok: true, execution: existing, created: false, changed: false } as const;
    }

    const attendanceChanged = !sameAttendance;
    const data = {
      trainer_status: cmd.status as ExecutionStatus,
      trainer_feedback: feedback,
      trainer_recorded_at: now,
      trainer_recorded_by: cmd.actor.userId,
      trainer_recorded_role: cmd.actor.role,
      attendance_id: nextAttendance,
      attendance_linked_by: nextAttendance ? (attendanceChanged ? cmd.actor.userId : existing?.attendance_linked_by ?? cmd.actor.userId) : null,
      attendance_linked_at: nextAttendance ? (attendanceChanged ? now : existing?.attendance_linked_at ?? now) : null,
    };
    const execution = existing
      ? await tx.clientPlanDayExecution.update({ where: { id: existing.id }, data: { ...data, revision: { increment: 1 } } })
      : await tx.clientPlanDayExecution.create({
          data: {
            tenant_id: cmd.tenantId,
            client_id: day.plan.client_id,
            plan_id: day.plan.id,
            plan_day_id: day.id,
            local_date: toDbDate(cmd.localDate),
            timezone: cmd.timezone,
            ...data,
          },
        });
    await tx.clientPlanDayExecutionEvent.create({
      data: {
        tenant_id: cmd.tenantId,
        execution_id: execution.id,
        kind: "TRAINER_RECORD",
        actor_user_id: cmd.actor.userId,
        actor_role: cmd.actor.role,
        previous_status: existing?.trainer_status ?? null,
        new_status: cmd.status,
        reason,
        attendance_id: nextAttendance,
      },
    });
    return { ok: true, execution, created: !existing, changed: true } as const;
  });
}
