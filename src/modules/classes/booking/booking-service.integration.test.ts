// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — integración de GymBookingService contra PostgreSQL REAL
// desechable (todas las migraciones, incluida 2B). Se omite sin
// GYM_BOOKING_IT_ADMIN_URL / GYM_BOOKING_IT_DATA_DIR (ver testing/pg-it-harness.ts).
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createGymBookingService } from "./booking-service";
import type { GymBookingResult, GymBookingService } from "./booking-contracts";
import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "./testing/pg-it-harness";
import {
  actor,
  B1,
  B1B,
  BA1,
  BA1B,
  createClient,
  createMember,
  createMembership,
  createSession,
  dayOffset,
  invariantViolations,
  key,
  MODALITIES_ON,
  NO_VIOLATIONS,
  portalBook,
  RC1,
  SA1,
  SA2,
  seedBase,
  setPolicy,
  staffBook,
  T1,
  T1_STAFF_SCOPE,
  T2,
  TRAINER_A,
  TRAINER_C,
  USERS,
} from "./testing/booking-fixtures";

const HOUR = 3_600_000;

function code<T>(r: GymBookingResult<T>) {
  return r.ok ? "OK" : r.code;
}
function ok<T>(r: GymBookingResult<T>): T {
  if (!r.ok) throw new Error(`esperaba ok, llegó ${r.code}${r.message ? ` (${r.message})` : ""}`);
  return r.value;
}

