// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3B — evaluatePortalSession y fechas del calendario.
// Reglas puras: mismo orden y mismas piezas que bookSession/cancelBooking.
// ─────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { resolveGymBookingPolicy, GYM_BOOKING_POLICY_DEFAULTS } from "@/modules/classes/booking/booking-policy";
import { zonedInstant, type MembershipCandidate } from "@/modules/classes/booking/booking-eligibility";
import {
  addCalendarDays,
  evaluatePortalSession,
  formatCalendarDate,
  isCalendarDate,
  PORTAL_WEEK_NAV_LIMIT,
  resolvePortalWeek,
  sessionLocalTimes,
  weekStart,
  type PortalClientInput,
  type PortalOwnBooking,
  type PortalSessionInput,
} from "./portal-schedule";
import { authorizedPersonalizedTrainerIds } from "./queries";

const TZ = "America/El_Salvador";
// 2026-10-20 10:00 local (16:00Z)
const NOW = new Date("2026-10-20T16:00:00.000Z");
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

const LEGACY = resolveGymBookingPolicy(null);
const ON = resolveGymBookingPolicy({
  ...GYM_BOOKING_POLICY_DEFAULTS,
  timezone: TZ,
  personalized_booking_enabled: true,
  group_booking_enabled: true,
});

function session(over: Partial<PortalSessionInput> = {}): PortalSessionInput {
  const date = over.class_date ? over.class_date.toISOString().slice(0, 10) : "2026-10-22";
  const start = over.start_time ?? "07:00";
  const end = over.end_time ?? "08:00";
  const kind = over.session_kind ?? "OPEN";
  return {
    id: "s1",
    branch_id: "b1",
    trainer_id: "tA",
    session_kind: kind,
    status: "scheduled",
    class_date: D(date),
    start_time: start,
    end_time: end,
    starts_at: kind === "OPEN" ? null : zonedInstant(date, start, TZ),
    ends_at: kind === "OPEN" ? null : zonedInstant(date, end, TZ),
    capacity: 8,
    booked_count: 3,
    ...over,
  };
}

const CLIENT: PortalClientInput = { id: "c1", branch_id: "b1", modality: "NORMAL", status: "active" };

function membership(over: Partial<MembershipCandidate> = {}): MembershipCandidate {
  return {
    id: "m1",
    status: "active",
    payment_status: "paid",
    start_date: D("2026-10-01"),
    end_date: D("2026-10-31"),
    modality: "NORMAL",
    sessions_total: null,
    sessions_used: 0,
    assigned_trainer_id: null,
    ...over,
  };
}

function evaluate(opts: {
  session?: PortalSessionInput;
  client?: Partial<PortalClientInput>;
  policy?: typeof ON;
  memberships?: MembershipCandidate[];
  own?: PortalOwnBooking | null;
  slots?: { sessionId: string; date: string; start: string; end: string }[];
  now?: Date;
}) {
  return evaluatePortalSession({
    session: opts.session ?? session(),
    client: { ...CLIENT, ...opts.client },
    policy: opts.policy ?? LEGACY,
    now: opts.now ?? NOW,
    memberships: opts.memberships ?? [membership()],
    ownBooking: opts.own ?? null,
    ownSlots: opts.slots ?? [],
  });
}

const confirmed = (over: Partial<PortalOwnBooking> = {}): PortalOwnBooking => ({
  id: "bk1",
  booking_status: "confirmed",
  consumption: "NOT_APPLICABLE",
  client_membership_id: null,
  cancellation_type: null,
  ...over,
});

