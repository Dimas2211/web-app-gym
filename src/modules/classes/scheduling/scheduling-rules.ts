// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — reglas puras de programación administrativa.
//
// Sin acceso a datos. Las acciones de clases, el generador de series y
// las ausencias las evalúan bajo el lock del entrenador
// (GYM_BOOKING_LOCK_ORDER: trainers → class_series → trainer_time_off →
// … → scheduled_classes). Reutilizan las reglas certificadas de 2A/2B
// (booking-policy, booking-rules, booking-eligibility) sin modificarlas.
//
// Semántica de fechas: igual que booking-eligibility — class_date,
// starts_on, ends_on, valid_from y valid_until son fechas LOCALES del
// gimnasio (DATE, medianoche UTC en Prisma) y se comparan "YYYY-MM-DD".
// ─────────────────────────────────────────────────────────────────

import type { GymSessionKind } from "@prisma/client";
import { sessionKindReadiness, type GymBookingPolicy } from "../booking/booking-policy";
import { resolveEffectiveCapacity } from "../booking/booking-rules";
import { dateOnly, hhmmRangesOverlap, zonedInstant } from "../booking/booking-eligibility";

export const HHMM_REGEX = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

/** "YYYY-MM-DD" que corresponde a una fecha real del calendario. */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/** Día de la semana (0 = domingo … 6 = sábado), igual que TrainerAvailability.day_of_week. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Columna DATE a partir de "YYYY-MM-DD". */
export function dbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

// ── Ausencias ─────────────────────────────────────────────────────

export interface TimeOffWindow {
  starts_on: Date;
  ends_on: Date;
  /** null = día completo. */
  start_time: string | null;
  end_time: string | null;
}

/** ¿La ausencia cubre (aunque sea en parte) el horario [start, end) del día `date`? */
export function timeOffCoversSlot(timeOff: TimeOffWindow, date: string, start: string, end: string): boolean {
  if (date < dateOnly(timeOff.starts_on) || date > dateOnly(timeOff.ends_on)) return false;
  if (!timeOff.start_time || !timeOff.end_time) return true;
  return hhmmRangesOverlap(timeOff.start_time, timeOff.end_time, start, end);
}

/** ¿Dos ausencias del mismo entrenador se cruzan en algún día y hora? */
export function timeOffWindowsOverlap(a: TimeOffWindow, b: TimeOffWindow): boolean {
  if (dateOnly(a.starts_on) > dateOnly(b.ends_on) || dateOnly(b.starts_on) > dateOnly(a.ends_on)) return false;
  if (!a.start_time || !a.end_time || !b.start_time || !b.end_time) return true;
  return hhmmRangesOverlap(a.start_time, a.end_time, b.start_time, b.end_time);
}

// ── Series ────────────────────────────────────────────────────────

export interface SeriesWindowInput {
  weekday: number;
  validFrom: string;
  validUntil: string | null;
  /** Fecha local de hoy en la timezone del gimnasio. */
  today: string;
  /** GymSettings.series_generation_weeks. */
  weeks: number;
}

/**
 * Fechas a generar: desde max(hoy, valid_from) hasta min(valid_until,
 * hoy + weeks·7 − 1), solo el día de la semana de la serie. Ventana
 * siempre finita (nunca genera más allá de la política).
 */
export function planSeriesDates(input: SeriesWindowInput): { from: string; to: string; dates: string[] } {
  const from = input.validFrom > input.today ? input.validFrom : input.today;
  const horizonEnd = addDaysIso(input.today, Math.max(0, input.weeks) * 7 - 1);
  const to = input.validUntil && input.validUntil < horizonEnd ? input.validUntil : horizonEnd;
  const dates: string[] = [];
  if (from > to) return { from, to, dates };
  const offset = (input.weekday - weekdayOf(from) + 7) % 7;
  for (let d = addDaysIso(from, offset); d <= to; d = addDaysIso(d, 7)) dates.push(d);
  return { from, to, dates };
}

// ── Configuración de una sesión según su tipo ─────────────────────

export interface SessionSetupInput {
  kind: GymSessionKind;
  policy: GymBookingPolicy;
  date: string;
  startTime: string;
  endTime: string;
  explicitCapacity?: number | null;
  seriesCapacity?: number | null;
  trainerPersonalizedCapacity?: number | null;
  classTypeCapacityDefault?: number | null;
}

export type SessionSetup =
  | { ok: true; capacity: number; startsAt: Date | null; endsAt: Date | null }
  | { ok: false; field: "session_kind" | "capacity" | "start_time"; message: string };

export const SESSION_KIND_LABELS: Record<GymSessionKind, string> = {
  OPEN: "Abierta (NORMAL)",
  PERSONALIZED: "Personalizada",
  GROUP: "Grupal",
};

/**
 * Cupo efectivo (R19) e instantes de una sesión nueva o editada.
 *  - PERSONALIZED / GROUP: exigen flag activo y timezone IANA (R18, fallo
 *    cerrado) y guardan starts_at / ends_at calculados con esa timezone.
 *  - OPEN: conserva el comportamiento heredado (instantes NULL, los deriva
 *    el motor) y no depende de la política.
 */
export function resolveSessionSetup(input: SessionSetupInput): SessionSetup {
  const readiness = sessionKindReadiness(input.policy, input.kind);
  if (!readiness.ok) {
    return {
      ok: false,
      field: "session_kind",
      message:
        readiness.code === "MODALITY_DISABLED"
          ? `Las sesiones de tipo ${SESSION_KIND_LABELS[input.kind]} no están habilitadas en la configuración de reservas.`
          : "Configura una zona horaria válida del gimnasio antes de programar sesiones personalizadas o grupales.",
    };
  }

  const capacity = resolveEffectiveCapacity({
    kind: input.kind,
    explicitCapacity: input.explicitCapacity,
    seriesCapacity: input.seriesCapacity,
    trainerPersonalizedCapacity: input.trainerPersonalizedCapacity,
    classTypeCapacityDefault: input.classTypeCapacityDefault,
    policy: input.policy,
  });
  if (capacity == null) {
    return { ok: false, field: "capacity", message: "Define la capacidad (o un cupo por defecto en el tipo de clase)." };
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    return { ok: false, field: "capacity", message: "Capacidad mínima: 1" };
  }

  if (input.kind === "OPEN") return { ok: true, capacity, startsAt: null, endsAt: null };

  const tz = input.policy.timezone as string; // readiness garantiza timezone válida
  const startsAt = zonedInstant(input.date, input.startTime, tz);
  const endsAt = zonedInstant(input.date, input.endTime, tz);
  if (!startsAt || !endsAt || endsAt <= startsAt) {
    return {
      ok: false,
      field: "start_time",
      message: "El horario no es válido en la zona horaria del gimnasio (revisa cambios de horario).",
    };
  }
  return { ok: true, capacity, startsAt, endsAt };
}
