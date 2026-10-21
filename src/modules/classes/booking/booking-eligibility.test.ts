import { describe, it, expect } from "vitest";
import {
  checkAttendanceAccess,
  checkAttendanceWindow,
  dateOnly,
  hhmmRangesOverlap,
  legacyOpenDateAllowed,
  localDate,
  membershipIneligibility,
  normalizeReason,
  resolveSessionInstants,
  selectMembership,
  staffCancelReasonRequired,
  zonedInstant,
  type EligibilityContext,
  type MembershipCandidate,
} from "./booking-eligibility";
import { resolveGymBookingPolicy } from "./booking-policy";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const policy = (o: Partial<Parameters<typeof resolveGymBookingPolicy>[0] & object> = {}) =>
  resolveGymBookingPolicy({
    timezone: "America/El_Salvador",
    personalized_booking_enabled: true,
    group_booking_enabled: true,
    personalized_default_capacity: 1,
    booking_horizon_days: 14,
    booking_min_lead_minutes: 0,
    cancel_min_lead_minutes: 120,
    late_cancel_consumes_session: true,
    apply_policy_to_open: false,
    attendance_edit_window_hours: 48,
    series_generation_weeks: 4,
    ...o,
  });

function m(over: Partial<MembershipCandidate> = {}): MembershipCandidate {
  return {
    id: "m1",
    status: "active",
    payment_status: "paid",
    start_date: D("2026-10-01"),
    end_date: D("2026-10-31"),
    modality: "GROUP",
    sessions_total: 4,
    sessions_used: 0,
    assigned_trainer_id: null,
    ...over,
  };
}

const ctx = (over: Partial<EligibilityContext> = {}): EligibilityContext => ({
  clientModality: "GROUP",
  sessionKind: "GROUP",
  sessionTrainerId: "t1",
  sessionDate: "2026-10-22",
  today: "2026-10-20",
  legacyDates: null,
  ...over,
});

describe("fechas e instantes", () => {
  it("dateOnly / localDate en la zona del gimnasio", () => {
    expect(dateOnly(D("2026-10-20"))).toBe("2026-10-20");
    // 2026-10-21 03:00Z = 2026-10-20 21:00 en El Salvador (UTC−6)
    expect(localDate(new Date("2026-10-21T03:00:00Z"), "America/El_Salvador")).toBe("2026-10-20");
    expect(localDate(new Date("2026-10-21T03:00:00Z"), "UTC")).toBe("2026-10-21");
  });

  it("zonedInstant: hora local → instante UTC (incluye zonas con DST)", () => {
    expect(zonedInstant("2026-10-20", "07:30", "America/El_Salvador")?.toISOString()).toBe("2026-10-20T13:30:00.000Z");
    expect(zonedInstant("2026-07-01", "09:00", "America/New_York")?.toISOString()).toBe("2026-07-01T13:00:00.000Z"); // EDT
    expect(zonedInstant("2026-12-01", "09:00", "America/New_York")?.toISOString()).toBe("2026-12-01T14:00:00.000Z"); // EST
    expect(zonedInstant("2026-10-20", "7:30", "UTC")).toBeNull();
    expect(zonedInstant("2026-10-20", "24:00", "UTC")).toBeNull();
  });

  it("resolveSessionInstants: la columna manda; si no, se deriva; sin timezone no hay instante", () => {
    const base = { class_date: D("2026-10-20"), start_time: "07:00", end_time: "08:00", starts_at: null, ends_at: null };
    expect(resolveSessionInstants(base, null)).toEqual({ startsAt: null, endsAt: null });
    const derived = resolveSessionInstants(base, "America/El_Salvador");
    expect(derived.startsAt?.toISOString()).toBe("2026-10-20T13:00:00.000Z");
    expect(derived.endsAt?.toISOString()).toBe("2026-10-20T14:00:00.000Z");
    const fixed = new Date("2026-10-20T10:00:00Z");
    expect(resolveSessionInstants({ ...base, starts_at: fixed }, "America/El_Salvador").startsAt).toBe(fixed);
    expect(resolveSessionInstants({ ...base, end_time: "06:00" }, "UTC").endsAt).toBeNull();
  });

  it("hhmmRangesOverlap: intervalos semiabiertos", () => {
    expect(hhmmRangesOverlap("18:00", "19:00", "18:30", "19:30")).toBe(true);
    expect(hhmmRangesOverlap("18:00", "19:00", "19:00", "20:00")).toBe(false);
    expect(hhmmRangesOverlap("18:00", "19:00", "17:00", "21:00")).toBe(true);
    expect(hhmmRangesOverlap("bad", "19:00", "17:00", "21:00")).toBe(false);
  });
});

