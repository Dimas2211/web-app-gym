// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — reglas puras de elegibilidad, fechas y ventanas.
//
// Sin acceso a datos: el servicio (booking-service.ts) las evalúa sobre
// filas ya bloqueadas. Complementan booking-rules.ts (2A, certificado),
// que no se modifica.
//
// Semántica de fechas:
//  - class_date / start_date / end_date son fechas LOCALES del gimnasio
//    guardadas como DATE (Prisma las entrega a medianoche UTC): se comparan
//    como "YYYY-MM-DD".
//  - "hoy" es la fecha local en GymSettings.timezone; sin timezone válida,
//    la fecha local del servidor (comportamiento heredado).
//  - starts_at / ends_at (timestamptz) mandan cuando existen; si no, se
//    derivan de class_date + HH:mm con la timezone. Sin timezone no hay
//    instante (PERSONALIZED/GROUP ya fallan cerrados por R18).
// ─────────────────────────────────────────────────────────────────

import type {
  ClassStatus,
  GymBookingChannel,
  GymClientModality,
  GymSessionConsumption,
  GymSessionKind,
  MembershipStatus,
  PaymentStatus,
} from "@prisma/client";
import type { GymBookingErrorCode } from "./booking-contracts";
import { policyAppliesTo, type GymBookingPolicy } from "./booking-policy";
import { isModalityCompatible, SESSION_KIND_FOR_MODALITY } from "./booking-rules";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const HHMM = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

// ── Fechas e instantes ────────────────────────────────────────────

