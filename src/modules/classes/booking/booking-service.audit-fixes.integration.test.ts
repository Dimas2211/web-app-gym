// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 2B — correcciones posteriores a la auditoría independiente,
// contra PostgreSQL REAL desechable (se omite sin GYM_BOOKING_IT_*).
//
//  H01 · R29: el staff cancela "hasta que la sesión se cierre". Una sesión
//        completed no libera cupos ni consumos (cancelBooking / cancelSession).
//        OPEN heredado (sin política, sin consumo) conserva su regla (corrección B).
//  H02 · R32: el entrenador de la sesión edita asistencia hasta 48 h después de
//        ends_at o hasta cerrar la sesión; después solo SA o BA (corrección
//        administrativa). Recepción no obtiene ese privilegio. R36 intacto.
// Fuente: "Auditoría Reservas GYM.md" (Etapa 1) R29, R32, R36 y matriz E.
// ─────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createGymBookingService } from "./booking-service";
import type { GymBookingActor, GymBookingResult, GymBookingService, RecordAttendanceCommand } from "./booking-contracts";
import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "./testing/pg-it-harness";
import {
  actor,
  B1,
  BA1,
  createMember,
  createSession,
  invariantViolations,
  key,
  MODALITIES_ON,
  NO_VIOLATIONS,
  RC1,
  SA1,
  seedBase,
  setPolicy,
  staffBook,
  T1,
  T1_STAFF_SCOPE,
  TRAINER_A,
  USERS,
} from "./testing/booking-fixtures";

const HOUR = 3_600_000;
const code = <T>(r: GymBookingResult<T>) => (r.ok ? "OK" : r.code);
const SEDE = { tenantId: T1, locationId: B1 };
const TRAINER = actor(USERS.trainerA, "trainer"); // entrenador de las sesiones (TRAINER_A)