describe("elegibilidad de membresías", () => {
  it("estado, pago, fechas, modalidad y entrenador", () => {
    expect(membershipIneligibility(m(), ctx())).toBeNull();
    expect(membershipIneligibility(m({ status: "suspended" }), ctx())).toBe("NOT_ACTIVE");
    expect(membershipIneligibility(m({ payment_status: "pending" }), ctx())).toBe("UNPAID");
    expect(membershipIneligibility(m({ payment_status: "partial" }), ctx())).toBeNull();
    expect(membershipIneligibility(m({ end_date: D("2026-10-21") }), ctx())).toBe("OUT_OF_DATES"); // no cubre la sesión
    expect(membershipIneligibility(m({ start_date: D("2026-10-23") }), ctx())).toBe("OUT_OF_DATES");
    expect(membershipIneligibility(m({ modality: "NORMAL" }), ctx())).toBe("MODALITY_MISMATCH");
    const pers = ctx({ clientModality: "PERSONALIZED", sessionKind: "PERSONALIZED" });
    expect(membershipIneligibility(m({ modality: "PERSONALIZED" }), pers)).toBe("TRAINER_NOT_AUTHORIZED");
    expect(membershipIneligibility(m({ modality: "PERSONALIZED", assigned_trainer_id: "t1" }), pers)).toBeNull();
  });

  it("fechas heredadas OPEN: STAFF solo exige end ≥ hoy; PORTAL start ≤ hoy ≤ end", () => {
    const open = (legacyDates: "STAFF" | "PORTAL") =>
      ctx({ clientModality: "NORMAL", sessionKind: "OPEN", legacyDates, sessionDate: "2026-12-01" });
    const future = m({ modality: "NORMAL", start_date: D("2026-10-25"), end_date: D("2026-11-05") });
    expect(membershipIneligibility(future, open("STAFF"))).toBeNull(); // cubre hoy por end ≥ hoy aunque la sesión sea posterior
    expect(membershipIneligibility(future, open("PORTAL"))).toBe("OUT_OF_DATES");
    expect(membershipIneligibility(m({ modality: "NORMAL", end_date: D("2026-10-19") }), open("STAFF"))).toBe("OUT_OF_DATES");
  });

  it("selectMembership: más específica primero, orden por vencimiento, saldo y reactivación sin saldo", () => {
    expect(selectMembership([m()], ctx({ clientModality: "NORMAL" }), { consumesNewSession: true, requiredMembershipId: null })).toEqual({
      ok: false,
      code: "MODALITY_MISMATCH",
    });
    expect(selectMembership([], ctx(), { consumesNewSession: true, requiredMembershipId: null })).toEqual({ ok: false, code: "NO_ELIGIBLE_MEMBERSHIP" });
    const pers = ctx({ clientModality: "PERSONALIZED", sessionKind: "PERSONALIZED" });
    expect(selectMembership([m({ modality: "PERSONALIZED" })], pers, { consumesNewSession: true, requiredMembershipId: null })).toEqual({
      ok: false,
      code: "TRAINER_NOT_AUTHORIZED",
    });
    const soon = m({ id: "b", end_date: D("2026-10-25") });
    const late = m({ id: "a", end_date: D("2026-10-30") });
    const r = selectMembership([late, soon], ctx(), { consumesNewSession: true, requiredMembershipId: null });
    expect(r.ok && r.membership.id).toBe("b");
    const exhausted = [m({ id: "x", sessions_total: 1, sessions_used: 1 })];
    expect(selectMembership(exhausted, ctx(), { consumesNewSession: true, requiredMembershipId: null })).toEqual({ ok: false, code: "MEMBERSHIP_EXHAUSTED" });
    const reactivate = selectMembership(exhausted, ctx(), { consumesNewSession: false, requiredMembershipId: "x" });
    expect(reactivate.ok && reactivate.membership.id).toBe("x");
    expect(selectMembership(exhausted, ctx(), { consumesNewSession: false, requiredMembershipId: "other" })).toEqual({
      ok: false,
      code: "NO_ELIGIBLE_MEMBERSHIP",
    });
    const unlimited = selectMembership([m({ sessions_total: null, sessions_used: 99 })], ctx(), { consumesNewSession: true, requiredMembershipId: null });
    expect(unlimited.ok).toBe(true);
  });
});