describe("evaluatePortalSession — NORMAL / OPEN heredado", () => {
  it("disponible con cupo y membresía vigente", () => {
    const r = evaluate({});
    expect(r).toMatchObject({ state: "AVAILABLE", canBook: true, isReactivation: false, block: null });
  });

  it("completo: no reservable por capacidad", () => {
    const r = evaluate({ session: session({ booked_count: 8 }) });
    expect(r.state).toBe("FULL");
    expect(r.canBook).toBe(false);
    expect(r.block).toMatchObject({ kind: "capacity", code: "SESSION_FULL" });
  });

  it("sin membresía → NO ELEGIBLE por membresía (mensaje heredado)", () => {
    const r = evaluate({ memberships: [] });
    expect(r).toMatchObject({ state: "NOT_ELIGIBLE", canBook: false });
    expect(r.block).toMatchObject({ kind: "membership", code: "NO_ELIGIBLE_MEMBERSHIP" });
    expect(r.block!.message).toBe("No tienes una membresía activa vigente para reservar clases.");
  });

  it.each([
    ["vencida", membership({ end_date: D("2026-10-19") })],
    ["suspendida", membership({ status: "suspended" })],
    ["pago pendiente", membership({ payment_status: "pending" })],
    ["empieza después de hoy (regla PORTAL heredada)", membership({ start_date: D("2026-10-21") })],
  ])("membresía %s → NO ELEGIBLE", (_label, m) => {
    expect(evaluate({ memberships: [m] }).block?.code).toBe("NO_ELIGIBLE_MEMBERSHIP");
  });

  it("apply_policy_to_open = false: sin horizonte ni anticipación (no se agregan restricciones)", () => {
    const far = session({ class_date: D("2027-03-01") });
    expect(evaluate({ session: far }).state).toBe("AVAILABLE");
    // Clase de hoy ya iniciada: la regla heredada permite el día de la clase.
    const todayEarly = session({ class_date: D("2026-10-20"), start_time: "06:00", end_time: "07:00" });
    expect(evaluate({ session: todayEarly, policy: { ...LEGACY, timezone: TZ } }).state).toBe("AVAILABLE");
  });

  it("día anterior → FINALIZADO sin acciones; sesión cancelada → CANCELADO; cerrada → FINALIZADO", () => {
    expect(evaluate({ session: session({ class_date: D("2026-10-19") }) })).toMatchObject({ state: "FINISHED", canBook: false });
    expect(evaluate({ session: session({ status: "cancelled" }) })).toMatchObject({ state: "CANCELLED", canBook: false });
    expect(evaluate({ session: session({ status: "completed" }) })).toMatchObject({ state: "FINISHED", canBook: false });
  });

  it("reserva propia confirmada → RESERVADO con cancelación (OPEN sin política)", () => {
    const r = evaluate({ own: confirmed() });
    expect(r).toMatchObject({ state: "BOOKED", canBook: false, canCancel: true, cancelWarning: null });
  });

  it("reserva propia cancelada → reservar de nuevo (reactivación de bookSession)", () => {
    const r = evaluate({ own: confirmed({ booking_status: "cancelled", cancellation_type: "CLIENT_IN_POLICY" }) });
    expect(r).toMatchObject({ state: "AVAILABLE", canBook: true, isReactivation: true });
  });

  it("otra sede → NO ELEGIBLE; cliente inactivo → NO ELEGIBLE; sesión en curso → NO ELEGIBLE", () => {
    expect(evaluate({ session: session({ branch_id: "b2" }) }).block?.code).toBe("CROSS_LOCATION");
    expect(evaluate({ client: { status: "inactive" } }).block?.code).toBe("CLIENT_INACTIVE");
    expect(evaluate({ session: session({ status: "in_progress" }) }).block?.code).toBe("SESSION_NOT_BOOKABLE");
  });

  it("cliente NORMAL ante una sesión PERSONALIZED (id manipulado) → NO ELEGIBLE por modalidad", () => {
    const r = evaluate({ session: session({ session_kind: "PERSONALIZED" }), policy: ON });
    expect(r.block?.code).toBe("MODALITY_MISMATCH");
    expect(r.canBook).toBe(false);
  });
});

