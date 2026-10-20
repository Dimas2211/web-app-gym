// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2A — booking-rules.test.ts
// Matriz de compatibilidad, consumo, ventanas, cancelación y los
// invariantes de contadores (I1/I2) sobre el espejo del trigger.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { GymClientModality, GymSessionKind } from "@prisma/client";
import { GYM_BOOKING_POLICY_DEFAULTS, resolveGymBookingPolicy } from "./booking-policy";
import {
  bookingCounterDeltas,
  checkBookingWindow,
  consumptionAfterCancel,
  consumptionOnBook,
  decideCancellation,
  isModalityCompatible,
  resolveEffectiveCapacity,
  SESSION_KIND_FOR_MODALITY,
  type BookingCounterState,
} from "./booking-rules";

const MODALITIES: GymClientModality[] = ["NORMAL", "PERSONALIZED", "GROUP"];
const KINDS: GymSessionKind[] = ["OPEN", "PERSONALIZED", "GROUP"];
const policy = resolveGymBookingPolicy(null);
const at = (iso: string) => new Date(iso);
const START = at("2030-01-10T13:00:00Z");
const minutesBefore = (m: number) => new Date(START.getTime() - m * 60_000);

describe("isModalityCompatible (R2, R6, R7)", () => {
  it("solo habilita la combinación exacta cliente = membresía = tipo de sesión", () => {
    for (const client of MODALITIES) {
      for (const membership of MODALITIES) {
        for (const kind of KINDS) {
          const expected = client === membership && SESSION_KIND_FOR_MODALITY[client] === kind;
          expect(isModalityCompatible(client, membership, kind), `${client}/${membership}/${kind}`).toBe(expected);
        }
      }
    }
  });

  it("NORMAL solo reserva OPEN; GROUP y PERSONALIZED no reservan OPEN (Q1)", () => {
    expect(isModalityCompatible("NORMAL", "NORMAL", "OPEN")).toBe(true);
    expect(isModalityCompatible("GROUP", "GROUP", "OPEN")).toBe(false);
    expect(isModalityCompatible("PERSONALIZED", "PERSONALIZED", "OPEN")).toBe(false);
  });

  it("la modalidad del cliente sin membresía compatible nunca habilita", () => {
    expect(isModalityCompatible("PERSONALIZED", "NORMAL", "PERSONALIZED")).toBe(false);
    expect(isModalityCompatible("GROUP", "PERSONALIZED", "GROUP")).toBe(false);
  });
});

describe("consumptionOnBook (R12, R24)", () => {
  it("OPEN nunca consume (comportamiento heredado)", () => {
    expect(consumptionOnBook("OPEN", null)).toEqual({ consumption: "NOT_APPLICABLE", consumesNewSession: false });
    expect(consumptionOnBook("OPEN", "NOT_APPLICABLE")).toEqual({ consumption: "NOT_APPLICABLE", consumesNewSession: false });
  });

  it("reserva nueva o reactivación desde RELEASED consume una sesión", () => {
    expect(consumptionOnBook("PERSONALIZED", null)).toEqual({ consumption: "CONSUMED", consumesNewSession: true });
    expect(consumptionOnBook("GROUP", "RELEASED")).toEqual({ consumption: "CONSUMED", consumesNewSession: true });
  });

  it("reactivar una cancelación tardía ya consumida no consume dos veces", () => {
    expect(consumptionOnBook("GROUP", "CONSUMED")).toEqual({ consumption: "CONSUMED", consumesNewSession: false });
  });
});

describe("resolveEffectiveCapacity (R19)", () => {
  it("prioridad sesión > serie > entrenador > gimnasio para PERSONALIZED", () => {
    const base = { kind: "PERSONALIZED" as const, policy };
    expect(resolveEffectiveCapacity({ ...base, explicitCapacity: 5, seriesCapacity: 4, trainerPersonalizedCapacity: 3 })).toBe(5);
    expect(resolveEffectiveCapacity({ ...base, seriesCapacity: 4, trainerPersonalizedCapacity: 3 })).toBe(4);
    expect(resolveEffectiveCapacity({ ...base, trainerPersonalizedCapacity: 3 })).toBe(3);
    expect(resolveEffectiveCapacity(base)).toBe(GYM_BOOKING_POLICY_DEFAULTS.personalized_default_capacity);
  });

  it("GROUP/OPEN usan el default del tipo de clase y no el cupo personalizado", () => {
    expect(resolveEffectiveCapacity({ kind: "GROUP", policy, classTypeCapacityDefault: 20, trainerPersonalizedCapacity: 2 })).toBe(20);
    expect(resolveEffectiveCapacity({ kind: "OPEN", policy })).toBeNull();
  });
});