describe("ventanas", () => {
  it("legacyOpenDateAllowed: portal hasta el día de la clase; staff sin restricción", () => {
    expect(legacyOpenDateAllowed("PORTAL", "2026-10-20", "2026-10-20")).toBe(true);
    expect(legacyOpenDateAllowed("PORTAL", "2026-10-19", "2026-10-20")).toBe(false);
    expect(legacyOpenDateAllowed("STAFF", "2026-10-01", "2026-10-20")).toBe(true);
  });

  it("checkAttendanceWindow: OPEN heredado sin ventana; con política desde el inicio hasta fin + N horas", () => {
    const startsAt = new Date("2026-10-20T13:00:00Z");
    const endsAt = new Date("2026-10-20T14:00:00Z");
    const p = policy();
    const at = (iso: string, kind: "OPEN" | "GROUP" = "GROUP") =>
      checkAttendanceWindow({ kind, policy: p, now: new Date(iso), startsAt, endsAt });
    expect(at("2026-10-19T00:00:00Z", "OPEN")).toEqual({ ok: true });
    expect(at("2026-10-20T12:59:00Z")).toEqual({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
    expect(at("2026-10-22T14:00:00Z")).toEqual({ ok: true });
    expect(at("2026-10-22T14:00:01Z")).toEqual({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
    expect(checkAttendanceWindow({ kind: "GROUP", policy: p, now: new Date(), startsAt: null, endsAt: null })).toEqual({
      ok: false,
      code: "SCHEDULE_INCOMPLETE",
    });
  });

  it("checkAttendanceAccess (R32): ventana o cierre para entrenador/recepción; SA/BA corrigen después", () => {
    const startsAt = new Date("2026-10-20T13:00:00Z");
    const endsAt = new Date("2026-10-20T14:00:00Z");
    const p = policy();
    const access = (role: string, iso: string, o: { status?: "scheduled" | "completed"; kind?: "OPEN" | "GROUP"; channel?: "STAFF" | "TRAINER" } = {}) =>
      checkAttendanceAccess({
        kind: o.kind ?? "GROUP",
        policy: p,
        now: new Date(iso),
        startsAt,
        endsAt,
        sessionStatus: o.status ?? "scheduled",
        channel: o.channel ?? (role === "trainer" ? "TRAINER" : "STAFF"),
        role,
      });
    const open = { ok: true, administrativeCorrection: false };
    const correction = { ok: true, administrativeCorrection: true };
    const closed = { ok: false, code: "ATTENDANCE_WINDOW_CLOSED" };
    for (const role of ["trainer", "reception", "branch_admin", "super_admin"]) {
      expect(access(role, "2026-10-20T13:30:00Z"), role).toEqual(open);
      expect(access(role, "2026-10-20T12:00:00Z"), role).toEqual({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
    }
    expect(access("trainer", "2026-10-22T14:00:01Z")).toEqual(closed);
    expect(access("reception", "2026-10-22T14:00:01Z")).toEqual(closed);
    expect(access("branch_admin", "2026-10-22T14:00:01Z")).toEqual(correction);
    expect(access("super_admin", "2026-10-22T14:00:01Z")).toEqual(correction);
    expect(access("trainer", "2026-10-20T15:00:00Z", { status: "completed" })).toEqual(closed);
    expect(access("reception", "2026-10-20T15:00:00Z", { status: "completed" })).toEqual(closed);
    expect(access("branch_admin", "2026-10-20T15:00:00Z", { status: "completed" })).toEqual(correction);
    // SA con canal TRAINER no obtiene el privilegio administrativo.
    expect(access("super_admin", "2026-10-22T14:00:01Z", { channel: "TRAINER" })).toEqual(closed);
    // Excepción heredada: staff en OPEN sin política; el canal TRAINER no la tiene.
    expect(access("reception", "2026-10-25T00:00:00Z", { kind: "OPEN", status: "completed" })).toEqual(open);
    expect(access("trainer", "2026-10-25T00:00:00Z", { kind: "OPEN" })).toEqual(closed);
  });

  it("staffCancelReasonRequired (R29) y normalizeReason", () => {
    const p = policy();
    expect(staffCancelReasonRequired("OPEN", p, "NOT_APPLICABLE")).toBe(false);
    expect(staffCancelReasonRequired("OPEN", policy({ apply_policy_to_open: true }), "NOT_APPLICABLE")).toBe(true);
    expect(staffCancelReasonRequired("GROUP", p, "CONSUMED")).toBe(true);
    expect(normalizeReason("   ")).toBeNull();
    expect(normalizeReason("  ok ")).toBe("ok");
    expect(normalizeReason("x".repeat(600))?.length).toBe(500);
  });
});