describe("evaluatePortalSession — PERSONALIZED", () => {
  const P_CLIENT = { modality: "PERSONALIZED" as const };
  const pMem = (over: Partial<MembershipCandidate> = {}) =>
    membership({ modality: "PERSONALIZED", sessions_total: 4, sessions_used: 1, assigned_trainer_id: "tA", ...over });
  const pSession = (over: Partial<PortalSessionInput> = {}) => session({ session_kind: "PERSONALIZED", capacity: 1, booked_count: 0, ...over });

  it("entrenador autorizado y saldo → DISPONIBLE", () => {
    expect(evaluate({ session: pSession(), client: P_CLIENT, policy: ON, memberships: [pMem()] }).state).toBe("AVAILABLE");
  });

  it("otro entrenador → TRAINER_NOT_AUTHORIZED; sin entrenador asignado → TRAINER_NOT_AUTHORIZED", () => {
    expect(evaluate({ session: pSession({ trainer_id: "tB" }), client: P_CLIENT, policy: ON, memberships: [pMem()] }).block?.code).toBe(
      "TRAINER_NOT_AUTHORIZED"
    );
    expect(evaluate({ session: pSession(), client: P_CLIENT, policy: ON, memberships: [pMem({ assigned_trainer_id: null })] }).block?.code).toBe(
      "TRAINER_NOT_AUTHORIZED"
    );
  });

  it("sesiones agotadas → MEMBERSHIP_EXHAUSTED; última sesión disponible → DISPONIBLE", () => {
    expect(evaluate({ session: pSession(), client: P_CLIENT, policy: ON, memberships: [pMem({ sessions_used: 4 })] }).block?.code).toBe(
      "MEMBERSHIP_EXHAUSTED"
    );
    expect(evaluate({ session: pSession(), client: P_CLIENT, policy: ON, memberships: [pMem({ sessions_used: 3 })] }).state).toBe("AVAILABLE");
  });

  it("modalidad deshabilitada → NO ELEGIBLE por política; sin timezone → TIMEZONE_NOT_CONFIGURED", () => {
    expect(
      evaluate({ session: pSession(), client: P_CLIENT, policy: { ...ON, personalizedBookingEnabled: false }, memberships: [pMem()] }).block
    ).toMatchObject({ kind: "policy", code: "MODALITY_DISABLED" });
    expect(evaluate({ session: pSession(), client: P_CLIENT, policy: { ...ON, timezone: null }, memberships: [pMem()] }).block?.code).toBe(
      "TIMEZONE_NOT_CONFIGURED"
    );
  });

  it("ventanas de política: fuera de horizonte, anticipación mínima, ya comenzó, terminó", () => {
    const m = [pMem()];
    expect(evaluate({ session: pSession({ class_date: D("2026-11-20") }), client: P_CLIENT, policy: ON, memberships: [pMem({ end_date: D("2026-12-31") })] }).block?.code).toBe(
      "OUTSIDE_BOOKING_HORIZON"
    );
    const soon = pSession({ class_date: D("2026-10-20"), start_time: "10:30", end_time: "11:30" });
    expect(evaluate({ session: soon, client: P_CLIENT, policy: { ...ON, bookingMinLeadMinutes: 60 }, memberships: m }).block?.code).toBe("BELOW_MIN_LEAD");
    const running = pSession({ class_date: D("2026-10-20"), start_time: "09:30", end_time: "10:30" });
    expect(evaluate({ session: running, client: P_CLIENT, policy: ON, memberships: m }).block?.code).toBe("SESSION_STARTED");
    const over = pSession({ class_date: D("2026-10-20"), start_time: "08:00", end_time: "09:00" });
    expect(evaluate({ session: over, client: P_CLIENT, policy: ON, memberships: m }).state).toBe("FINISHED");
  });

  it("solapamiento con otra reserva propia → CLIENT_SCHEDULE_CONFLICT", () => {
    const r = evaluate({
      session: pSession(),
      client: P_CLIENT,
      policy: ON,
      memberships: [pMem()],
      slots: [{ sessionId: "other", date: "2026-10-22", start: "07:30", end: "08:30" }],
    });
    expect(r.block?.code).toBe("CLIENT_SCHEDULE_CONFLICT");
  });

  it("cancelación: en política libera; tardía avisa que se descuenta; ya comenzó → no cancelable", () => {
    const own = confirmed({ consumption: "CONSUMED", client_membership_id: "m1" });
    expect(evaluate({ session: pSession({ booked_count: 1 }), client: P_CLIENT, policy: ON, memberships: [pMem()], own })).toMatchObject({
      state: "BOOKED",
      canCancel: true,
      cancelWarning: null,
    });
    const late = pSession({ class_date: D("2026-10-20"), start_time: "11:00", end_time: "12:00", booked_count: 1 });
    const lateEval = evaluate({ session: late, client: P_CLIENT, policy: ON, memberships: [pMem()], own });
    expect(lateEval.canCancel).toBe(true);
    expect(lateEval.cancelWarning).toMatch(/tardía/);
    const noConsume = evaluate({ session: late, client: P_CLIENT, policy: { ...ON, lateCancelConsumesSession: false }, memberships: [pMem()], own });
    expect(noConsume.cancelWarning).toBeNull();
    const running = pSession({ class_date: D("2026-10-20"), start_time: "09:30", end_time: "10:30", booked_count: 1 });
    const r = evaluate({ session: running, client: P_CLIENT, policy: ON, memberships: [pMem()], own });
    expect(r).toMatchObject({ state: "BOOKED", canCancel: false });
    expect(r.block?.code).toBe("CANCEL_WINDOW_CLOSED");
  });

  it("reactivación de una reserva todavía CONSUMED (tardía) exige la misma membresía, sin saldo nuevo", () => {
    const own = confirmed({ booking_status: "cancelled", consumption: "CONSUMED", client_membership_id: "m1", cancellation_type: "CLIENT_LATE" });
    const r = evaluate({ session: pSession(), client: P_CLIENT, policy: ON, memberships: [pMem({ sessions_used: 4 })], own });
    expect(r).toMatchObject({ state: "AVAILABLE", isReactivation: true });
  });
});

