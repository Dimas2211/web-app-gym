// ─────────────────────────────────────────────────────────────────
// GYM-5A — modelo de lectura del seguimiento individual.
//
// Separa PLAN (programado) / EJECUCIÓN (registrada por fecha) / ASISTENCIA
// (GYM-4, solo referencia verificable). Privacidad:
//  - NUNCA se selecciona ClassAttendance.training_notes ni las notas de
//    actividades individuales; solo nombres de actividades;
//  - para el alumno (audience CLIENT) no se exponen ids de usuarios, motivos
//    de corrección ni la bitácora;
//  - la retroalimentación del entrenador por fecha (trainer_feedback) es
//    visible para el alumno, como la del plan.
// Todas las lecturas filtran por tenant_id del contexto.
// ─────────────────────────────────────────────────────────────────

import type { ExecutionStatus, PrismaClient } from "@prisma/client";
import {
  countDistinctActivities,
  dateKey,
  effectiveStatus,
  occurrenceDates,
  summarizeCompliance,
  type ComplianceSummary,
  type StatusSource,
} from "./training-tracking-rules";

export type TrackingAudience = "STAFF" | "CLIENT";

export interface TrackedAttendance {
  attendanceId: string;
  /** Sigue siendo attended/late en GYM-4 (puede corregirse después del vínculo). */
  stillValid: boolean;
  classDate: string;
  classTitle: string;
}

export interface TrackedExecution {
  executionId: string;
  revision: number;
  clientStatus: ExecutionStatus | null;
  clientComment: string | null;
  clientReportedAt: Date | null;
  trainerStatus: ExecutionStatus | null;
  trainerFeedback: string | null;
  trainerRecordedAt: Date | null;
  /** Rol de quien registró (solo STAFF). */
  trainerRecordedRole: string | null;
  effective: { status: ExecutionStatus; source: StatusSource } | null;
  attendance: TrackedAttendance | null;
}

export interface TrackedOccurrence {
  dayId: string;
  weekday: number;
  sessionName: string | null;
  focusArea: string | null;
  date: string;
  execution: TrackedExecution | null;
}

export interface TrackedSession {
  attendanceId: string;
  classId: string;
  date: string;
  title: string;
  kind: string;
  /** Actividades comunes impartidas (ScheduledClassActivity). */
  commonActivities: string[];
  /** Actividades individuales registradas al alumno (ClassAttendanceActivity). */
  individualActivities: string[];
  linkedExecutionId: string | null;
}

export interface PlanTracking {
  planId: string;
  period: { start: string; end: string };
  today: string;
  summary: ComplianceSummary;
  /** Ocurrencias vencidas (≤ hoy), más recientes primero. */
  occurrences: TrackedOccurrence[];
  /** Solo STAFF y con gym.classes habilitado. */
  sessions: TrackedSession[] | null;
  distinctActivities: number | null;
}

export const OCCURRENCES_LIMIT = 120;