/** "YYYY-MM-DD" de una columna DATE (medianoche UTC). */
export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Fecha local "YYYY-MM-DD" de `now` en `timeZone` (o del servidor si es null). */
export function localDate(now: Date, timeZone: string | null): string {
  if (!timeZone) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const parts = zonedParts(now.getTime(), timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function zonedParts(utcMs: number, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}

function offsetMs(utcMs: number, timeZone: string): number {
  const p = zonedParts(utcMs, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - (utcMs - (utcMs % 1000));
}

/**
 * Instante absoluto de la hora local `hhmm` del día `date` ("YYYY-MM-DD")
 * en `timeZone`. null si `hhmm` no es HH:mm válido. En un salto de DST la
 * hora inexistente se resuelve con el offset posterior (determinista).
 */
export function zonedInstant(date: string, hhmm: string, timeZone: string): Date | null {
  const t = HHMM.exec(hhmm);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!t || !d) return null;
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const first = guess - offsetMs(guess, timeZone);
  const second = offsetMs(first, timeZone);
  return new Date(guess - second);
}

export interface SessionTiming {
  class_date: Date;
  start_time: string;
  end_time: string;
  starts_at: Date | null;
  ends_at: Date | null;
}

/** starts_at/ends_at efectivos (columna si existe; si no, derivados con la timezone). */
export function resolveSessionInstants(
  session: SessionTiming,
  timeZone: string | null
): { startsAt: Date | null; endsAt: Date | null } {
  const day = dateOnly(session.class_date);
  const startsAt = session.starts_at ?? (timeZone ? zonedInstant(day, session.start_time, timeZone) : null);
  let endsAt = session.ends_at ?? (timeZone ? zonedInstant(day, session.end_time, timeZone) : null);
  if (startsAt && endsAt && endsAt <= startsAt) endsAt = null;
  return { startsAt, endsAt };
}

/** Intervalos [start, end) en HH:mm del mismo día; false si alguno es inválido. */
export function hhmmRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  if (![aStart, aEnd, bStart, bEnd].every((v) => HHMM.test(v))) return false;
  return aStart < bEnd && bStart < aEnd;
}

// ── Membresías ────────────────────────────────────────────────────

export interface MembershipCandidate {
  id: string;
  status: MembershipStatus;
  payment_status: PaymentStatus;
  start_date: Date;
  end_date: Date;
  modality: GymClientModality;
  sessions_total: number | null;
  sessions_used: number;
  assigned_trainer_id: string | null;
}

export type MembershipIneligibility =
  | "NOT_ACTIVE"
  | "UNPAID"
  | "OUT_OF_DATES"
  | "MODALITY_MISMATCH"
  | "TRAINER_NOT_AUTHORIZED";

export interface EligibilityContext {
  clientModality: GymClientModality;
  sessionKind: GymSessionKind;
  /** Session.trainer_id (R10: PERSONALIZED exige el entrenador asignado). */
  sessionTrainerId: string;
  sessionDate: string;
  today: string;
  /**
   * Regla de fechas heredada de OPEN sin política (corrección B):
   *  - STAFF: end_date ≥ hoy;
   *  - PORTAL: start_date ≤ hoy ≤ end_date.
   * Con política (PERSONALIZED / GROUP / OPEN activado): la membresía cubre
   * la fecha de la sesión y no venció hoy.
   */
  legacyDates: "STAFF" | "PORTAL" | null;
}

const PAID: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>(["paid", "partial"]);

export function membershipIneligibility(m: MembershipCandidate, ctx: EligibilityContext): MembershipIneligibility | null {
  if (m.status !== "active") return "NOT_ACTIVE";
  if (!PAID.has(m.payment_status)) return "UNPAID";
  const start = dateOnly(m.start_date);
  const end = dateOnly(m.end_date);
  if (ctx.legacyDates === "STAFF") {
    if (end < ctx.today) return "OUT_OF_DATES";
  } else if (ctx.legacyDates === "PORTAL") {
    if (start > ctx.today || end < ctx.today) return "OUT_OF_DATES";
  } else if (start > ctx.sessionDate || end < ctx.sessionDate || end < ctx.today) {
    return "OUT_OF_DATES";
  }
  if (!isModalityCompatible(ctx.clientModality, m.modality, ctx.sessionKind)) return "MODALITY_MISMATCH";
  if (ctx.sessionKind === "PERSONALIZED" && m.assigned_trainer_id !== ctx.sessionTrainerId) {
    return "TRAINER_NOT_AUTHORIZED";
  }
  return null;
}

export function hasRemainingSessions(m: Pick<MembershipCandidate, "sessions_total" | "sessions_used">): boolean {
  return m.sessions_total == null || m.sessions_used < m.sessions_total;
}

export type MembershipSelection =
  | { ok: true; membership: MembershipCandidate }
  | {
      ok: false;
      code: Extract<
        GymBookingErrorCode,
        "NO_ELIGIBLE_MEMBERSHIP" | "MODALITY_MISMATCH" | "TRAINER_NOT_AUTHORIZED" | "MEMBERSHIP_EXHAUSTED"
      >;
    };

/**
 * Elige la membresía que autoriza (y, si consume, de la que se descuenta) la
 * reserva:
 *  - `requiredMembershipId`: reactivación de una reserva todavía CONSUMED
 *    (cancelación tardía) → debe ser la misma membresía, sin exigir saldo.
 *  - `consumesNewSession`: de las elegibles con saldo, la que vence antes
 *    (luego id). Elegibles sin saldo → MEMBERSHIP_EXHAUSTED.
 *  - Sin consumo nuevo (OPEN): basta una elegible (la que vence antes). El
 *    servicio no liga la reserva OPEN a la membresía (forma heredada).
 * Sin elegibles, el código más específico: la modalidad del cliente no
 * corresponde al tipo de sesión → MODALITY_MISMATCH; luego, entre las
 * membresías vigentes y pagadas, TRAINER_NOT_AUTHORIZED > MODALITY_MISMATCH;
 * si no, NO_ELIGIBLE_MEMBERSHIP.
 */
export function selectMembership(
  candidates: readonly MembershipCandidate[],
  ctx: EligibilityContext,
  opts: { consumesNewSession: boolean; requiredMembershipId: string | null }
): MembershipSelection {
  if (SESSION_KIND_FOR_MODALITY[ctx.clientModality] !== ctx.sessionKind) {
    return { ok: false, code: "MODALITY_MISMATCH" };
  }
  const pool = opts.requiredMembershipId
    ? candidates.filter((m) => m.id === opts.requiredMembershipId)
    : candidates;
  const reasons = pool.map((m) => ({ m, why: membershipIneligibility(m, ctx) }));
  const eligible = reasons
    .filter((r) => r.why === null)
    .map((r) => r.m)
    .sort((a, b) => dateOnly(a.end_date).localeCompare(dateOnly(b.end_date)) || a.id.localeCompare(b.id));

  if (eligible.length === 0) {
    const whys = new Set(reasons.map((r) => r.why));
    if (whys.has("TRAINER_NOT_AUTHORIZED")) return { ok: false, code: "TRAINER_NOT_AUTHORIZED" };
    if (whys.has("MODALITY_MISMATCH")) return { ok: false, code: "MODALITY_MISMATCH" };
    return { ok: false, code: "NO_ELIGIBLE_MEMBERSHIP" };
  }
  if (opts.requiredMembershipId || !opts.consumesNewSession) return { ok: true, membership: eligible[0] };
  const withBalance = eligible.find(hasRemainingSessions);
  if (!withBalance) return { ok: false, code: "MEMBERSHIP_EXHAUSTED" };
  return { ok: true, membership: withBalance };
}

// ── Ventanas heredadas y de asistencia ────────────────────────────

/**
 * OPEN sin política: el portal no reserva ni cancela clases de días
 * anteriores (regla heredada "hasta el día de la clase"); staff no tiene
 * restricción de fecha.
 */
export function legacyOpenDateAllowed(channel: "STAFF" | "PORTAL", sessionDate: string, today: string): boolean {
  return channel === "STAFF" || sessionDate >= today;
}

export type AttendanceWindowCheck =
  | { ok: true }
  | { ok: false; code: "SCHEDULE_INCOMPLETE" | "ATTENDANCE_NOT_STARTED" | "ATTENDANCE_WINDOW_CLOSED" };

/**
 * Ventana de registro/edición de asistencia. Con política: desde el inicio
 * de la sesión hasta su fin (o su inicio si no hay fin) más
 * attendance_edit_window_hours. OPEN sin política: sin ventana (heredado).
 */
export function checkAttendanceWindow(input: {
  kind: GymSessionKind;
  policy: GymBookingPolicy;
  now: Date;
  startsAt: Date | null;
  endsAt: Date | null;
}): AttendanceWindowCheck {
  if (!policyAppliesTo(input.policy, input.kind)) return { ok: true };
  return attendanceWindowState(input);
}

/** Ventana [inicio, fin + attendance_edit_window_hours] sin compuerta de política. */
function attendanceWindowState(input: {
  policy: GymBookingPolicy;
  now: Date;
  startsAt: Date | null;
  endsAt: Date | null;
}): AttendanceWindowCheck {
  if (!input.startsAt) return { ok: false, code: "SCHEDULE_INCOMPLETE" };
  const now = input.now.getTime();
  if (now < input.startsAt.getTime()) return { ok: false, code: "ATTENDANCE_NOT_STARTED" };
  const closesAt = (input.endsAt ?? input.startsAt).getTime() + input.policy.attendanceEditWindowHours * HOUR;
  if (now > closesAt) return { ok: false, code: "ATTENDANCE_WINDOW_CLOSED" };
  return { ok: true };
}

export type AttendanceAccess =
  | { ok: true; administrativeCorrection: boolean }
  | { ok: false; code: "SCHEDULE_INCOMPLETE" | "ATTENDANCE_NOT_STARTED" | "ATTENDANCE_WINDOW_CLOSED" };

/**
 * R32 (auditoría Etapa 1): el entrenador de la sesión —y recepción, que solo
 * hace check-in— edita la asistencia desde el inicio hasta 48 h
 * (attendance_edit_window_hours) después de ends_at o hasta que la sesión se
 * cierra (status completed), lo que ocurra primero. Después, solo SA o BA de
 * la sede, como corrección administrativa (queda marcada en el evento).
 * Nadie registra antes del inicio.
 * Excepción heredada (corrección B): staff en OPEN sin política conserva el
 * registro sin ventana. El canal TRAINER es nuevo y no tiene excepción.
 */
export function checkAttendanceAccess(input: {
  kind: GymSessionKind;
  policy: GymBookingPolicy;
  now: Date;
  startsAt: Date | null;
  endsAt: Date | null;
  sessionStatus: ClassStatus;
  channel: GymBookingChannel;
  role: string;
}): AttendanceAccess {
  const admin = input.channel === "STAFF" && (input.role === "super_admin" || input.role === "branch_admin");
  if (input.channel === "STAFF" && !policyAppliesTo(input.policy, input.kind)) {
    return { ok: true, administrativeCorrection: false };
  }
  const closedOrExpired = (): AttendanceAccess =>
    admin ? { ok: true, administrativeCorrection: true } : { ok: false, code: "ATTENDANCE_WINDOW_CLOSED" };
  if (input.sessionStatus === "completed") return closedOrExpired();
  const window = attendanceWindowState(input);
  if (window.ok) return { ok: true, administrativeCorrection: false };
  if (window.code === "ATTENDANCE_WINDOW_CLOSED") return closedOrExpired();
  return window;
}

/**
 * Auditoría GYM-4 H03 — actividades impartidas (comunes e individuales).
 * Una actividad "realizada" exige que la sesión haya empezado de verdad:
 * sin instante de inicio (SCHEDULE_INCOMPLETE) o antes de él
 * (ATTENDANCE_NOT_STARTED) nadie la registra, por ningún canal ni estado.
 * NO hereda la excepción STAFF + OPEN sin política de checkAttendanceAccess
 * (propia del check-in heredado, que no cambia). Después del inicio aplica
 * R32 igual que la asistencia: el entrenador hasta fin + 48 h o el cierre;
 * luego solo SA/BA como corrección administrativa.
 */
export function checkTrainingRecordAccess(input: {
  policy: GymBookingPolicy;
  now: Date;
  startsAt: Date | null;
  endsAt: Date | null;
  sessionStatus: ClassStatus;
  channel: GymBookingChannel;
  role: string;
}): AttendanceAccess {
  if (!input.startsAt) return { ok: false, code: "SCHEDULE_INCOMPLETE" };
  if (input.now.getTime() < input.startsAt.getTime()) return { ok: false, code: "ATTENDANCE_NOT_STARTED" };
  const admin = input.channel === "STAFF" && (input.role === "super_admin" || input.role === "branch_admin");
  const closedOrExpired = (): AttendanceAccess =>
    admin ? { ok: true, administrativeCorrection: true } : { ok: false, code: "ATTENDANCE_WINDOW_CLOSED" };
  if (input.sessionStatus === "completed") return closedOrExpired();
  const window = attendanceWindowState(input);
  if (window.ok) return { ok: true, administrativeCorrection: false };
  if (window.code === "ATTENDANCE_WINDOW_CLOSED") return closedOrExpired();
  return window;
}

/**
 * GYM-4 — el entrenador opera una sesión solo si el perfil Trainer asignado
 * (ScheduledClass.trainer_id) está ACTIVO y vinculado a su usuario. La sede
 * del entrenador no cuenta: manda la asignación (OPEN permite asignar un
 * entrenador de otra sede). Client.assigned_trainer_id nunca autoriza.
 */
export function trainerOwnsSession(
  actor: { userId: string; role: string },
  sessionTrainer: { user_id: string | null; status: string }
): boolean {
  return (
    actor.role === "trainer" &&
    sessionTrainer.status === "active" &&
    sessionTrainer.user_id !== null &&
    sessionTrainer.user_id === actor.userId
  );
}

/**
 * GYM-4 — quién escribe el registro de entrenamiento de una sesión
 * (actividades comunes/individuales): el entrenador de la sesión (canal
 * TRAINER) o SA/BA de su alcance (canal STAFF). Recepción nunca (R36: no
 * adquiere privilegios de entrenador).
 */
export function checkSessionOperator(input: {
  channel: GymBookingChannel;
  actor: { userId: string; role: string };
  scopeLocationId: string | null;
  session: { branch_id: string; trainer: { user_id: string | null; status: string } };
}): boolean {
  if (input.channel === "TRAINER") return trainerOwnsSession(input.actor, input.session.trainer);
  if (input.channel !== "STAFF") return false;
  if (input.actor.role === "super_admin") return true;
  return input.actor.role === "branch_admin" && input.scopeLocationId !== null && input.session.branch_id === input.scopeLocationId;
}

/**
 * R29: el staff justifica toda cancelación que devuelve o retiene una sesión
 * consumida, y toda cancelación bajo política. OPEN heredado (sin consumo y
 * sin política) conserva el botón sin motivo.
 */
export function staffCancelReasonRequired(
  kind: GymSessionKind,
  policy: GymBookingPolicy,
  consumption: GymSessionConsumption
): boolean {
  return policyAppliesTo(policy, kind) || consumption === "CONSUMED";
}

/** Normaliza un motivo libre: recorta y limita; vacío → null. */
export function normalizeReason(reason: string | null | undefined, max = 500): string | null {
  const v = (reason ?? "").trim();
  return v ? v.slice(0, max) : null;
}
