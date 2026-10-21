// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3B — estado de presentación de sesiones en el portal.
//
// Reglas puras, sin acceso a datos. Evalúan una sesión desde el punto de
// vista del alumno con las MISMAS piezas que usa GymBookingService
// (booking-policy / booking-rules / booking-eligibility) y en el mismo
// orden que bookSession / cancelBooking. No hay reglas nuevas: solo se
// decide qué mostrar y si ofrecer el botón. El servidor conserva siempre
// la decisión definitiva (la transacción del servicio, bajo bloqueo).
//
// Estados de presentación (no existen en BD):
//   AVAILABLE · FULL · BOOKED · NOT_ELIGIBLE · CANCELLED · FINISHED
// ─────────────────────────────────────────────────────────────────

import type {
  BookingStatus,
  ClassStatus,
  GymBookingCancellationType,
  GymClientModality,
  GymSessionConsumption,
  GymSessionKind,
  Status,
} from "@prisma/client";
import type { GymBookingErrorCode } from "@/modules/classes/booking/booking-contracts";
import { gymBookingErrorMessage } from "@/modules/classes/booking/booking-messages";
import { policyAppliesTo, sessionKindReadiness, type GymBookingPolicy } from "@/modules/classes/booking/booking-policy";
import { checkBookingWindow, consumptionOnBook, decideCancellation } from "@/modules/classes/booking/booking-rules";
import {
  dateOnly,
  hhmmRangesOverlap,
  legacyOpenDateAllowed,
  localDate,
  resolveSessionInstants,
  selectMembership,
  type MembershipCandidate,
} from "@/modules/classes/booking/booking-eligibility";

export type PortalSessionState = "AVAILABLE" | "FULL" | "BOOKED" | "NOT_ELIGIBLE" | "CANCELLED" | "FINISHED";

/** Por qué no se puede reservar: capacidad, política del gimnasio, membresía o perfil. */
export type PortalBlockKind = "capacity" | "policy" | "membership" | "profile";

export interface PortalBlock {
  kind: PortalBlockKind;
  code: GymBookingErrorCode;
  message: string;
}

export interface PortalOwnBooking {
  id: string;
  booking_status: BookingStatus;
  consumption: GymSessionConsumption;
  client_membership_id: string | null;
  cancellation_type: GymBookingCancellationType | null;
}

export interface PortalSessionInput {
  id: string;
  branch_id: string;
  trainer_id: string;
  session_kind: GymSessionKind;
  status: ClassStatus;
  class_date: Date;
  start_time: string;
  end_time: string;
  starts_at: Date | null;
  ends_at: Date | null;
  capacity: number;
  booked_count: number;
}

export interface PortalClientInput {
  id: string;
  branch_id: string;
  modality: GymClientModality;
  status: Status;
}

/** Reserva confirmada propia de otra sesión (para el solapamiento, R14 del alumno). */
export interface PortalOwnSlot {
  sessionId: string;
  date: string;
  start: string;
  end: string;
}

export interface PortalEvaluation {
  state: PortalSessionState;
  /** Motivo de NOT_ELIGIBLE / FULL / cancelación no permitida. */
  block: PortalBlock | null;
  canBook: boolean;
  /** true si reservar reactiva una reserva propia cancelada (bookSession la reutiliza). */
  isReactivation: boolean;
  canCancel: boolean;
  /** Aviso previo a cancelar (cancelación tardía que no devuelve la sesión). */
  cancelWarning: string | null;
}

const BLOCK_KIND: Partial<Record<GymBookingErrorCode, PortalBlockKind>> = {
  SESSION_FULL: "capacity",
  NO_ELIGIBLE_MEMBERSHIP: "membership",
  MODALITY_MISMATCH: "membership",
  TRAINER_NOT_AUTHORIZED: "membership",
  MEMBERSHIP_EXHAUSTED: "membership",
  CLIENT_INACTIVE: "profile",
  CROSS_LOCATION: "profile",
};

function block(code: GymBookingErrorCode, message?: string): PortalBlock {
  return { kind: BLOCK_KIND[code] ?? "policy", code, message: gymBookingErrorMessage(code, "portal", message) };
}

const LATE_CANCEL_WARNING = "Cancelación tardía: la sesión se descontará de tu membresía.";

/**
 * Estado de una sesión para el alumno. Espeja el orden de bookSession:
 * reserva propia → sesión cancelada/cerrada → sede → readiness R18 →
 * perfil → estado → ventana (política o regla heredada) → membresía →
 * solapamiento propio → cupo.
 */
