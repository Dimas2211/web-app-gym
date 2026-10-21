// GYM-BOOKINGS 3A — reglas puras de programación (series, ausencias, tipo de sesión).
import { describe, expect, it } from "vitest";
import { resolveGymBookingPolicy } from "../booking/booking-policy";
import {
  addDaysIso,
  dbDate,
  isIsoDate,
  planSeriesDates,
  resolveSessionSetup,
  timeOffCoversSlot,
  timeOffWindowsOverlap,
  weekdayOf,
} from "./scheduling-rules";

const DEFAULTS = resolveGymBookingPolicy(null);
const ON = (tz: string | null = "America/El_Salvador") =>
  resolveGymBookingPolicy({
    ...{
      timezone: tz,
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
    },
  });

describe("fechas", () => {
  it("isIsoDate valida el calendario real", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
  });
  it("weekdayOf / addDaysIso en UTC (sin DST)", () => {
    expect(weekdayOf("2026-10-19")).toBe(1); // lunes
    expect(addDaysIso("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("planSeriesDates — ventana finita", () => {
  it("genera solo el día de la semana, desde hoy, hasta weeks·7−1", () => {
    const r = planSeriesDates({ weekday: 1, validFrom: "2026-01-01", validUntil: null, today: "2026-10-20", weeks: 4 });
    expect(r.from).toBe("2026-10-20");
    expect(r.to).toBe("2026-11-16");
    expect(r.dates).toEqual(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
  });
  it("respeta valid_from futuro y valid_until", () => {
    const r = planSeriesDates({ weekday: 3, validFrom: "2026-10-28", validUntil: "2026-11-05", today: "2026-10-20", weeks: 4 });
    expect(r.dates).toEqual(["2026-10-28", "2026-11-04"]);
  });
  it("serie vencida o weeks=0 → sin fechas", () => {
    expect(planSeriesDates({ weekday: 1, validFrom: "2026-01-01", validUntil: "2026-02-01", today: "2026-10-20", weeks: 4 }).dates).toEqual([]);
    expect(planSeriesDates({ weekday: 2, validFrom: "2026-01-01", validUntil: null, today: "2026-10-20", weeks: 0 }).dates).toEqual([]);
  });
  it("incluye hoy si coincide el día", () => {
    expect(planSeriesDates({ weekday: 2, validFrom: "2026-10-20", validUntil: null, today: "2026-10-20", weeks: 1 }).dates).toEqual(["2026-10-20"]);
  });
});

describe("ausencias", () => {
  const full = { starts_on: dbDate("2026-10-20"), ends_on: dbDate("2026-10-22"), start_time: null, end_time: null };
  const partial = { starts_on: dbDate("2026-10-20"), ends_on: dbDate("2026-10-20"), start_time: "08:00", end_time: "10:00" };
  it("día completo cubre cualquier horario dentro del rango", () => {
    expect(timeOffCoversSlot(full, "2026-10-21", "06:00", "07:00")).toBe(true);
    expect(timeOffCoversSlot(full, "2026-10-23", "06:00", "07:00")).toBe(false);
  });
  it("por horario: solo si se cruzan [start,end)", () => {
    expect(timeOffCoversSlot(partial, "2026-10-20", "09:30", "10:30")).toBe(true);
    expect(timeOffCoversSlot(partial, "2026-10-20", "10:00", "11:00")).toBe(false);
  });
  it("solapamiento entre ausencias", () => {
    expect(timeOffWindowsOverlap(full, partial)).toBe(true);
    const other = { starts_on: dbDate("2026-10-20"), ends_on: dbDate("2026-10-20"), start_time: "10:00", end_time: "11:00" };
    expect(timeOffWindowsOverlap(partial, other)).toBe(false);
    const later = { ...full, starts_on: dbDate("2026-10-23"), ends_on: dbDate("2026-10-24") };
    expect(timeOffWindowsOverlap(full, later)).toBe(false);
  });
});

describe("resolveSessionSetup — tipo de sesión, cupo e instantes", () => {
  const base = { date: "2026-10-26", startTime: "07:00", endTime: "08:00" };

  it("OPEN heredado: sin política, instantes NULL, cupo explícito", () => {
    const r = resolveSessionSetup({ ...base, kind: "OPEN", policy: DEFAULTS, explicitCapacity: 12 });
    expect(r).toEqual({ ok: true, capacity: 12, startsAt: null, endsAt: null });
  });
  it("OPEN sin cupo explícito usa el del tipo de clase; sin ninguno falla", () => {
    expect(resolveSessionSetup({ ...base, kind: "OPEN", policy: DEFAULTS, classTypeCapacityDefault: 20 })).toMatchObject({ ok: true, capacity: 20 });
    expect(resolveSessionSetup({ ...base, kind: "OPEN", policy: DEFAULTS })).toMatchObject({ ok: false, field: "capacity" });
  });
  it("PERSONALIZED/GROUP con flags apagados (default) fallan cerrados", () => {
    expect(resolveSessionSetup({ ...base, kind: "PERSONALIZED", policy: DEFAULTS })).toMatchObject({ ok: false, field: "session_kind" });
    expect(resolveSessionSetup({ ...base, kind: "GROUP", policy: DEFAULTS, explicitCapacity: 8 })).toMatchObject({ ok: false, field: "session_kind" });
  });
  it("sin timezone válida fallan cerrados aunque el flag esté activo", () => {
    const r = resolveSessionSetup({ ...base, kind: "GROUP", policy: ON(null), explicitCapacity: 8 });
    expect(r).toMatchObject({ ok: false, field: "session_kind" });
    expect(resolveSessionSetup({ ...base, kind: "GROUP", policy: ON("Mars/Olympus"), explicitCapacity: 8 })).toMatchObject({ ok: false });
  });
  it("PERSONALIZED: cupo explícito > entrenador > política", () => {
    expect(resolveSessionSetup({ ...base, kind: "PERSONALIZED", policy: ON(), trainerPersonalizedCapacity: 2 })).toMatchObject({ ok: true, capacity: 2 });
    expect(resolveSessionSetup({ ...base, kind: "PERSONALIZED", policy: ON() })).toMatchObject({ ok: true, capacity: 1 });
    expect(resolveSessionSetup({ ...base, kind: "PERSONALIZED", policy: ON(), explicitCapacity: 3, trainerPersonalizedCapacity: 2 })).toMatchObject({ capacity: 3 });
  });
  it("GROUP sin cupo explícito ni del tipo → error de capacidad", () => {
    expect(resolveSessionSetup({ ...base, kind: "GROUP", policy: ON() })).toMatchObject({ ok: false, field: "capacity" });
  });
  it("PERSONALIZED/GROUP guardan instantes en la timezone del gimnasio (UTC−6)", () => {
    const r = resolveSessionSetup({ ...base, kind: "GROUP", policy: ON(), explicitCapacity: 8 });
    expect(r.ok && r.startsAt?.toISOString()).toBe("2026-10-26T13:00:00.000Z");
    expect(r.ok && r.endsAt?.toISOString()).toBe("2026-10-26T14:00:00.000Z");
  });
  it("DST (America/New_York): misma hora local, offset distinto a cada lado del cambio", () => {
    const policy = ON("America/New_York");
    const before = resolveSessionSetup({ kind: "GROUP", policy, explicitCapacity: 8, date: "2026-03-01", startTime: "09:00", endTime: "10:00" });
    const after = resolveSessionSetup({ kind: "GROUP", policy, explicitCapacity: 8, date: "2026-03-08", startTime: "09:00", endTime: "10:00" });
    expect(before.ok && before.startsAt?.toISOString()).toBe("2026-03-01T14:00:00.000Z"); // EST −5
    expect(after.ok && after.startsAt?.toISOString()).toBe("2026-03-08T13:00:00.000Z"); // EDT −4
  });
  it("DST: una hora local inexistente (02:30 del salto) se resuelve de forma determinista y válida", () => {
    const r = resolveSessionSetup({
      kind: "GROUP",
      policy: ON("America/New_York"),
      explicitCapacity: 8,
      date: "2026-03-08",
      startTime: "02:30",
      endTime: "03:30",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.endsAt!.getTime()).toBeGreaterThan(r.startsAt!.getTime());
  });
});
