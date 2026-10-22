// ─────────────────────────────────────────────────────────────────
// GYM-5A — reglas PURAS del seguimiento individual por fecha.
//
// Contrato temporal: una ejecución pertenece a una fecha calendario LOCAL del
// gimnasio ("YYYY-MM-DD", GymSettings.timezone IANA, DST incluido vía Intl).
// Las fechas se manejan como cadenas calendario; la aritmética usa UTC solo
// como contenedor de días (sin horas), por lo que un cambio de horario no
// desplaza ni duplica días. weekday: 0 = domingo … 6 = sábado (Date.getDay()).
//
// Política de estados (explícita y auditable):
//  - Hay DOS fuentes independientes por (día del plan, fecha): el autorreporte
//    del alumno y el registro del entrenador/administración. Ninguna
//    sobrescribe a la otra.
//  - Estado efectivo: el del entrenador si existe; si no, el autorreporte
//    (marcado como NO verificado). Ninguno es asistencia GYM-4.
//  - El alumno puede corregir su autorreporte mientras el entrenador no haya
//    registrado la fecha, dentro de la ventana CLIENT_REPORT_WINDOW_DAYS y
//    nunca en el futuro.
//  - El entrenador/administración registra cualquier fecha ya transcurrida
//    del período del plan; cambiar un estado ya registrado exige motivo.
// ─────────────────────────────────────────────────────────────────

import type { ExecutionStatus } from "@prisma/client";
import { isValidIanaTimeZone } from "@/modules/classes/booking/booking-policy";
import { localDate } from "@/modules/classes/booking/booking-eligibility";

export const CLIENT_REPORT_WINDOW_DAYS = 14;
export const CLIENT_COMMENT_MAX = 1000;
export const TRAINER_FEEDBACK_MAX = 1000;
export const CORRECTION_REASON_MAX = 500;
export const PARTIAL_WEIGHT = 0.5;

/** Estados que una ejecución puede registrar ("pending" = ausencia de registro). */
export const RECORDABLE_STATUSES = ["completed", "partial", "skipped"] as const;
export type RecordableStatus = (typeof RECORDABLE_STATUSES)[number];

export const COMPLIANCE_FORMULA = "Cumplimiento = (completados + 0,5 × parciales) ÷ entrenamientos programados vencidos";

export function isRecordableStatus(value: unknown): value is RecordableStatus {
  return typeof value === "string" && (RECORDABLE_STATUSES as readonly string[]).includes(value);
}

// ── Calendario ───────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado, del calendario (independiente de zona horaria). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** "YYYY-MM-DD" de una columna DATE leída por Prisma (medianoche UTC). */
export function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Fecha local de hoy en la zona del gimnasio; null si la zona no es válida (falla cerrado). */
export function gymToday(timezone: string | null | undefined, now: Date = new Date()): string | null {
  if (!isValidIanaTimeZone(timezone)) return null;
  return localDate(now, timezone);
}