describe.skipIf(!IT_ENABLED)("GymBookingService — integración PostgreSQL real", () => {
  let it2b: ItDatabase;
  let db: PrismaClient;
  let svc: GymBookingService;

  // Cada describe interno usa su propio tenant de política vía setPolicy();
  // T1 arranca SIN fila gym_settings (defaults de columna = comportamiento heredado).
  beforeAll(async () => {
    it2b = await createItDatabase();
    db = it2b.db;
    await seedBase(db);
    svc = createGymBookingService(db);
  }, 180_000);

  afterAll(async () => {
    if (db) expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
    await it2b?.drop();
    await disconnectAdmin();
  });

  const counters = async (sessionId: string, membershipId?: string) => {
    const s = await db.scheduledClass.findUniqueOrThrow({ where: { id: sessionId }, select: { booked_count: true } });
    const m = membershipId
      ? await db.clientMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { sessions_used: true } })
      : null;
    return { seats: s.booked_count, used: m?.sessions_used ?? null };
  };

  // ── A. OPEN / NORMAL (regresión heredada) ───────────────────────
  describe("A · OPEN / NORMAL con política por defecto (apply_policy_to_open = false)", () => {
    it("A1 staff reserva OPEN: NOT_APPLICABLE, sin membresía ligada, +1 cupo, 1 operación + 1 evento BOOKED", async () => {
      const ses = await createSession(db);
      const m = await createMember(db);
      const r = await svc.bookSession(staffBook(ses, m.clientId));
      const v = ok(r);
      expect(v).toMatchObject({ status: "confirmed", consumption: "NOT_APPLICABLE", membershipId: null, cancellationType: null });
      expect(await counters(ses, m.membershipId)).toEqual({ seats: 1, used: 0 });
      const booking = await db.classBooking.findUniqueOrThrow({ where: { id: v.bookingId } });
      expect(booking).toMatchObject({ channel: "STAFF", booked_by_user_id: USERS.sa1, tenant_id: T1 });
      const events = await db.classBookingEvent.findMany({ where: { booking_id: v.bookingId } });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ event_type: "BOOKED", to_status: "confirmed", client_membership_id: null });
      expect(events[0].metadata).toMatchObject({ authorizing_membership_id: m.membershipId, session_kind: "OPEN" });
      expect(r.ok && r.replayed).toBe(false);
      expect(await db.gymBookingOperation.count({ where: { id: r.ok ? r.operationId : "" } })).toBe(1);
    });

    it("A2 fecha heredada: el portal no reserva clases pasadas; staff sí (sin cambio de reglas)", async () => {
      const past = await createSession(db, { date: dayOffset(-1) });
      const m = await createMember(db, { withUser: true });
      expect(code(await svc.bookSession(portalBook(past, m)))).toBe("SESSION_STARTED");
      expect(code(await svc.bookSession(staffBook(past, m.clientId)))).toBe("OK");
    });

    it("A3 membresía: sin membresía, impaga o vencida → NO_ELIGIBLE_MEMBERSHIP; portal exige start_date ≤ hoy, staff no", async () => {
      const ses = await createSession(db);
      const none = await createClient(db);
      expect(code(await svc.bookSession(staffBook(ses, none.clientId)))).toBe("NO_ELIGIBLE_MEMBERSHIP");
      const unpaid = await createMember(db, { payment: "pending" });
      expect(code(await svc.bookSession(staffBook(ses, unpaid.clientId)))).toBe("NO_ELIGIBLE_MEMBERSHIP");
      const expired = await createMember(db, { startOffsetDays: -40, endOffsetDays: -1 });
      expect(code(await svc.bookSession(staffBook(ses, expired.clientId)))).toBe("NO_ELIGIBLE_MEMBERSHIP");
      const future = await createMember(db, { withUser: true, startOffsetDays: 1, endOffsetDays: 30 });
      expect(code(await svc.bookSession(portalBook(ses, future)))).toBe("NO_ELIGIBLE_MEMBERSHIP");
      expect(code(await svc.bookSession(staffBook(ses, future.clientId)))).toBe("OK");
    });

    it("A4 duplicado, cancelación staff sin motivo (OPEN heredado) y reactivación", async () => {
      const ses = await createSession(db);
      const m = await createMember(db);
      const b = ok(await svc.bookSession(staffBook(ses, m.clientId)));
      expect(code(await svc.bookSession(staffBook(ses, m.clientId)))).toBe("ALREADY_BOOKED");
      const c = ok(await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.bookingId, idempotencyKey: key() }));
      expect(c).toMatchObject({ status: "cancelled", cancellationType: "STAFF", consumption: "NOT_APPLICABLE" });
      expect((await counters(ses)).seats).toBe(0);
      expect(code(await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.bookingId, idempotencyKey: key() }))).toBe("ALREADY_CANCELLED");
      const re = ok(await svc.bookSession(staffBook(ses, m.clientId)));
      expect(re.bookingId).toBe(b.bookingId);
      expect((await counters(ses)).seats).toBe(1);
      const types = (await db.classBookingEvent.findMany({ where: { booking_id: b.bookingId }, orderBy: { occurred_at: "asc" } })).map((e) => e.event_type);
      expect(types).toEqual(["BOOKED", "CANCELLED", "REACTIVATED"]);
      const row = await db.classBooking.findUniqueOrThrow({ where: { id: b.bookingId } });
      expect(row).toMatchObject({ cancelled_at: null, cancellation_type: null, cancel_reason: null });
    });

    it("A5 cupo: SESSION_FULL al reservar y también al reactivar (2B cierra el sobrecupo heredado)", async () => {
      const ses = await createSession(db, { capacity: 1 });
      const a = await createMember(db);
      const b = await createMember(db);
      const ba = ok(await svc.bookSession(staffBook(ses, a.clientId)));
      expect(code(await svc.bookSession(staffBook(ses, b.clientId)))).toBe("SESSION_FULL");
      ok(await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: ba.bookingId, idempotencyKey: key() }));
      ok(await svc.bookSession(staffBook(ses, b.clientId)));
      expect(code(await svc.bookSession(staffBook(ses, a.clientId)))).toBe("SESSION_FULL");
      expect((await counters(ses)).seats).toBe(1);
    });

    it("A6 OPEN ignora horizonte/ventanas mientras apply_policy_to_open = false; con true los aplica", async () => {
      const far = await createSession(db, { tenant: T2, date: dayOffset(60) });
      const m = await createMember(db, { tenant: T2, withUser: true });
      const scope2 = { tenantId: T2, locationId: null };
      const cmd = () => ({ ...portalBook(far, m), scope: scope2 });
      await setPolicy(db, T2, { apply_policy_to_open: true, timezone: "America/El_Salvador" });
      expect(code(await svc.bookSession(cmd()))).toBe("OUTSIDE_BOOKING_HORIZON");
      await setPolicy(db, T2, { apply_policy_to_open: false });
      expect(code(await svc.bookSession(cmd()))).toBe("OK");
    });

    it("A7 reserva heredada (channel NULL): staff la cancela sin consumo; el portal no cancela clases pasadas", async () => {
      const ses = await createSession(db);
      const past = await createSession(db, { date: dayOffset(-2) });
      const m = await createMember(db, { withUser: true });
      const legacy = await db.classBooking.create({ data: { scheduled_class_id: ses, client_id: m.clientId } });
      const legacyPast = await db.classBooking.create({ data: { scheduled_class_id: past, client_id: m.clientId } });
      expect(legacy.tenant_id).toBe(T1); // derivado por trigger
      const portalScope = { tenantId: T1, locationId: null };
      const cAct = actor(m.userId!, "client");
      expect(code(await svc.cancelBooking({ scope: portalScope, actor: cAct, channel: "PORTAL", bookingId: legacyPast.id, idempotencyKey: key() }))).toBe("CANCEL_WINDOW_CLOSED");
      const c = ok(await svc.cancelBooking({ scope: portalScope, actor: cAct, channel: "PORTAL", bookingId: legacy.id, idempotencyKey: key() }));
      expect(c).toMatchObject({ status: "cancelled", consumption: "NOT_APPLICABLE", cancellationType: "CLIENT_IN_POLICY", membershipId: null });
      expect((await counters(ses)).seats).toBe(0);
    });

    it("A8 estado de sesión: cancelada → SESSION_NOT_BOOKABLE; in_progress solo staff (heredado)", async () => {
      const cancelled = await createSession(db, { status: "cancelled" });
      const running = await createSession(db, { status: "in_progress" });
      const m = await createMember(db, { withUser: true });
      expect(code(await svc.bookSession(staffBook(cancelled, m.clientId)))).toBe("SESSION_NOT_BOOKABLE");
      expect(code(await svc.bookSession(portalBook(running, m)))).toBe("SESSION_NOT_BOOKABLE");
      expect(code(await svc.bookSession(staffBook(running, m.clientId)))).toBe("OK");
    });

    it("A9 cliente inactivo → CLIENT_INACTIVE", async () => {
      const ses = await createSession(db);
      const m = await createMember(db, { status: "inactive" });
      expect(code(await svc.bookSession(staffBook(ses, m.clientId)))).toBe("CLIENT_INACTIVE");
    });

    it("A10 un cliente PERSONALIZED/GROUP no reserva OPEN (R7) → MODALITY_MISMATCH", async () => {
      const ses = await createSession(db);
      const g = await createMember(db, { modality: "GROUP", sessionsTotal: 4 });
      expect(code(await svc.bookSession(staffBook(ses, g.clientId)))).toBe("MODALITY_MISMATCH");
    });
  });

  // ── B. PERSONALIZED / GROUP (con política) ──────────────────────
  describe("B · PERSONALIZED / GROUP", () => {
    // Tenant T1 con modalidades activas a partir de aquí (OPEN sigue sin política).
    beforeAll(async () => {
      await setPolicy(db, T1, MODALITIES_ON);
    });

    const inHours = (h: number) => new Date(Date.now() + h * HOUR);

    it("B1 fallo cerrado (R18): flag apagado → MODALITY_DISABLED; sin timezone → TIMEZONE_NOT_CONFIGURED", async () => {
      const ses = await createSession(db, { tenant: T2, kind: "GROUP", date: dayOffset(2) });
      const m = await createMember(db, { tenant: T2, modality: "GROUP", sessionsTotal: 4 });
      const cmd = () => ({ ...staffBook(ses, m.clientId), scope: { tenantId: T2, locationId: null }, actor: SA2 });
      await setPolicy(db, T2, { group_booking_enabled: false, timezone: "America/El_Salvador", apply_policy_to_open: false });
      expect(code(await svc.bookSession(cmd()))).toBe("MODALITY_DISABLED");
      await setPolicy(db, T2, { group_booking_enabled: true, timezone: null });
      expect(code(await svc.bookSession(cmd()))).toBe("TIMEZONE_NOT_CONFIGURED");
      await setPolicy(db, T2, { timezone: "America/El_Salvador" });
      expect(code(await svc.bookSession(cmd()))).toBe("OK");
    });

    it("B2 GROUP consume: CONSUMED, membresía ligada, sessions_used +1, evento con la membresía", async () => {
      const ses = await createSession(db, { kind: "GROUP", startsAt: inHours(48) });
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 4 });
      const v = ok(await svc.bookSession(staffBook(ses, m.clientId)));
      expect(v).toMatchObject({ consumption: "CONSUMED", membershipId: m.membershipId });
      expect(await counters(ses, m.membershipId)).toEqual({ seats: 1, used: 1 });
      const ev = await db.classBookingEvent.findFirstOrThrow({ where: { booking_id: v.bookingId } });
      expect(ev).toMatchObject({ client_membership_id: m.membershipId, consumption_after: "CONSUMED" });
    });

    it("B3 modalidad: cliente NORMAL en GROUP, o cliente GROUP con membresía NORMAL → MODALITY_MISMATCH", async () => {
      const ses = await createSession(db, { kind: "GROUP", startsAt: inHours(48) });
      const normal = await createMember(db);
      expect(code(await svc.bookSession(staffBook(ses, normal.clientId)))).toBe("MODALITY_MISMATCH");
      const c = await createClient(db, { modality: "GROUP" });
      await createMembership(db, { clientId: c.clientId, modality: "NORMAL" });
      expect(code(await svc.bookSession(staffBook(ses, c.clientId)))).toBe("MODALITY_MISMATCH");
    });

    it("B4 PERSONALIZED exige el entrenador asignado (R10)", async () => {
      const ses = await createSession(db, { kind: "PERSONALIZED", capacity: 1, trainer: TRAINER_A, startsAt: inHours(30) });
      const other = await createMember(db, { modality: "PERSONALIZED", sessionsTotal: 8, trainerId: TRAINER_C });
      expect(code(await svc.bookSession(staffBook(ses, other.clientId)))).toBe("TRAINER_NOT_AUTHORIZED");
      const noTrainer = await createMember(db, { modality: "PERSONALIZED", sessionsTotal: 8 });
      expect(code(await svc.bookSession(staffBook(ses, noTrainer.clientId)))).toBe("TRAINER_NOT_AUTHORIZED");
      const mine = await createMember(db, { modality: "PERSONALIZED", sessionsTotal: 8, trainerId: TRAINER_A });
      expect(ok(await svc.bookSession(staffBook(ses, mine.clientId)))).toMatchObject({ consumption: "CONSUMED" });
    });

    it("B5 saldo: agotado → MEMBERSHIP_EXHAUSTED; consume primero la membresía que vence antes", async () => {
      const s1 = await createSession(db, { kind: "GROUP", startsAt: inHours(24) });
      const s2 = await createSession(db, { kind: "GROUP", startsAt: inHours(26) });
      const s3 = await createSession(db, { kind: "GROUP", startsAt: inHours(28) });
      const c = await createClient(db, { modality: "GROUP" });
      const late = await createMembership(db, { clientId: c.clientId, modality: "GROUP", sessionsTotal: 1, endOffsetDays: 40 });
      const soon = await createMembership(db, { clientId: c.clientId, modality: "GROUP", sessionsTotal: 1, endOffsetDays: 10 });
      expect(ok(await svc.bookSession(staffBook(s1, c.clientId))).membershipId).toBe(soon);
      expect(ok(await svc.bookSession(staffBook(s2, c.clientId))).membershipId).toBe(late);
      expect(code(await svc.bookSession(staffBook(s3, c.clientId)))).toBe("MEMBERSHIP_EXHAUSTED");
    });

    it("B6 cancelación del alumno: dentro de política libera la sesión; tardía la conserva (late_cancel_consumes_session)", async () => {
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 4, withUser: true });
      const early = await createSession(db, { kind: "GROUP", startsAt: inHours(5) });
      const soon = await createSession(db, { kind: "GROUP", startsAt: inHours(1) });
      const be = ok(await svc.bookSession(portalBook(early, m)));
      const bs = ok(await svc.bookSession(portalBook(soon, m)));
      expect((await counters(early, m.membershipId)).used).toBe(2);
      const pScope = { tenantId: T1, locationId: null };
      const cAct = actor(m.userId!, "client");
      expect(ok(await svc.cancelBooking({ scope: pScope, actor: cAct, channel: "PORTAL", bookingId: be.bookingId, idempotencyKey: key() }))).toMatchObject({
        cancellationType: "CLIENT_IN_POLICY",
        consumption: "RELEASED",
      });
      expect(ok(await svc.cancelBooking({ scope: pScope, actor: cAct, channel: "PORTAL", bookingId: bs.bookingId, idempotencyKey: key() }))).toMatchObject({
        cancellationType: "CLIENT_LATE",
        consumption: "CONSUMED",
      });
      expect(await counters(soon, m.membershipId)).toEqual({ seats: 0, used: 1 });
    });

    it("B6b con late_cancel_consumes_session = false la cancelación tardía libera la sesión", async () => {
      await setPolicy(db, T1, { late_cancel_consumes_session: false });
      try {
        const m = await createMember(db, { modality: "GROUP", sessionsTotal: 4, withUser: true });
        const soon = await createSession(db, { kind: "GROUP", startsAt: inHours(1) });
        const b = ok(await svc.bookSession(portalBook(soon, m)));
        const c = ok(await svc.cancelBooking({ scope: { tenantId: T1, locationId: null }, actor: actor(m.userId!, "client"), channel: "PORTAL", bookingId: b.bookingId, idempotencyKey: key() }));
        expect(c).toMatchObject({ cancellationType: "CLIENT_LATE", consumption: "RELEASED" });
        expect((await counters(soon, m.membershipId)).used).toBe(0);
      } finally {
        await setPolicy(db, T1, { late_cancel_consumes_session: true });
      }
    });

    it("B7 reactivar una tardía CONSUMED no consume de nuevo (incluso con saldo 0)", async () => {
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 1, withUser: true });
      const soon = await createSession(db, { kind: "GROUP", startsAt: inHours(1) });
      const b = ok(await svc.bookSession(portalBook(soon, m)));
      ok(await svc.cancelBooking({ scope: { tenantId: T1, locationId: null }, actor: actor(m.userId!, "client"), channel: "PORTAL", bookingId: b.bookingId, idempotencyKey: key() }));
      expect((await counters(soon, m.membershipId)).used).toBe(1);
      const re = ok(await svc.bookSession(portalBook(soon, m)));
      expect(re).toMatchObject({ status: "confirmed", consumption: "CONSUMED", membershipId: m.membershipId });
      expect(await counters(soon, m.membershipId)).toEqual({ seats: 1, used: 1 });
    });

    it("B8 reactivar desde RELEASED exige saldo → MEMBERSHIP_EXHAUSTED", async () => {
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 1 });
      const s1 = await createSession(db, { kind: "GROUP", startsAt: inHours(10) });
      const s2 = await createSession(db, { kind: "GROUP", startsAt: inHours(12) });
      const b1 = ok(await svc.bookSession(staffBook(s1, m.clientId)));
      ok(await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b1.bookingId, reason: "cambio", idempotencyKey: key() }));
      ok(await svc.bookSession(staffBook(s2, m.clientId)));
      expect(code(await svc.bookSession(staffBook(s1, m.clientId)))).toBe("MEMBERSHIP_EXHAUSTED");
    });

    it("B9 ventanas de cancelación: portal tras el inicio → CANCEL_WINDOW_CLOSED; staff exige motivo (R29) y libera", async () => {
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 4, withUser: true });
      const ses = await createSession(db, { kind: "GROUP", startsAt: inHours(2) });
      const b = ok(await svc.bookSession(portalBook(ses, m)));
      const after = new Date(Date.now() + 3 * HOUR);
      expect(code(await svc.cancelBooking({ scope: { tenantId: T1, locationId: null }, actor: actor(m.userId!, "client"), channel: "PORTAL", bookingId: b.bookingId, idempotencyKey: key(), now: after }))).toBe("CANCEL_WINDOW_CLOSED");
      expect(code(await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.bookingId, idempotencyKey: key(), now: after }))).toBe("REASON_REQUIRED");
      const c = ok(await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.bookingId, reason: "  lesión  ", idempotencyKey: key(), now: after }));
      expect(c).toMatchObject({ cancellationType: "STAFF", consumption: "RELEASED" });
      expect((await db.classBooking.findUniqueOrThrow({ where: { id: b.bookingId } })).cancel_reason).toBe("lesión");
    });

    it("B10 ventana de reserva: horizonte, anticipación mínima (staff exento) e inicio", async () => {
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 10, withUser: true });
      const far = await createSession(db, { kind: "GROUP", startsAt: inHours(15 * 24) });
      expect(code(await svc.bookSession(portalBook(far, m)))).toBe("OUTSIDE_BOOKING_HORIZON");
      const started = await createSession(db, { kind: "GROUP", startsAt: inHours(-0.5) });
      expect(code(await svc.bookSession(staffBook(started, m.clientId)))).toBe("SESSION_STARTED");
      await setPolicy(db, T1, { booking_min_lead_minutes: 120 });
      try {
        const near = await createSession(db, { kind: "GROUP", startsAt: inHours(1) });
        expect(code(await svc.bookSession(portalBook(near, m)))).toBe("BELOW_MIN_LEAD");
        expect(code(await svc.bookSession(staffBook(near, m.clientId)))).toBe("OK");
      } finally {
        await setPolicy(db, T1, { booking_min_lead_minutes: 0 });
      }
    });

    it("B11 solapamiento propio → CLIENT_SCHEDULE_CONFLICT", async () => {
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 10 });
      const date = dayOffset(4);
      const a = await createSession(db, { kind: "GROUP", date, start: "18:00", end: "19:00" });
      const b = await createSession(db, { kind: "GROUP", date, start: "18:30", end: "19:30", trainer: TRAINER_C });
      const c = await createSession(db, { kind: "GROUP", date, start: "19:00", end: "20:00", trainer: TRAINER_C });
      ok(await svc.bookSession(staffBook(a, m.clientId)));
      expect(code(await svc.bookSession(staffBook(b, m.clientId)))).toBe("CLIENT_SCHEDULE_CONFLICT");
      expect(code(await svc.bookSession(staffBook(c, m.clientId)))).toBe("OK"); // contiguo, no solapa
    });

    it("B12 sesión derivada: sin starts_at el instante sale de class_date + HH:mm en la timezone", async () => {
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 10, withUser: true });
      const ses = await createSession(db, { kind: "GROUP", date: dayOffset(20) }); // > 14 días
      expect(code(await svc.bookSession(portalBook(ses, m)))).toBe("OUTSIDE_BOOKING_HORIZON");
    });

    it("B13 cancelSession: 1 operación, N eventos SESSION_CANCELLED, libera cupos y sesiones; replay sin eventos nuevos", async () => {
      const ses = await createSession(db, { kind: "GROUP", startsAt: inHours(50) });
      const members = await Promise.all([1, 2, 3].map(() => createMember(db, { modality: "GROUP", sessionsTotal: 2 })));
      for (const m of members) ok(await svc.bookSession(staffBook(ses, m.clientId)));
      const k = key();
      const cmd = { scope: { tenantId: T1, locationId: B1 }, actor: BA1, sessionId: ses, reason: "Entrenador enfermo", idempotencyKey: k };
      expect(code(await svc.cancelSession({ ...cmd, reason: " " }))).toBe("REASON_REQUIRED");
      expect(code(await svc.cancelSession({ ...cmd, actor: RC1 }))).toBe("FORBIDDEN");
      expect(code(await svc.cancelSession({ ...cmd, scope: { tenantId: T1, locationId: B1B }, actor: BA1B }))).toBe("FORBIDDEN");
      const r = await svc.cancelSession(cmd);
      const v = ok(r);
      expect(v.released).toHaveLength(3);
      expect(v.released.every((b) => b.cancellationType === "SESSION_CANCELLED" && b.consumption === "RELEASED")).toBe(true);
      expect((await counters(ses)).seats).toBe(0);
      for (const m of members) expect((await counters(ses, m.membershipId)).used).toBe(0);
      const s = await db.scheduledClass.findUniqueOrThrow({ where: { id: ses } });
      expect(s).toMatchObject({ status: "cancelled", cancel_reason: "Entrenador enfermo", cancelled_by_user_id: USERS.ba1 });
      const opId = r.ok ? r.operationId : "";
      expect(await db.classBookingEvent.count({ where: { operation_id: opId, event_type: "SESSION_CANCELLED" } })).toBe(3);
      const replay = await svc.cancelSession(cmd);
      expect(replay).toMatchObject({ ok: true, replayed: true, operationId: opId });
      expect(await db.classBookingEvent.count({ where: { scheduled_class_id: ses, event_type: "SESSION_CANCELLED" } })).toBe(3);
      expect(code(await svc.cancelSession({ ...cmd, idempotencyKey: key() }))).toBe("ALREADY_CANCELLED");
      expect(code(await svc.bookSession(staffBook(ses, members[0].clientId)))).toBe("SESSION_NOT_BOOKABLE");
    });
  });

  // ── C. Asistencia ───────────────────────────────────────────────
  describe("C · asistencia", () => {
    it("C1 OPEN heredado: sin ventana; RECORDED → UPDATED, booking_id ligado, la nota previa se conserva", async () => {
      const ses = await createSession(db, { date: dayOffset(5) });
      const m = await createMember(db);
      const b = ok(await svc.bookSession(staffBook(ses, m.clientId)));
      const base = { scope: T1_STAFF_SCOPE, actor: RC1, channel: "STAFF" as const, bookingId: b.bookingId };
      const rcScope = { tenantId: T1, locationId: B1 };
      const a1 = ok(await svc.recordAttendance({ ...base, scope: rcScope, status: "attended", notes: "llegó puntual", idempotencyKey: key() }));
      const a2 = ok(await svc.recordAttendance({ ...base, scope: rcScope, status: "late", idempotencyKey: key() }));
      expect(a2.attendanceId).toBe(a1.attendanceId);
      const row = await db.classAttendance.findUniqueOrThrow({ where: { id: a1.attendanceId } });
      expect(row).toMatchObject({ attendance_status: "late", notes: "llegó puntual", booking_id: b.bookingId, tenant_id: T1, recorded_by_user_id: USERS.rc1, checked_in_at: null });
      const types = (await db.classBookingEvent.findMany({ where: { booking_id: b.bookingId }, orderBy: { occurred_at: "asc" } })).map((e) => e.event_type);
      expect(types).toEqual(["BOOKED", "ATTENDANCE_RECORDED", "ATTENDANCE_UPDATED"]);
    });

    it("C2 ventana con política: antes del inicio, dentro y después de fin + attendance_edit_window_hours", async () => {
      const m = await createMember(db, { modality: "GROUP", sessionsTotal: 5 });
      const startsAt = new Date(Date.now() + 2 * HOUR);
      const ses = await createSession(db, { kind: "GROUP", startsAt, durationMinutes: 60 });
      const b = ok(await svc.bookSession(staffBook(ses, m.clientId)));
      // Recepción sigue la ventana (R32); SA/BA corrigen después (auditoría H02, ver audit-fixes).
      const at = (h: number) => ({ scope: { tenantId: T1, locationId: B1 }, actor: RC1, channel: "STAFF" as const, bookingId: b.bookingId, status: "absent" as const, idempotencyKey: key(), now: new Date(startsAt.getTime() + h * HOUR) });
      expect(code(await svc.recordAttendance(at(-0.1)))).toBe("ATTENDANCE_NOT_STARTED");
      expect(code(await svc.recordAttendance(at(0.5)))).toBe("OK");
      expect(code(await svc.recordAttendance(at(1 + 47.9)))).toBe("OK");
      expect(code(await svc.recordAttendance(at(1 + 48.1)))).toBe("ATTENDANCE_WINDOW_CLOSED");
      expect(code(await svc.recordAttendance({ ...at(1 + 48.1), scope: T1_STAFF_SCOPE, actor: SA1 }))).toBe("OK");
      // R31: ausente sigue consumido.
      expect((await counters(ses, m.membershipId)).used).toBe(1);
    });

    it("C3 permisos: reserva cancelada → NOT_CONFIRMED; notas de entrenamiento solo SA/BA/entrenador de la sesión", async () => {
      // En curso: el canal TRAINER sigue la ventana R32 también en OPEN (auditoría H02).
      const ses = await createSession(db, { trainer: TRAINER_A, startsAt: new Date(Date.now() - 0.5 * HOUR) });
      const m = await createMember(db);
      const b = ok(await svc.bookSession(staffBook(ses, m.clientId)));
      const base = { bookingId: b.bookingId, status: "attended" as const };
      expect(code(await svc.recordAttendance({ ...base, scope: { tenantId: T1, locationId: B1 }, actor: RC1, channel: "STAFF", trainingNotes: "x", idempotencyKey: key() }))).toBe("FORBIDDEN");
      expect(code(await svc.recordAttendance({ ...base, scope: { tenantId: T1, locationId: B1 }, actor: BA1, channel: "STAFF", trainingNotes: "técnica ok", idempotencyKey: key() }))).toBe("OK");
      expect(code(await svc.recordAttendance({ ...base, scope: { tenantId: T1, locationId: B1 }, actor: actor(USERS.trainerC, "trainer"), channel: "TRAINER", idempotencyKey: key() }))).toBe("FORBIDDEN");
      expect(code(await svc.recordAttendance({ ...base, scope: { tenantId: T1, locationId: B1 }, actor: actor(USERS.trainerA, "trainer"), channel: "TRAINER", trainingNotes: "progresión", idempotencyKey: key() }))).toBe("OK");
      expect(code(await svc.recordAttendance({ ...base, scope: { tenantId: T1, locationId: B1 }, actor: actor(USERS.trainerA, "trainer"), channel: "STAFF", idempotencyKey: key() }))).toBe("FORBIDDEN");
      expect((await db.classAttendance.findFirstOrThrow({ where: { booking_id: b.bookingId } })).training_notes).toBe("progresión");
      ok(await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.bookingId, idempotencyKey: key() }));
      expect(code(await svc.recordAttendance({ ...base, scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", idempotencyKey: key() }))).toBe("NOT_CONFIRMED");
      expect(code(await svc.recordAttendance({ ...base, status: "cancelled" as never, scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", idempotencyKey: key() }))).toBe("INVALID_COMMAND");
    });
  });

  // ── D. Idempotencia por comando ─────────────────────────────────
  describe("D · idempotencia", () => {
    it("D1/D2 replay del resultado guardado sin efectos; respuesta perdida → mismo operationId", async () => {
      const ses = await createSession(db);
      const m = await createMember(db);
      const cmd = staffBook(ses, m.clientId);
      const first = await svc.bookSession(cmd);
      const again = await svc.bookSession({ ...cmd, now: new Date(Date.now() + 1000) }); // `now` no es identidad
      expect(first.ok && again.ok).toBe(true);
      if (first.ok && again.ok) {
        expect(again.replayed).toBe(true);
        expect(again.operationId).toBe(first.operationId);
        expect(again.value).toEqual(first.value);
      }
      expect(await db.gymBookingOperation.count({ where: { idempotency_key: cmd.idempotencyKey } })).toBe(1);
      expect(await db.classBookingEvent.count({ where: { scheduled_class_id: ses } })).toBe(1);
      expect((await counters(ses)).seats).toBe(1);
    });

    it("D4 misma key con otro contenido u otro comando → IDEMPOTENCY_KEY_REUSED; key inválida → INVALID_IDEMPOTENCY_KEY", async () => {
      const ses = await createSession(db);
      const ses2 = await createSession(db);
      const m = await createMember(db);
      const cmd = staffBook(ses, m.clientId);
      const b = ok(await svc.bookSession(cmd));
      expect(code(await svc.bookSession({ ...cmd, sessionId: ses2 }))).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(code(await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.bookingId, idempotencyKey: cmd.idempotencyKey }))).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(code(await svc.bookSession({ ...cmd, idempotencyKey: "short" }))).toBe("INVALID_IDEMPOTENCY_KEY");
    });

    it("D-rechazo: un rechazo de negocio no deja operación; el reintento con la misma key se reevalúa", async () => {
      const ses = await createSession(db);
      const c = await createClient(db);
      const cmd = staffBook(ses, c.clientId);
      expect(code(await svc.bookSession(cmd))).toBe("NO_ELIGIBLE_MEMBERSHIP");
      expect(await db.gymBookingOperation.count({ where: { idempotency_key: cmd.idempotencyKey } })).toBe(0);
      await createMembership(db, { clientId: c.clientId });
      expect(code(await svc.bookSession(cmd))).toBe("OK");
    });

    it("D5 la misma key en dos tenants son órdenes distintas", async () => {
      const s1 = await createSession(db);
      const s2 = await createSession(db, { tenant: T2 });
      const m1 = await createMember(db);
      const m2 = await createMember(db, { tenant: T2 });
      const k = key();
      expect(code(await svc.bookSession({ ...staffBook(s1, m1.clientId), idempotencyKey: k }))).toBe("OK");
      const r2 = await svc.bookSession({ ...staffBook(s2, m2.clientId), scope: { tenantId: T2, locationId: null }, actor: SA2, idempotencyKey: k });
      expect(r2).toMatchObject({ ok: true, replayed: false });
    });
  });

  // ── E. Aislamiento tenant / sede / propiedad ────────────────────
  describe("E · aislamiento", () => {
    it("E1 tenant: sesión o cliente de otro tenant → NOT_FOUND (nunca se lee ni se escribe)", async () => {
      const s1 = await createSession(db);
      const s2 = await createSession(db, { tenant: T2 });
      const m1 = await createMember(db);
      const m2 = await createMember(db, { tenant: T2 });
      const t2 = { scope: { tenantId: T2, locationId: null }, actor: SA2 };
      expect(code(await svc.bookSession({ ...staffBook(s1, m2.clientId), ...t2 }))).toBe("NOT_FOUND");
      expect(code(await svc.bookSession({ ...staffBook(s2, m1.clientId), ...t2 }))).toBe("NOT_FOUND");
      expect(code(await svc.bookSession(staffBook(s1, m2.clientId)))).toBe("NOT_FOUND");
      const b = ok(await svc.bookSession(staffBook(s1, m1.clientId)));
      expect(code(await svc.cancelBooking({ ...t2, channel: "STAFF", bookingId: b.bookingId, idempotencyKey: key() }))).toBe("NOT_FOUND");
      expect(code(await svc.recordAttendance({ ...t2, channel: "STAFF", bookingId: b.bookingId, status: "attended", idempotencyKey: key() }))).toBe("NOT_FOUND");
      expect(code(await svc.cancelSession({ ...t2, sessionId: s1, reason: "x", idempotencyKey: key() }))).toBe("NOT_FOUND");
    });

    it("E2 sede: BA/recepción solo en su sede; sin reservas entre sedes (también SA) → FORBIDDEN / CROSS_LOCATION", async () => {
      const sB1 = await createSession(db, { branch: B1 });
      const sB1B = await createSession(db, { branch: B1B, trainer: "it-trainer-b" });
      const cB1 = await createMember(db, { branch: B1 });
      const cB1B = await createMember(db, { branch: B1B });
      const ba1 = { scope: { tenantId: T1, locationId: B1 }, actor: BA1 };
      expect(code(await svc.bookSession({ ...staffBook(sB1B, cB1B.clientId), ...ba1 }))).toBe("FORBIDDEN");
      expect(code(await svc.bookSession({ ...staffBook(sB1, cB1B.clientId), ...ba1 }))).toBe("CROSS_LOCATION");
      expect(code(await svc.bookSession(staffBook(sB1B, cB1.clientId)))).toBe("CROSS_LOCATION");
      expect(code(await svc.bookSession({ ...staffBook(sB1, cB1.clientId), scope: { tenantId: T1, locationId: null }, actor: RC1 }))).toBe("FORBIDDEN");
      const b = ok(await svc.bookSession({ ...staffBook(sB1, cB1.clientId), ...ba1 }));
      expect(code(await svc.cancelBooking({ scope: { tenantId: T1, locationId: B1B }, actor: BA1B, channel: "STAFF", bookingId: b.bookingId, idempotencyKey: key() }))).toBe("FORBIDDEN");
    });

    it("E3 propiedad en el portal: el alumno solo opera sus reservas (client.user_id = actor)", async () => {
      const ses = await createSession(db);
      const owner = await createMember(db, { withUser: true });
      const intruder = await createMember(db, { withUser: true });
      expect(code(await svc.bookSession({ ...portalBook(ses, owner), actor: actor(intruder.userId!, "client") }))).toBe("NOT_FOUND");
      const b = ok(await svc.bookSession(portalBook(ses, owner)));
      expect(code(await svc.cancelBooking({ scope: { tenantId: T1, locationId: null }, actor: actor(intruder.userId!, "client"), channel: "PORTAL", bookingId: b.bookingId, idempotencyKey: key() }))).toBe("NOT_FOUND");
    });

    it("E4 canal y rol: TRAINER no reserva; un client no usa el canal STAFF; staff no usa PORTAL", async () => {
      const ses = await createSession(db);
      const m = await createMember(db, { withUser: true });
      expect(code(await svc.bookSession({ ...staffBook(ses, m.clientId), channel: "TRAINER", actor: actor(USERS.trainerA, "trainer") }))).toBe("FORBIDDEN");
      expect(code(await svc.bookSession({ ...staffBook(ses, m.clientId), actor: actor(m.userId!, "client") }))).toBe("FORBIDDEN");
      expect(code(await svc.bookSession({ ...portalBook(ses, m), actor: SA1 }))).toBe("FORBIDDEN");
    });
  });
});