export function evaluatePortalSession(input: {
  session: PortalSessionInput;
  client: PortalClientInput;
  policy: GymBookingPolicy;
  now: Date;
  /** Membresías candidatas del alumno (status active + la de la reserva previa). */
  memberships: readonly MembershipCandidate[];
  ownBooking: PortalOwnBooking | null;
  /** Otras reservas confirmadas propias (sesiones no canceladas). */
  ownSlots: readonly PortalOwnSlot[];
}): PortalEvaluation {
  const { session, client, policy, now, ownBooking } = input;
  const kind = session.session_kind;
  const applies = policyAppliesTo(policy, kind);
  const today = localDate(now, policy.timezone);
  const sessionDate = dateOnly(session.class_date);
  const { startsAt, endsAt } = resolveSessionInstants(session, policy.timezone);

  const none = { canBook: false, isReactivation: false, canCancel: false, cancelWarning: null };

  // Finalizada: cerrada por el staff, o pasada según la regla que aplica
  // (política: fin/inicio ya ocurrió; OPEN heredado: día anterior a hoy).
  const finished =
    session.status === "completed" ||
    (applies
      ? endsAt
        ? endsAt <= now
        : startsAt
          ? startsAt <= now
          : false
      : !legacyOpenDateAllowed("PORTAL", sessionDate, today));

  if (session.status === "cancelled") return { ...none, state: "CANCELLED", block: null };

  // ── Reserva propia confirmada: solo cancelar (cancelBooking) ──
  // La acción la decide la regla real de cancelBooking aunque la sesión se
  // muestre FINALIZADA: OPEN sin política y sin consumo sigue cancelable en
  // una sesión completed del mismo día (auditoría externa 3B, H02).
  if (ownBooking?.booking_status === "confirmed") {
    const cancel = evaluateCancellation({ session, policy, now, applies, today, sessionDate, startsAt, booking: ownBooking });
    if (finished) return { ...none, state: "FINISHED", block: null, canCancel: cancel.ok, cancelWarning: cancel.warning };
    return { ...none, state: "BOOKED", block: cancel.block, canCancel: cancel.ok, cancelWarning: cancel.warning };
  }

  if (finished) return { ...none, state: "FINISHED", block: null };

  const notEligible = (b: PortalBlock): PortalEvaluation => ({ ...none, state: "NOT_ELIGIBLE", block: b });

  if (session.branch_id !== client.branch_id) return notEligible(block("CROSS_LOCATION"));
  const readiness = sessionKindReadiness(policy, kind);
  if (!readiness.ok) return notEligible(block(readiness.code));
  if (client.status !== "active") return notEligible(block("CLIENT_INACTIVE"));
  if (session.status !== "scheduled") return notEligible(block("SESSION_NOT_BOOKABLE"));
  if (applies) {
    const window = checkBookingWindow({ kind, policy, now, startsAt, actor: "CLIENT" });
    if (!window.ok) return notEligible(block(window.code));
  }

  const plan = consumptionOnBook(kind, ownBooking?.consumption ?? null);
  const selection = selectMembership(
    input.memberships,
    {
      clientModality: client.modality,
      sessionKind: kind,
      sessionTrainerId: session.trainer_id,
      sessionDate,
      today,
      legacyDates: applies ? null : "PORTAL",
    },
    {
      consumesNewSession: plan.consumesNewSession,
      requiredMembershipId:
        ownBooking?.consumption === "CONSUMED" && kind !== "OPEN" ? ownBooking.client_membership_id : null,
    }
  );
  if (!selection.ok) return notEligible(block(selection.code));

  if (applies) {
    const clash = input.ownSlots.some(
      (o) => o.sessionId !== session.id && o.date === sessionDate && hhmmRangesOverlap(session.start_time, session.end_time, o.start, o.end)
    );
    if (clash) return notEligible(block("CLIENT_SCHEDULE_CONFLICT"));
  }

  if (session.booked_count >= session.capacity) return { ...none, state: "FULL", block: block("SESSION_FULL") };

  return { ...none, state: "AVAILABLE", block: null, canBook: true, isReactivation: ownBooking !== null };
}