/** Ocurrencias (fechas) de un weekday dentro de [from, to], inclusive. */
export function occurrenceDates(from: string, to: string, weekday: number): string[] {
  if (from > to) return [];
  const out: string[] = [];
  const offset = (weekday - weekdayOf(from) + 7) % 7;
  for (let d = addDays(from, offset); d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}

// ── Validación de la fecha de una ejecución ──────────────────────

export type DateCheck =
  | { ok: true }
  | { ok: false; code: "INVALID" | "FUTURE" | "TOO_OLD" | "OUTSIDE_PLAN" | "WRONG_WEEKDAY" };

interface DateCheckInput {
  date: string;
  today: string;
  planStart: string;
  planEnd: string;
  weekday: number;
}

function checkOccurrence(i: DateCheckInput): DateCheck {
  if (!isIsoDate(i.date)) return { ok: false, code: "INVALID" };
  if (i.date > i.today) return { ok: false, code: "FUTURE" };
  if (i.date < i.planStart || i.date > i.planEnd) return { ok: false, code: "OUTSIDE_PLAN" };
  if (weekdayOf(i.date) !== i.weekday) return { ok: false, code: "WRONG_WEEKDAY" };
  return { ok: true };
}

/** Autorreporte: ocurrencia real, ya transcurrida y dentro de la ventana de corrección. */
export function checkClientReportDate(i: DateCheckInput): DateCheck {
  const base = checkOccurrence(i);
  if (!base.ok) return base;
  if (i.date < addDays(i.today, -CLIENT_REPORT_WINDOW_DAYS)) return { ok: false, code: "TOO_OLD" };
  return { ok: true };
}

/** Entrenador/administración: ocurrencia real ya transcurrida del período del plan. */
export function checkTrainerRecordDate(i: DateCheckInput): DateCheck {
  return checkOccurrence(i);
}

export const DATE_CHECK_MESSAGES: Record<Exclude<DateCheck, { ok: true }>["code"], string> = {
  INVALID: "Fecha inválida.",
  FUTURE: "No se puede registrar un entrenamiento de una fecha futura.",
  TOO_OLD: `Solo puedes reportar entrenamientos de los últimos ${CLIENT_REPORT_WINDOW_DAYS} días. Pide a tu entrenador que lo registre.`,
  OUTSIDE_PLAN: "La fecha está fuera del período del plan.",
  WRONG_WEEKDAY: "La fecha no corresponde al día de la semana de esta sesión del plan.",
};

// ── Estado efectivo y procedencia ────────────────────────────────

export type StatusSource = "TRAINER" | "CLIENT_SELF_REPORT";

export interface ExecutionStatuses {
  client_status: ExecutionStatus | null;
  trainer_status: ExecutionStatus | null;
}

export function effectiveStatus(e: ExecutionStatuses | null | undefined): { status: RecordableStatus; source: StatusSource } | null {
  if (!e) return null;
  if (e.trainer_status && isRecordableStatus(e.trainer_status)) return { status: e.trainer_status, source: "TRAINER" };
  if (e.client_status && isRecordableStatus(e.client_status)) return { status: e.client_status, source: "CLIENT_SELF_REPORT" };
  return null;
}

// ── Cumplimiento ─────────────────────────────────────────────────

export interface PlanDayRef {
  id: string;
  weekday: number;
}

export interface ExecutionRef extends ExecutionStatuses {
  plan_day_id: string;
  local_date: string;
}

export interface ComplianceSummary {
  /** Entrenamientos programados con fecha ≤ hoy y dentro del período. */
  scheduled: number;
  completed: number;
  partial: number;
  skipped: number;
  /** scheduled − (completed + partial + skipped). */
  pending: number;
  /** Ocurrencias futuras aún no vencidas. */
  upcoming: number;
  /** Del total registrado, cuántas solo cuentan con autorreporte (sin registro del entrenador). */
  selfReportedOnly: number;
  /** null si no hay entrenamientos vencidos. */
  compliancePct: number | null;
}

export function summarizeCompliance(
  days: PlanDayRef[],
  period: { start: string; end: string },
  today: string,
  executions: ExecutionRef[]
): ComplianceSummary {
  const byKey = new Map<string, ExecutionRef>();
  for (const e of executions) byKey.set(`${e.plan_day_id}|${e.local_date}`, e);

  const s: ComplianceSummary = {
    scheduled: 0,
    completed: 0,
    partial: 0,
    skipped: 0,
    pending: 0,
    upcoming: 0,
    selfReportedOnly: 0,
    compliancePct: null,
  };
  const dueEnd = period.end < today ? period.end : today;
  for (const day of days) {
    for (const date of occurrenceDates(period.start, dueEnd, day.weekday)) {
      s.scheduled++;
      const eff = effectiveStatus(byKey.get(`${day.id}|${date}`));
      if (!eff) continue;
      s[eff.status]++;
      if (eff.source === "CLIENT_SELF_REPORT") s.selfReportedOnly++;
    }
    if (today < period.end) {
      s.upcoming += occurrenceDates(addDays(today, 1) > period.start ? addDays(today, 1) : period.start, period.end, day.weekday).length;
    }
  }
  s.pending = s.scheduled - s.completed - s.partial - s.skipped;
  s.compliancePct = s.scheduled > 0 ? Math.round((100 * (s.completed + PARTIAL_WEIGHT * s.partial)) / s.scheduled) : null;
  return s;
}

// ── Actividades GYM-4 sin duplicados ─────────────────────────────

export interface AttendedSessionActivities {
  sessionId: string;
  /** Actividades comunes impartidas en la sesión (ScheduledClassActivity). */
  common: string[];
  /** Actividades individuales del alumno en esa sesión (ClassAttendanceActivity). */
  individual: string[];
}

/**
 * Actividades registradas para UN alumno: pares únicos (sesión, actividad).
 * Una actividad común de una sesión GROUP cuenta una vez para este alumno
 * (no una vez por integrante del grupo) y una actividad que figura como
 * común e individual en la misma sesión no se duplica.
 */
export function countDistinctActivities(sessions: AttendedSessionActivities[]): number {
  const seen = new Set<string>();
  for (const s of sessions) {
    for (const a of [...s.common, ...s.individual]) seen.add(`${s.sessionId}|${a}`);
  }
  return seen.size;
}
