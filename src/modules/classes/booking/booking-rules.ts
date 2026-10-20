// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2A — reglas puras del contrato de reservas.
//
// Sin acceso a datos. El servicio transaccional de 2B las usará bajo los
// bloqueos de GYM_BOOKING_LOCK_ORDER; aquí quedan fijadas y testeadas.
// `bookingCounterDeltas` replica EXACTAMENTE la lógica del trigger
// gym_class_bookings_counters (migración 20261019000000), para poder
// verificar los invariantes I1/I2 sin base de datos.
// ─────────────────────────────────────────────────────────────────

import type {
  BookingStatus,
  GymBookingCancellationType,
  GymClientModality,
  GymSessionConsumption,
  GymSessionKind,
} from "@prisma/client";
import { policyAppliesTo, type GymBookingPolicy } from "./booking-policy";

// R7 / Q1: cada modalidad reserva SOLO su tipo de sesión.
export const SESSION_KIND_FOR_MODALITY: Record<GymClientModality, GymSessionKind> = {
  NORMAL: "OPEN",
  PERSONALIZED: "PERSONALIZED",
  GROUP: "GROUP",
};

/**
 * R2 + R6 + R7: la modalidad del cliente sola nunca habilita; la membresía
 * (snapshot) debe tener la misma modalidad y ambas deben corresponder al
 * tipo de sesión.
 */
export function isModalityCompatible(
  clientModality: GymClientModality,
  membershipModality: GymClientModality,
  sessionKind: GymSessionKind
): boolean {
  return clientModality === membershipModality && SESSION_KIND_FOR_MODALITY[clientModality] === sessionKind;
}

/** Solo PERSONALIZED / GROUP consumen sesiones de la membresía (R12). */
export function sessionKindConsumes(kind: GymSessionKind): boolean {
  return kind !== "OPEN";
}

/**
 * Consumo resultante al reservar o reactivar (R24 + invariante I6):
 *  - OPEN → NOT_APPLICABLE.
 *  - Reserva ya CONSUMED (cancelación tardía) → sigue CONSUMED, sin doble consumo.
 *  - En otro caso → CONSUMED (requiere sesiones disponibles).
 */
export function consumptionOnBook(
  kind: GymSessionKind,
  prior: GymSessionConsumption | null
): { consumption: GymSessionConsumption; consumesNewSession: boolean } {
  if (!sessionKindConsumes(kind)) return { consumption: "NOT_APPLICABLE", consumesNewSession: false };
  if (prior === "CONSUMED") return { consumption: "CONSUMED", consumesNewSession: false };
  return { consumption: "CONSUMED", consumesNewSession: true };
}

/** R19: cupo efectivo al crear una sesión. */
export function resolveEffectiveCapacity(input: {
  kind: GymSessionKind;
  explicitCapacity?: number | null;
  seriesCapacity?: number | null;
  trainerPersonalizedCapacity?: number | null;
  classTypeCapacityDefault?: number | null;
  policy: GymBookingPolicy;
}): number | null {
  if (input.explicitCapacity != null) return input.explicitCapacity;
  if (input.seriesCapacity != null) return input.seriesCapacity;
  if (input.kind === "PERSONALIZED") {
    return input.trainerPersonalizedCapacity ?? input.policy.personalizedDefaultCapacity;
  }
  return input.classTypeCapacityDefault ?? null;
}

export type BookingWindowCheck =
  | { ok: true }
  | { ok: false; code: "SCHEDULE_INCOMPLETE" | "SESSION_STARTED" | "OUTSIDE_BOOKING_HORIZON" | "BELOW_MIN_LEAD" };

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * R22 / R25: ventana de reserva. Solo aplica cuando policyAppliesTo(kind);
 * OPEN sin activación devuelve ok y conserva la validación heredada.
 * Staff está exento de booking_min_lead (R25), no del horizonte.
 */