/** Espejo de cancelBooking (canal PORTAL) sobre una reserva confirmada. */
function evaluateCancellation(input: {
  session: PortalSessionInput;
  policy: GymBookingPolicy;
  now: Date;
  applies: boolean;
  today: string;
  sessionDate: string;
  startsAt: Date | null;
  booking: PortalOwnBooking;
}): { ok: boolean; block: PortalBlock | null; warning: string | null } {
  const { session, booking } = input;
  if (session.status === "completed" && (input.applies || booking.consumption !== "NOT_APPLICABLE")) {
    return { ok: false, block: block("SESSION_CLOSED"), warning: null };
  }
  if (!input.applies && !legacyOpenDateAllowed("PORTAL", input.sessionDate, input.today)) {
    return { ok: false, block: block("CANCEL_WINDOW_CLOSED"), warning: null };
  }
  const decision = decideCancellation({
    kind: session.session_kind,
    policy: input.policy,
    now: input.now,
    startsAt: input.startsAt,
    actor: "CLIENT",
  });
  if (!decision.ok) return { ok: false, block: block(decision.code), warning: null };
  const warning =
    decision.cancellationType === "CLIENT_LATE" && !decision.releasesSession && booking.consumption === "CONSUMED"
      ? LATE_CANCEL_WARNING
      : null;
  return { ok: true, block: null, warning };
}

// ── Fechas del calendario (fecha local del gimnasio) ──────────────

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" válido (fecha de calendario real). */
export function isCalendarDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = YMD.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return dateOnly(d) === value;
}

/** Suma días de CALENDARIO a una fecha "YYYY-MM-DD" (aritmética de fecha, no de instantes: inmune a DST). */
export function addCalendarDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnly(d);
}

/** Lunes de la semana de `date` ("YYYY-MM-DD"). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay(); // 0 = domingo
  return addCalendarDays(date, dow === 0 ? -6 : 1 - dow);
}

/** Columna DATE para Prisma (medianoche UTC). */
export function dateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Navegación acotada: hasta 26 semanas atrás/adelante de la semana de hoy. */
export const PORTAL_WEEK_NAV_LIMIT = 26;

/** Semana visible: la pedida (normalizada a lunes y acotada) o la de hoy. */
export function resolvePortalWeek(requested: string | null | undefined, today: string): { start: string; end: string; days: string[] } {
  const current = weekStart(today);
  let start = isCalendarDate(requested) ? weekStart(requested) : current;
  const min = addCalendarDays(current, -7 * PORTAL_WEEK_NAV_LIMIT);
  const max = addCalendarDays(current, 7 * PORTAL_WEEK_NAV_LIMIT);
  if (start < min) start = min;
  if (start > max) start = max;
  const days = Array.from({ length: 7 }, (_, i) => addCalendarDays(start, i));
  return { start, end: days[6], days };
}

/**
 * Fecha y horas LOCALES del gimnasio para mostrar. Con instantes y
 * timezone se formatean en GymSettings.timezone (nunca la zona del
 * servidor); si no, las columnas heredadas class_date / HH:mm, que ya son
 * hora local del gimnasio.
 */
export function sessionLocalTimes(
  session: Pick<PortalSessionInput, "class_date" | "start_time" | "end_time" | "starts_at" | "ends_at">,
  timeZone: string | null
): { date: string; start: string; end: string } {
  const legacy = { date: dateOnly(session.class_date), start: session.start_time, end: session.end_time };
  if (!timeZone || !session.starts_at) return legacy;
  return {
    date: localDate(session.starts_at, timeZone),
    start: localHHmm(session.starts_at, timeZone),
    end: session.ends_at ? localHHmm(session.ends_at, timeZone) : session.end_time,
  };
}

function localHHmm(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour").padStart(2, "0").replace(/^24$/, "00")}:${get("minute")}`;
}

/** Etiqueta de una fecha "YYYY-MM-DD" sin desplazarla por la zona del servidor. */
export function formatCalendarDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("es-MX", { ...options, timeZone: "UTC" });
}

// ── Etiquetas ─────────────────────────────────────────────────────

export const MODALITY_LABELS: Record<GymClientModality, string> = {
  NORMAL: "Normal",
  PERSONALIZED: "Personalizada",
  GROUP: "Grupal",
};

export const SESSION_KIND_LABELS: Record<GymSessionKind, string> = {
  OPEN: "Clase abierta",
  PERSONALIZED: "Personalizada",
  GROUP: "Grupal",
};

export const PORTAL_STATE_LABELS: Record<PortalSessionState, string> = {
  AVAILABLE: "Disponible",
  FULL: "Completo",
  BOOKED: "Reservado",
  NOT_ELIGIBLE: "No elegible",
  CANCELLED: "Cancelado",
  FINISHED: "Finalizado",
};

/** Origen de una cancelación, en lenguaje del alumno (sin motivo interno del staff). */
export const CANCELLATION_TYPE_LABELS: Record<GymBookingCancellationType, string> = {
  CLIENT_IN_POLICY: "Cancelada por ti",
  CLIENT_LATE: "Cancelada por ti (tardía)",
  STAFF: "Cancelada por el gimnasio",
  SESSION_CANCELLED: "Clase cancelada",
};