describe("checkBookingWindow (R22, R25)", () => {
  it("OPEN conserva la validación heredada: la política no lo restringe", () => {
    expect(checkBookingWindow({ kind: "OPEN", policy, now: at("2029-01-01T00:00:00Z"), startsAt: null, actor: "CLIENT" })).toEqual({ ok: true });
  });

  it("PERSONALIZED/GROUP sin starts_at fallan cerrados", () => {
    expect(checkBookingWindow({ kind: "GROUP", policy, now: minutesBefore(600), startsAt: null, actor: "CLIENT" })).toEqual({ ok: false, code: "SCHEDULE_INCOMPLETE" });
  });

  it("horizonte de 14 días inclusive", () => {
    const fourteenDays = 14 * 24 * 60;
    expect(checkBookingWindow({ kind: "GROUP", policy, now: minutesBefore(fourteenDays), startsAt: START, actor: "CLIENT" })).toEqual({ ok: true });
    expect(checkBookingWindow({ kind: "GROUP", policy, now: minutesBefore(fourteenDays + 1), startsAt: START, actor: "CLIENT" })).toEqual({ ok: false, code: "OUTSIDE_BOOKING_HORIZON" });
  });

  it("no se reserva una sesión iniciada", () => {
    expect(checkBookingWindow({ kind: "PERSONALIZED", policy, now: START, startsAt: START, actor: "STAFF" })).toEqual({ ok: false, code: "SESSION_STARTED" });
  });

  it("anticipación mínima aplica al alumno, no al staff", () => {
    const p = resolveGymBookingPolicy({ ...GYM_BOOKING_POLICY_DEFAULTS, booking_min_lead_minutes: 60 });
    expect(checkBookingWindow({ kind: "GROUP", policy: p, now: minutesBefore(30), startsAt: START, actor: "CLIENT" })).toEqual({ ok: false, code: "BELOW_MIN_LEAD" });
    expect(checkBookingWindow({ kind: "GROUP", policy: p, now: minutesBefore(30), startsAt: START, actor: "STAFF" })).toEqual({ ok: true });
  });
});

describe("decideCancellation (R26–R29)", () => {
  it("dentro de política (≥120 min antes) libera la sesión", () => {
    expect(decideCancellation({ kind: "GROUP", policy, now: minutesBefore(120), startsAt: START, actor: "CLIENT" })).toEqual({ ok: true, cancellationType: "CLIENT_IN_POLICY", releasesSession: true });
  });

  it("tardía (<120 min) consume la sesión con el default", () => {
    expect(decideCancellation({ kind: "PERSONALIZED", policy, now: minutesBefore(119), startsAt: START, actor: "CLIENT" })).toEqual({ ok: true, cancellationType: "CLIENT_LATE", releasesSession: false });
  });

  it("tardía libera si el gimnasio desactiva late_cancel_consumes_session", () => {
    const p = resolveGymBookingPolicy({ ...GYM_BOOKING_POLICY_DEFAULTS, late_cancel_consumes_session: false });
    expect(decideCancellation({ kind: "GROUP", policy: p, now: minutesBefore(10), startsAt: START, actor: "CLIENT" })).toEqual({ ok: true, cancellationType: "CLIENT_LATE", releasesSession: true });
  });

  it("el alumno no cancela después del inicio", () => {
    expect(decideCancellation({ kind: "GROUP", policy, now: START, startsAt: START, actor: "CLIENT" })).toEqual({ ok: false, code: "CANCEL_WINDOW_CLOSED" });
  });

  it("staff y cancelación de sesión liberan siempre", () => {
    expect(decideCancellation({ kind: "GROUP", policy, now: START, startsAt: START, actor: "STAFF" })).toEqual({ ok: true, cancellationType: "STAFF", releasesSession: true });
    expect(decideCancellation({ kind: "PERSONALIZED", policy, now: START, startsAt: null, actor: "SESSION_CANCELLED" })).toEqual({ ok: true, cancellationType: "SESSION_CANCELLED", releasesSession: true });
  });

  it("OPEN del alumno no adopta la ventana nueva (regla heredada intacta)", () => {
    expect(decideCancellation({ kind: "OPEN", policy, now: minutesBefore(5), startsAt: START, actor: "CLIENT" })).toEqual({ ok: true, cancellationType: "CLIENT_IN_POLICY", releasesSession: true });
  });

  it("consumptionAfterCancel", () => {
    expect(consumptionAfterCancel("CONSUMED", true)).toBe("RELEASED");
    expect(consumptionAfterCancel("CONSUMED", false)).toBe("CONSUMED");
    expect(consumptionAfterCancel("NOT_APPLICABLE", true)).toBe("NOT_APPLICABLE");
  });
});