export async function loadPlanTracking(
  db: PrismaClient,
  input: {
    tenantId: string;
    planId: string;
    today: string;
    audience: TrackingAudience;
    /** Incluye sesiones GYM-4 y actividades (el caller verifica gym.classes). */
    includeSessions: boolean;
  }
): Promise<PlanTracking | null> {
  const plan = await db.clientWeeklyPlan.findFirst({
    where: { id: input.planId, tenant_id: input.tenantId },
    include: { days: { orderBy: { weekday: "asc" } } },
  });
  if (!plan) return null;

  const start = dateKey(plan.start_date);
  const end = dateKey(plan.end_date);
  const dueEnd = end < input.today ? end : input.today;

  const rows = await db.clientPlanDayExecution.findMany({
    where: { tenant_id: input.tenantId, plan_id: plan.id },
    include: {
      attendance: {
        select: {
          id: true,
          attendance_status: true,
          scheduled_class: { select: { title: true, class_date: true } },
        },
      },
    },
  });
  const byKey = new Map(rows.map((r) => [`${r.plan_day_id}|${dateKey(r.local_date)}`, r]));
  const staff = input.audience === "STAFF";

  const occurrences: TrackedOccurrence[] = [];
  for (const day of plan.days) {
    for (const date of occurrenceDates(start, dueEnd, day.weekday)) {
      const r = byKey.get(`${day.id}|${date}`);
      occurrences.push({
        dayId: day.id,
        weekday: day.weekday,
        sessionName: day.session_name,
        focusArea: day.focus_area,
        date,
        execution: r
          ? {
              executionId: r.id,
              revision: r.revision,
              clientStatus: r.client_status,
              clientComment: r.client_comment,
              clientReportedAt: r.client_reported_at,
              trainerStatus: r.trainer_status,
              trainerFeedback: r.trainer_feedback,
              trainerRecordedAt: r.trainer_recorded_at,
              trainerRecordedRole: staff ? r.trainer_recorded_role : null,
              effective: effectiveStatus(r),
              attendance: r.attendance
                ? {
                    attendanceId: r.attendance.id,
                    stillValid: r.attendance.attendance_status === "attended" || r.attendance.attendance_status === "late",
                    classDate: dateKey(r.attendance.scheduled_class.class_date),
                    classTitle: r.attendance.scheduled_class.title,
                  }
                : null,
            }
          : null,
      });
    }
  }
  occurrences.sort((a, b) => (a.date === b.date ? a.weekday - b.weekday : b.date.localeCompare(a.date)));

  const summary = summarizeCompliance(
    plan.days.map((d) => ({ id: d.id, weekday: d.weekday })),
    { start, end },
    input.today,
    rows.map((r) => ({
      plan_day_id: r.plan_day_id,
      local_date: dateKey(r.local_date),
      client_status: r.client_status,
      trainer_status: r.trainer_status,
    }))
  );

  let sessions: TrackedSession[] | null = null;
  let distinctActivities: number | null = null;
  if (staff && input.includeSessions) {
    const attended = await db.classAttendance.findMany({
      where: {
        tenant_id: input.tenantId,
        client_id: plan.client_id,
        attendance_status: { in: ["attended", "late"] },
        scheduled_class: {
          class_date: { gte: new Date(`${start}T00:00:00.000Z`), lte: new Date(`${dueEnd}T00:00:00.000Z`) },
        },
      },
      select: {
        id: true,
        scheduled_class: {
          select: {
            id: true,
            title: true,
            class_date: true,
            session_kind: true,
            activities: { select: { activity_id: true, activity_name: true } },
          },
        },
        activities: { select: { activity_id: true, activity_name: true } },
        plan_executions: { select: { id: true } },
      },
      orderBy: { scheduled_class: { class_date: "desc" } },
      take: 200,
    });
    sessions = attended.map((a) => ({
      attendanceId: a.id,
      classId: a.scheduled_class.id,
      date: dateKey(a.scheduled_class.class_date),
      title: a.scheduled_class.title,
      kind: a.scheduled_class.session_kind,
      commonActivities: a.scheduled_class.activities.map((x) => x.activity_name),
      individualActivities: a.activities.map((x) => x.activity_name),
      linkedExecutionId: a.plan_executions[0]?.id ?? null,
    }));
    distinctActivities = countDistinctActivities(
      attended.map((a) => ({
        sessionId: a.scheduled_class.id,
        common: a.scheduled_class.activities.map((x) => x.activity_id),
        individual: a.activities.map((x) => x.activity_id),
      }))
    );
  }

  return {
    planId: plan.id,
    period: { start, end },
    today: input.today,
    summary,
    occurrences: occurrences.slice(0, OCCURRENCES_LIMIT),
    sessions,
    distinctActivities,
  };
}

/** Asistencias confirmadas del alumno en una fecha local, aún sin vincular (candidatas para el entrenador). */
export async function listLinkableAttendances(
  db: PrismaClient,
  input: { tenantId: string; clientId: string; localDate: string }
) {
  const date = new Date(`${input.localDate}T00:00:00.000Z`);
  const rows = await db.classAttendance.findMany({
    where: {
      tenant_id: input.tenantId,
      client_id: input.clientId,
      attendance_status: { in: ["attended", "late"] },
      scheduled_class: { class_date: date },
      plan_executions: { none: {} },
    },
    select: { id: true, scheduled_class: { select: { title: true, start_time: true } } },
  });
  return rows.map((r) => ({ attendanceId: r.id, title: r.scheduled_class.title, startTime: r.scheduled_class.start_time }));
}