describe("evaluatePortalSession — GROUP", () => {
  const G = { modality: "GROUP" as const };
  const gMem = membership({ modality: "GROUP", sessions_total: 8, sessions_used: 0 });
  const gSession = session({ session_kind: "GROUP", capacity: 8, booked_count: 7 });

  it("GROUP con snapshot GROUP → DISPONIBLE; snapshot NORMAL → MODALITY_MISMATCH", () => {
    expect(evaluate({ session: gSession, client: G, policy: ON, memberships: [gMem] }).state).toBe("AVAILABLE");
    expect(evaluate({ session: gSession, client: G, policy: ON, memberships: [membership()] }).block?.code).toBe("MODALITY_MISMATCH");
  });

  it("cliente GROUP con id de sesión OPEN → MODALITY_MISMATCH", () => {
    expect(evaluate({ session: session(), client: G, policy: ON, memberships: [gMem] }).block?.code).toBe("MODALITY_MISMATCH");
  });

  it("8/8 → COMPLETO", () => {
    expect(evaluate({ session: { ...gSession, booked_count: 8 }, client: G, policy: ON, memberships: [gMem] }).state).toBe("FULL");
  });
});

describe("authorizedPersonalizedTrainerIds", () => {
  it("solo membresías PERSONALIZED activas, no vencidas y con entrenador (nunca Client.assigned_trainer_id)", () => {
    const ids = authorizedPersonalizedTrainerIds(
      [
        membership({ id: "a", modality: "PERSONALIZED", assigned_trainer_id: "tA" }),
        membership({ id: "b", modality: "PERSONALIZED", assigned_trainer_id: "tB", end_date: D("2026-10-19") }),
        membership({ id: "c", modality: "PERSONALIZED", assigned_trainer_id: "tC", status: "suspended" }),
        membership({ id: "d", modality: "GROUP", assigned_trainer_id: "tD" }),
        membership({ id: "e", modality: "PERSONALIZED", assigned_trainer_id: null }),
      ],
      "2026-10-20"
    );
    expect(ids).toEqual(["tA"]);
  });
});