export function checkBookingWindow(input: {
  kind: GymSessionKind;
  policy: GymBookingPolicy;
  now: Date;
  startsAt: Date | null;
  actor: "CLIENT" | "STAFF";
}): BookingWindowCheck {
  if (!policyAppliesTo(input.policy, input.kind)) return { ok: true };
  if (!input.startsAt) return { ok: false, code: "SCHEDULE_INCOMPLETE" };
  const start = input.startsAt.getTime();
  const now = input.now.getTime();
  if (now >= start) return { ok: false, code: "SESSION_STARTED" };
  if (start > now + input.policy.bookingHorizonDays * DAY) return { ok: false, code: "OUTSIDE_BOOKING_HORIZON" };
  if (input.actor === "CLIENT" && start < now + input.policy.bookingMinLeadMinutes * MINUTE) {
    return { ok: false, code: "BELOW_MIN_LEAD" };
  }
  return { ok: true };
}

export type CancellationDecision =
  | { ok: true; cancellationType: GymBookingCancellationType; releasesSession: boolean }
  | { ok: false; code: "SCHEDULE_INCOMPLETE" | "CANCEL_WINDOW_CLOSED" };

/**
 * R26–R29. Liberar cupo es SIEMPRE cierto al cancelar una reserva
 * confirmada; `releasesSession` indica si se devuelve la sesión consumida.
 * OPEN sin activación de política: CLIENT_IN_POLICY y la regla de fecha
 * heredada (hasta el día de la clase) la sigue aplicando el flujo heredado.
 */
export function decideCancellation(input: {
  kind: GymSessionKind;
  policy: GymBookingPolicy;
  now: Date;
  startsAt: Date | null;
  actor: "CLIENT" | "STAFF" | "SESSION_CANCELLED";
}): CancellationDecision {
  if (input.actor === "SESSION_CANCELLED") {
    return { ok: true, cancellationType: "SESSION_CANCELLED", releasesSession: true };
  }
  if (input.actor === "STAFF") return { ok: true, cancellationType: "STAFF", releasesSession: true };
  if (!policyAppliesTo(input.policy, input.kind)) {
    return { ok: true, cancellationType: "CLIENT_IN_POLICY", releasesSession: true };
  }
  if (!input.startsAt) return { ok: false, code: "SCHEDULE_INCOMPLETE" };
  const start = input.startsAt.getTime();
  const now = input.now.getTime();
  if (now >= start) return { ok: false, code: "CANCEL_WINDOW_CLOSED" };
  if (now <= start - input.policy.cancelMinLeadMinutes * MINUTE) {
    return { ok: true, cancellationType: "CLIENT_IN_POLICY", releasesSession: true };
  }
  return {
    ok: true,
    cancellationType: "CLIENT_LATE",
    releasesSession: !input.policy.lateCancelConsumesSession,
  };
}

/** Consumo de la reserva después de cancelar. */
export function consumptionAfterCancel(
  current: GymSessionConsumption,
  releasesSession: boolean
): GymSessionConsumption {
  if (current !== "CONSUMED") return current;
  return releasesSession ? "RELEASED" : "CONSUMED";
}

// ── Espejo del trigger gym_class_bookings_counters ────────────────────

export interface BookingCounterState {
  scheduled_class_id: string;
  client_membership_id: string | null;
  booking_status: BookingStatus;
  consumption: GymSessionConsumption;
}

export interface BookingCounterDeltas {
  /** delta de scheduled_classes.booked_count por id de sesión */
  seats: Record<string, number>;
  /** delta de client_memberships.sessions_used por id de membresía */
  sessions: Record<string, number>;
}

function bump(map: Record<string, number>, key: string | null, delta: number) {
  if (!key || delta === 0) return;
  map[key] = (map[key] ?? 0) + delta;
  if (map[key] === 0) delete map[key];
}

/** before = null ⇒ INSERT; after = null ⇒ DELETE. */
export function bookingCounterDeltas(
  before: BookingCounterState | null,
  after: BookingCounterState | null
): BookingCounterDeltas {
  const deltas: BookingCounterDeltas = { seats: {}, sessions: {} };
  if (before) {
    if (before.booking_status === "confirmed") bump(deltas.seats, before.scheduled_class_id, -1);
    if (before.consumption === "CONSUMED") bump(deltas.sessions, before.client_membership_id, -1);
  }
  if (after) {
    if (after.booking_status === "confirmed") bump(deltas.seats, after.scheduled_class_id, +1);
    if (after.consumption === "CONSUMED") bump(deltas.sessions, after.client_membership_id, +1);
  }
  return deltas;
}