describe.skipIf(!IT_ENABLED)("auditoría 2B — H01 / H02 (PostgreSQL real)", () => {
  let it2b: ItDatabase;
  let db: PrismaClient;
  let svc: GymBookingService;

  beforeAll(async () => {
    it2b = await createItDatabase();
    db = it2b.db;
    await seedBase(db);
    await setPolicy(db, T1, MODALITIES_ON);
    svc = createGymBookingService(db);
  }, 180_000);

  afterEach(async () => {
    expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
  });

  afterAll(async () => {
    await it2b?.drop();
    await disconnectAdmin();
  });

  const closeSession = (id: string) =>
    db.scheduledClass.update({ where: { id }, data: { status: "completed", completed_at: new Date(), completed_by_user_id: USERS.ba1 } });

  const counters = async (sessionId: string, membershipId: string) => ({
    seats: (await db.scheduledClass.findUniqueOrThrow({ where: { id: sessionId } })).booked_count,
    used: (await db.clientMembership.findUniqueOrThrow({ where: { id: membershipId } })).sessions_used,
  });

  async function groupBooking(startsAt: Date) {
    const m = await createMember(db, { modality: "GROUP", sessionsTotal: 4 });
    const ses = await createSession(db, { kind: "GROUP", trainer: TRAINER_A, startsAt, durationMinutes: 60 });
    const b = await svc.bookSession({ ...staffBook(ses, m.clientId), now: new Date(startsAt.getTime() - 3 * HOUR) });
    if (!b.ok) throw new Error(b.code);
    return { ses, m, bookingId: b.value.bookingId };
  }

  // ── H01 ─────────────────────────────────────────────────────────
  describe("H01 · cancelaciones sobre sesiones cerradas (R29)", () => {
    it("H01-1 staff NO cancela una reserva de una sesión completed: no libera cupo ni sesión", async () => {
      const { ses, m, bookingId } = await groupBooking(new Date(Date.now() - 3 * HOUR));
      await closeSession(ses);
      const r = await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId, reason: "corrección", idempotencyKey: key() });
      expect(code(r)).toBe("SESSION_CLOSED");
      expect(await counters(ses, m.membershipId)).toEqual({ seats: 1, used: 1 });
      expect(await db.classBookingEvent.count({ where: { booking_id: bookingId, event_type: "CANCELLED" } })).toBe(0);
    });

    it("H01-2 cancelSession sobre una sesión completed → SESSION_CLOSED, sin operación ni eventos", async () => {
      const { ses, m } = await groupBooking(new Date(Date.now() - 3 * HOUR));
      await closeSession(ses);
      const k = key();
      const r = await svc.cancelSession({ scope: SEDE, actor: BA1, sessionId: ses, reason: "cierre", idempotencyKey: k });
      expect(code(r)).toBe("SESSION_CLOSED");
      expect((await db.scheduledClass.findUniqueOrThrow({ where: { id: ses } })).status).toBe("completed");
      expect(await counters(ses, m.membershipId)).toEqual({ seats: 1, used: 1 });
      expect(await db.gymBookingOperation.count({ where: { idempotency_key: k } })).toBe(0);
    });

    it("H01-3 positivo: sesión iniciada (in_progress) aún no cerrada → el staff cancela con motivo y libera (R29)", async () => {
      const { ses, m, bookingId } = await groupBooking(new Date(Date.now() - 0.5 * HOUR));
      await db.scheduledClass.update({ where: { id: ses }, data: { status: "in_progress" } });
      const r = await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId, reason: "lesión", idempotencyKey: key() });
      expect(r).toMatchObject({ ok: true, value: { cancellationType: "STAFF", consumption: "RELEASED" } });
      expect(await counters(ses, m.membershipId)).toEqual({ seats: 0, used: 0 });
    });

    it("H01-4 positivo: cancelSession de una sesión in_progress libera todo", async () => {
      const { ses, m } = await groupBooking(new Date(Date.now() - 0.5 * HOUR));
      await db.scheduledClass.update({ where: { id: ses }, data: { status: "in_progress" } });
      const r = await svc.cancelSession({ scope: SEDE, actor: BA1, sessionId: ses, reason: "lluvia", idempotencyKey: key() });
      expect(r.ok && r.value.released.length).toBe(1);
      expect(await counters(ses, m.membershipId)).toEqual({ seats: 0, used: 0 });
    });

    it("H01-5 excepción OPEN heredado (sin política, sin consumo): el staff conserva su cancelación sobre una clase completed", async () => {
      const ses = await createSession(db, { kind: "OPEN", status: "scheduled" });
      const m = await createMember(db);
      const b = await svc.bookSession(staffBook(ses, m.clientId));
      if (!b.ok) throw new Error(b.code);
      await closeSession(ses);
      const r = await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.value.bookingId, idempotencyKey: key() });
      expect(r).toMatchObject({ ok: true, value: { consumption: "NOT_APPLICABLE" } });
    });

    it("H01-6 OPEN con apply_policy_to_open = true sí respeta el cierre; cancelSession nunca opera sobre completed", async () => {
      const ses = await createSession(db, { kind: "OPEN" });
      const m = await createMember(db);
      const b = await svc.bookSession(staffBook(ses, m.clientId));
      if (!b.ok) throw new Error(b.code);
      await closeSession(ses);
      await setPolicy(db, T1, { apply_policy_to_open: true });
      try {
        expect(code(await svc.cancelBooking({ scope: T1_STAFF_SCOPE, actor: SA1, channel: "STAFF", bookingId: b.value.bookingId, reason: "x", idempotencyKey: key() }))).toBe(
          "SESSION_CLOSED"
        );
      } finally {
        await setPolicy(db, T1, { apply_policy_to_open: false });
      }
      expect(code(await svc.cancelSession({ scope: T1_STAFF_SCOPE, actor: SA1, sessionId: ses, reason: "x", idempotencyKey: key() }))).toBe("SESSION_CLOSED");
    });
  });

  // ── H02 ─────────────────────────────────────────────────────────
  describe("H02 · ventana de asistencia R32 por rol", () => {
    const record = (bookingId: string, who: GymBookingActor, now: Date, extra: Partial<RecordAttendanceCommand> = {}) =>
      svc.recordAttendance({
        scope: who.role === "super_admin" ? T1_STAFF_SCOPE : SEDE,
        actor: who,
        channel: who.role === "trainer" ? "TRAINER" : "STAFF",
        bookingId,
        status: "attended",
        idempotencyKey: key(),
        now,
        ...extra,
      });

    // Sesión de 1 h que empezó hace 50 h: ventana = [inicio, fin + 48 h].
    const startsAt = () => new Date(Date.now() - 50 * HOUR);
    const at = (s: Date, h: number) => new Date(s.getTime() + h * HOUR);

    it("H02-1 dentro de la ventana y sesión abierta: entrenador, recepción, BA y SA registran", async () => {
      const s = startsAt();
      const { bookingId } = await groupBooking(s);
      for (const who of [TRAINER, RC1, BA1, SA1]) expect(code(await record(bookingId, who, at(s, 0.5))), who.role).toBe("OK");
    });

    it("H02-2 después de fin + 48 h: entrenador y recepción → ATTENDANCE_WINDOW_CLOSED; BA y SA corrigen (administrativo)", async () => {
      const s = startsAt();
      const { bookingId } = await groupBooking(s);
      const late = at(s, 1 + 48.1);
      expect(code(await record(bookingId, TRAINER, late))).toBe("ATTENDANCE_WINDOW_CLOSED");
      expect(code(await record(bookingId, RC1, late))).toBe("ATTENDANCE_WINDOW_CLOSED");
      expect(code(await record(bookingId, BA1, late, { status: "absent" }))).toBe("OK");
      expect(code(await record(bookingId, SA1, late, { status: "late" }))).toBe("OK");
      const ev = await db.classBookingEvent.findMany({ where: { booking_id: bookingId, event_type: { in: ["ATTENDANCE_RECORDED", "ATTENDANCE_UPDATED"] } } });
      expect(ev.map((e) => (e.metadata as { administrative_correction?: boolean }).administrative_correction).sort()).toEqual([true, true]);
    });

    it("H02-3 sesión completed dentro de las 48 h: entrenador y recepción ya no editan; BA y SA sí", async () => {
      const s = new Date(Date.now() - 3 * HOUR);
      const { ses, bookingId } = await groupBooking(s);
      expect(code(await record(bookingId, TRAINER, at(s, 1.5)))).toBe("OK");
      await closeSession(ses);
      const now = at(s, 2);
      expect(code(await record(bookingId, TRAINER, now, { status: "late" }))).toBe("ATTENDANCE_WINDOW_CLOSED");
      expect(code(await record(bookingId, RC1, now, { status: "late" }))).toBe("ATTENDANCE_WINDOW_CLOSED");
      expect(code(await record(bookingId, BA1, now, { status: "late" }))).toBe("OK");
      expect(code(await record(bookingId, SA1, now, { status: "absent" }))).toBe("OK");
    });

    it("H02-4 antes del inicio nadie registra (tampoco SA/BA)", async () => {
      const s = new Date(Date.now() + 5 * HOUR);
      const { bookingId } = await groupBooking(s);
      for (const who of [TRAINER, RC1, BA1, SA1]) expect(code(await record(bookingId, who, at(s, -0.1))), who.role).toBe("ATTENDANCE_NOT_STARTED");
    });

    it("H02-5 R36: training_notes nunca desde recepción; entrenador solo en ventana; BA corrige después", async () => {
      const s = startsAt();
      const { bookingId } = await groupBooking(s);
      expect(code(await record(bookingId, RC1, at(s, 0.5), { trainingNotes: "x" }))).toBe("FORBIDDEN");
      expect(code(await record(bookingId, TRAINER, at(s, 0.5), { trainingNotes: "técnica" }))).toBe("OK");
      expect(code(await record(bookingId, TRAINER, at(s, 49.5), { trainingNotes: "tarde" }))).toBe("ATTENDANCE_WINDOW_CLOSED");
      expect(code(await record(bookingId, RC1, at(s, 49.5), { trainingNotes: "x" }))).toBe("FORBIDDEN");
      expect(code(await record(bookingId, BA1, at(s, 49.5), { trainingNotes: "corregido" }))).toBe("OK");
      expect((await db.classAttendance.findFirstOrThrow({ where: { booking_id: bookingId } })).training_notes).toBe("corregido");
    });

    it("H02-6 OPEN heredado: staff (incl. recepción) conserva el registro sin ventana; el entrenador (canal nuevo) respeta el cierre", async () => {
      const ses = await createSession(db, { kind: "OPEN", trainer: TRAINER_A });
      const m = await createMember(db);
      const b = await svc.bookSession(staffBook(ses, m.clientId));
      if (!b.ok) throw new Error(b.code);
      await closeSession(ses);
      expect(code(await record(b.value.bookingId, RC1, new Date()))).toBe("OK");
      expect(code(await record(b.value.bookingId, TRAINER, new Date()))).toBe("ATTENDANCE_WINDOW_CLOSED");
    });
  });
});