describe("fechas del calendario", () => {
  it("semana lunes–domingo, navegación acotada y fecha inválida → semana de hoy", () => {
    expect(weekStart("2026-10-20")).toBe("2026-10-19"); // martes → lunes
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // domingo → lunes anterior
    expect(resolvePortalWeek(null, "2026-10-20")).toMatchObject({ start: "2026-10-19", end: "2026-10-25" });
    expect(resolvePortalWeek("2026-10-29", "2026-10-20").start).toBe("2026-10-26");
    expect(resolvePortalWeek("2026-02-30", "2026-10-20").start).toBe("2026-10-19");
    expect(resolvePortalWeek("'; DROP", "2026-10-20").start).toBe("2026-10-19");
    expect(resolvePortalWeek("2099-01-01", "2026-10-20").start).toBe(addCalendarDays("2026-10-19", 7 * PORTAL_WEEK_NAV_LIMIT));
    expect(isCalendarDate("2026-13-01")).toBe(false);
  });

  it("aritmética de calendario sin DST: 2026-11-01 (fin de DST en Nueva York) + 1 = 2026-11-02", () => {
    expect(addCalendarDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addCalendarDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("America/El_Salvador: una sesión de 07:00 se muestra a las 07:00 (no 13:00 UTC)", () => {
    const s = session({ session_kind: "GROUP" });
    expect(s.starts_at!.toISOString()).toBe("2026-10-22T13:00:00.000Z");
    expect(sessionLocalTimes(s, TZ)).toEqual({ date: "2026-10-22", start: "07:00", end: "08:00" });
  });

  it("America/New_York: 07:00 antes y después del cambio de horario (2026-11-01)", () => {
    const NY = "America/New_York";
    const before = { class_date: D("2026-10-30"), start_time: "07:00", end_time: "08:00", starts_at: zonedInstant("2026-10-30", "07:00", NY), ends_at: zonedInstant("2026-10-30", "08:00", NY) };
    const after = { class_date: D("2026-11-03"), start_time: "07:00", end_time: "08:00", starts_at: zonedInstant("2026-11-03", "07:00", NY), ends_at: zonedInstant("2026-11-03", "08:00", NY) };
    expect(before.starts_at!.toISOString()).toBe("2026-10-30T11:00:00.000Z"); // EDT −4
    expect(after.starts_at!.toISOString()).toBe("2026-11-03T12:00:00.000Z"); // EST −5
    expect(sessionLocalTimes(before, NY)).toEqual({ date: "2026-10-30", start: "07:00", end: "08:00" });
    expect(sessionLocalTimes(after, NY)).toEqual({ date: "2026-11-03", start: "07:00", end: "08:00" });
  });

  it("sesión nocturna local cuyo instante UTC cae al día siguiente conserva el día del gimnasio", () => {
    const late = { class_date: D("2026-10-22"), start_time: "20:00", end_time: "21:00", starts_at: zonedInstant("2026-10-22", "20:00", TZ), ends_at: zonedInstant("2026-10-22", "21:00", TZ) };
    expect(late.starts_at!.toISOString().slice(0, 10)).toBe("2026-10-23");
    expect(sessionLocalTimes(late, TZ).date).toBe("2026-10-22");
  });

  it("OPEN sin instantes usa las columnas heredadas; etiqueta de fecha sin desplazamiento por zona del servidor", () => {
    expect(sessionLocalTimes(session(), null)).toEqual({ date: "2026-10-22", start: "07:00", end: "08:00" });
    expect(formatCalendarDate("2026-10-22", { day: "2-digit", month: "2-digit", year: "numeric" })).toBe("22/10/2026");
  });
});