// ── Invariantes I1 / I2 sobre el espejo del trigger ───────────────────

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe("bookingCounterDeltas — invariantes de contadores", () => {
  const b = (o: Partial<BookingCounterState> = {}): BookingCounterState => ({
    scheduled_class_id: "s1",
    client_membership_id: "m1",
    booking_status: "confirmed",
    consumption: "CONSUMED",
    ...o,
  });

  it("insert / cancel en política / cancel tardía / reactivación / delete", () => {
    expect(bookingCounterDeltas(null, b())).toEqual({ seats: { s1: 1 }, sessions: { m1: 1 } });
    expect(bookingCounterDeltas(b(), b({ booking_status: "cancelled", consumption: "RELEASED" }))).toEqual({ seats: { s1: -1 }, sessions: { m1: -1 } });
    expect(bookingCounterDeltas(b(), b({ booking_status: "cancelled" }))).toEqual({ seats: { s1: -1 }, sessions: {} });
    expect(bookingCounterDeltas(b({ booking_status: "cancelled" }), b())).toEqual({ seats: { s1: 1 }, sessions: {} });
    expect(bookingCounterDeltas(b(), null)).toEqual({ seats: { s1: -1 }, sessions: { m1: -1 } });
  });

  it("reserva heredada OPEN mueve cupo y nunca sesiones", () => {
    const legacy = b({ client_membership_id: null, consumption: "NOT_APPLICABLE" });
    expect(bookingCounterDeltas(null, legacy)).toEqual({ seats: { s1: 1 }, sessions: {} });
    expect(bookingCounterDeltas(legacy, { ...legacy, booking_status: "cancelled" })).toEqual({ seats: { s1: -1 }, sessions: {} });
  });

  it("actualización sin cambios es idempotente (deltas vacíos)", () => {
    expect(bookingCounterDeltas(b(), b())).toEqual({ seats: {}, sessions: {} });
  });

  it("waitlisted no ocupa cupo", () => {
    expect(bookingCounterDeltas(null, b({ booking_status: "waitlisted", consumption: "NOT_APPLICABLE", client_membership_id: null }))).toEqual({ seats: {}, sessions: {} });
  });

  it("propiedad: tras 5000 operaciones aleatorias, contadores = recuento real y nunca negativos", () => {
    const rand = lcg(20261019);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
    const sessions = ["s1", "s2", "s3"];
    const memberships = [null, "m1", "m2"];
    const statuses = ["confirmed", "cancelled", "waitlisted"] as const;
    const consumptions = ["NOT_APPLICABLE", "CONSUMED", "RELEASED"] as const;

    const rows = new Map<string, BookingCounterState>();
    const seats: Record<string, number> = {};
    const used: Record<string, number> = {};
    const apply = (d: ReturnType<typeof bookingCounterDeltas>) => {
      for (const [k, v] of Object.entries(d.seats)) seats[k] = (seats[k] ?? 0) + v;
      for (const [k, v] of Object.entries(d.sessions)) used[k] = (used[k] ?? 0) + v;
    };

    for (let i = 0; i < 5000; i++) {
      const id = `b${Math.floor(rand() * 40)}`;
      const before = rows.get(id) ?? null;
      const op = rand();
      let after: BookingCounterState | null;
      if (op < 0.1) {
        after = null;
      } else {
        const membership = pick(memberships);
        // CHECK class_bookings_consumption_membership_chk
        const consumption = membership ? pick(consumptions) : "NOT_APPLICABLE";
        after = {
          scheduled_class_id: before && rand() < 0.8 ? before.scheduled_class_id : pick(sessions),
          client_membership_id: membership,
          booking_status: pick(statuses),
          consumption,
        };
      }
      apply(bookingCounterDeltas(before, after));
      if (after) rows.set(id, after);
      else rows.delete(id);

      for (const s of sessions) {
        const real = [...rows.values()].filter((r) => r.scheduled_class_id === s && r.booking_status === "confirmed").length;
        expect(seats[s] ?? 0).toBe(real);
        expect(seats[s] ?? 0).toBeGreaterThanOrEqual(0);
      }
      for (const m of ["m1", "m2"]) {
        const real = [...rows.values()].filter((r) => r.client_membership_id === m && r.consumption === "CONSUMED").length;
        expect(used[m] ?? 0).toBe(real);
        expect(used[m] ?? 0).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
