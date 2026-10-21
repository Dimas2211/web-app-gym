// ─────────────────────────────────────────────────────────────────
// GYM-4 — auditoría independiente H02–H04 contra PostgreSQL REAL desechable
// (se omite sin GYM_BOOKING_IT_*; ver testing/pg-it-harness.ts).
//
//  H02  zona horaria: OPEN heredado con y sin timezone, zonas IANA distintas
//       (con y sin DST), preflight de solo lectura; STAFF heredado intacto.
//  H03  actividades: clase futura, en curso, finalizada y cancelada; STAFF +
//       OPEN + apply_policy_to_open = false no registra antes del inicio;
//       la corrección administrativa posterior se conserva.
//  H04  revocación concurrente del entrenador (desactivación o cambio de
//       Trainer.user_id) mientras registra asistencia / actividad / nota.
//       Barreras observables (pg_stat_activity), conexiones independientes,
//       sin sleeps.
// ─────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createGymBookingService } from "../booking/booking-service";
import { createSessionActivityService } from "../booking/session-activities";
import type { GymBookingActor, GymBookingScope } from "../booking/booking-contracts";
import { createItDatabase, disconnectAdmin, IT_ENABLED, waitForLockWaiters, type ItDatabase } from "../booking/testing/pg-it-harness";
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
  T2,
  TRAINER_A,
  USERS,
} from "../booking/testing/booking-fixtures";
import { evaluateGymTimezone, findGymsWithoutValidTimezone, loadGymTimezoneStatus } from "./timezone-preflight";

const HOUR = 3_600_000;
const TRAINER: GymBookingActor = actor(USERS.trainerA, "trainer");
const TSCOPE: GymBookingScope = { tenantId: T1, locationId: B1 };
const SA_SCOPE: GymBookingScope = { tenantId: T1, locationId: null };
const BA_SCOPE: GymBookingScope = { tenantId: T1, locationId: B1 };
const ACT = { warm: "it-h-warm", squat: "it-h-squat", bike: "it-h-bike" };
const RELINK_USER = "it-user-h04";

/** Fecha y hora de pared de `at` en `tz` ("YYYY-MM-DD", "HH:mm"). */
function wall(at: Date, tz: string) {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at)) {
    p[part.type] = part.value;
  }
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}

describe.skipIf(!IT_ENABLED)("GYM-4 auditoría H02–H04 (PostgreSQL real)", () => {
  let it4: ItDatabase;
  let db: PrismaClient;
  let svc: ReturnType<typeof createGymBookingService>;
  let acts: ReturnType<typeof createSessionActivityService>;

  beforeAll(async () => {
    it4 = await createItDatabase();
    db = it4.db;
    await seedBase(db);
    await setPolicy(db, T1, MODALITIES_ON);
    await db.gymActivity.createMany({
      data: [
        { id: ACT.warm, tenant_id: T1, name: "Calentamiento" },
        { id: ACT.squat, tenant_id: T1, name: "Sentadilla" },
        { id: ACT.bike, tenant_id: T1, name: "Bicicleta" },
      ],
    });
    await db.user.create({
      data: { id: RELINK_USER, tenant_id: T1, gym_id: T1, branch_id: B1, email: `${RELINK_USER}@it.invalid`, password_hash: "x", first_name: "It", last_name: "H04", role: "trainer" },
    });
    svc = createGymBookingService(db);
    acts = createSessionActivityService(db);
  }, 180_000);

  afterEach(async () => {
    expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
  });

  afterAll(async () => {
    await it4?.drop();
    await disconnectAdmin();
  }, 180_000);

  // ── helpers ─────────────────────────────────────────────────────

  /** Reserva un alumno (antes del inicio) en la sesión; OPEN → membresía normal. */
  async function member(ses: string, kind: "OPEN" | "GROUP", bookedAt: Date) {
    const m = await createMember(db, { modality: kind === "OPEN" ? "NORMAL" : "GROUP", sessionsTotal: kind === "OPEN" ? null : 8 });
    const b = await svc.bookSession({ ...staffBook(ses, m.clientId), now: bookedAt });
    if (!b.ok) throw new Error(`booking ${b.code}`);
    return { ...m, bookingId: b.value.bookingId };
  }

  type Who = { actor: GymBookingActor; scope: GymBookingScope; channel: "TRAINER" | "STAFF" };
  const attend = (bookingId: string, who: Who, now?: Date) =>
    svc.recordAttendance({ scope: who.scope, actor: who.actor, channel: who.channel, bookingId, status: "attended", idempotencyKey: key(), now });

  const AS_TRAINER = { actor: TRAINER, scope: TSCOPE, channel: "TRAINER" as const };
  const AS_SA = { actor: SA1, scope: SA_SCOPE, channel: "STAFF" as const };
  const AS_BA = { actor: BA1, scope: BA_SCOPE, channel: "STAFF" as const };
  const AS_RC = { actor: RC1, scope: BA_SCOPE, channel: "STAFF" as const };

  const sessionActivity = (sessionId: string, who: Who, activityId = ACT.warm) =>
    acts.addSessionActivity({ scope: who.scope, actor: who.actor, channel: who.channel, sessionId, activityId });

  /** Mantiene un lock desde una conexión independiente hasta release(). */
  async function hold(sql: (tx: Prisma.TransactionClient) => Promise<unknown>) {
    const c = it4.extraClient();
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let ready!: () => void;
    const isReady = new Promise<void>((r) => (ready = r));
    const done = c.$transaction(
      async (tx) => {
        await sql(tx);
        ready();
        await released;
      },
      { timeout: 60_000, maxWait: 15_000 }
    );
    await isReady;
    return { release, done };
  }

  // ── H02 ─────────────────────────────────────────────────────────
  describe("H02 · zona horaria del gimnasio (R32 sin cambios)", () => {
    afterEach(async () => {
      await setPolicy(db, T1, MODALITIES_ON);
    });

    /** OPEN heredado: sin starts_at, hora de pared en `tz`, inicio = now + offsetMin. */
    async function legacyOpen(tz: string, offsetMin: number) {
      const start = new Date(Date.now() + offsetMin * 60_000);
      const s = wall(start, tz);
      const e = wall(new Date(start.getTime() + HOUR), tz);
      return createSession(db, { kind: "OPEN", date: s.date, start: s.hhmm, end: e.date === s.date ? e.hhmm : "23:59" });
    }

    it("sin timezone: TRAINER → SCHEDULE_INCOMPLETE; recepción (STAFF heredado) registra igual; la configuración no se toca", async () => {
      await setPolicy(db, T1, { ...MODALITIES_ON, timezone: null, apply_policy_to_open: false });
      const ses = await legacyOpen("America/El_Salvador", -30);
      const m = await member(ses, "OPEN", new Date(Date.now() - 3 * HOUR));
      expect(await attend(m.bookingId, AS_TRAINER)).toMatchObject({ ok: false, code: "SCHEDULE_INCOMPLETE" });
      expect(await attend(m.bookingId, AS_RC)).toMatchObject({ ok: true });
      // Ninguna zona por defecto se escribió en la organización.
      expect((await db.gymSettings.findUniqueOrThrow({ where: { gym_id: T1 } })).timezone).toBeNull();
    });

    it("preflight: MISSING / NO_SETTINGS / INVALID se detectan en solo lectura; la zona válida no aparece", async () => {
      await setPolicy(db, T1, { ...MODALITIES_ON, timezone: null });
      expect(await loadGymTimezoneStatus(db, T1)).toEqual({ ok: false, issue: "MISSING" });
      // T2 no tiene fila gym_settings en esta base.
      await db.gymSettings.deleteMany({ where: { gym_id: T2 } });
      const rows = await findGymsWithoutValidTimezone(db);
      expect(rows.map((r) => [r.tenantId, r.issue])).toEqual([
        [T1, "MISSING"],
        [T2, "NO_SETTINGS"],
      ]);
      await setPolicy(db, T1, { ...MODALITIES_ON, timezone: "America/Bogota" });
      expect(await loadGymTimezoneStatus(db, T1)).toEqual({ ok: true, timezone: "America/Bogota" });
      expect((await findGymsWithoutValidTimezone(db)).map((r) => r.tenantId)).toEqual([T2]);
      expect(evaluateGymTimezone({ timezone: "Mars/Olympus" })).toEqual({ ok: false, issue: "INVALID" });
      expect(evaluateGymTimezone({ timezone: "  " })).toEqual({ ok: false, issue: "MISSING" });
    });

    it("zona guardada inválida → el motor la ignora (SCHEDULE_INCOMPLETE) y el preflight la marca INVALID", async () => {
      await db.gymSettings.update({ where: { gym_id: T1 }, data: { timezone: "Mars/Olympus" } });
      expect(await loadGymTimezoneStatus(db, T1)).toEqual({ ok: false, issue: "INVALID" });
      const ses = await legacyOpen("America/El_Salvador", -30);
      const m = await member(ses, "OPEN", new Date(Date.now() - 3 * HOUR));
      expect(await attend(m.bookingId, AS_TRAINER)).toMatchObject({ ok: false, code: "SCHEDULE_INCOMPLETE" });
    });

    for (const tz of ["America/El_Salvador", "America/New_York", "Europe/Madrid", "Australia/Sydney", "Asia/Kolkata"]) {
      it(`con timezone ${tz}: OPEN heredado en hora local → en curso registra, futura NOT_STARTED`, async () => {
        await setPolicy(db, T1, { ...MODALITIES_ON, timezone: tz, apply_policy_to_open: false });
        const running = await legacyOpen(tz, -30);
        const future = await legacyOpen(tz, 90);
        const m1 = await member(running, "OPEN", new Date(Date.now() - 3 * HOUR));
        const m2 = await member(future, "OPEN", new Date(Date.now() - 3 * HOUR));
        expect(await attend(m1.bookingId, AS_TRAINER)).toMatchObject({ ok: true });
        expect(await attend(m2.bookingId, AS_TRAINER)).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
      });
    }

    it("DST: el instante de una OPEN heredada sigue la zona del gimnasio a ambos lados del cambio de hora", async () => {
      // America/New_York adelanta el 2026-03-08; Europe/Madrid atrasa el 2026-10-25.
      const cases = [
        { tz: "America/New_York", date: "2026-03-07", startUtc: "2026-03-07T12:00:00.000Z" },
        { tz: "America/New_York", date: "2026-03-09", startUtc: "2026-03-09T11:00:00.000Z" },
        { tz: "Europe/Madrid", date: "2026-10-24", startUtc: "2026-10-24T05:00:00.000Z" },
        { tz: "Europe/Madrid", date: "2026-10-26", startUtc: "2026-10-26T06:00:00.000Z" },
      ];
      for (const c of cases) {
        await setPolicy(db, T1, { ...MODALITIES_ON, timezone: c.tz, apply_policy_to_open: false });
        const ses = await createSession(db, { kind: "OPEN", date: c.date, start: "07:00", end: "08:00" });
        const m = await member(ses, "OPEN", new Date(Date.parse(c.startUtc) - 3 * HOUR));
        const at = Date.parse(c.startUtc);
        // Un minuto antes del instante local → aún no empieza; un minuto después → registra.
        expect(await attend(m.bookingId, AS_TRAINER, new Date(at - 60_000))).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
        expect(await attend(m.bookingId, AS_TRAINER, new Date(at + 60_000))).toMatchObject({ ok: true });
      }
    });
  });

  // ── H03 ─────────────────────────────────────────────────────────
  describe("H03 · actividades solo después del inicio real", () => {
    beforeEach(async () => {
      await setPolicy(db, T1, { ...MODALITIES_ON, apply_policy_to_open: false });
    });
    afterEach(async () => {
      await setPolicy(db, T1, MODALITIES_ON);
    });

    it("STAFF + OPEN + apply_policy_to_open=false, clase futura: SA/BA no registran actividades; la asistencia heredada sigue igual", async () => {
      const ses = await createSession(db, { kind: "OPEN", startsAt: new Date(Date.now() + 2 * HOUR) });
      const m = await member(ses, "OPEN", new Date());
      expect(await sessionActivity(ses, AS_SA)).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
      expect(await sessionActivity(ses, AS_BA)).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
      expect(await sessionActivity(ses, AS_TRAINER)).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
      // Regla histórica intacta: el check-in STAFF de OPEN sin política no tiene ventana.
      expect(await attend(m.bookingId, AS_RC)).toMatchObject({ ok: true });
      const att = await db.classAttendance.findFirstOrThrow({ where: { booking_id: m.bookingId } });
      expect(
        await acts.addAttendanceActivity({ scope: SA_SCOPE, actor: SA1, channel: "STAFF", attendanceId: att.id, activityId: ACT.squat })
      ).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
      expect(await db.scheduledClassActivity.count({ where: { scheduled_class_id: ses } })).toBe(0);
      expect(await db.classAttendanceActivity.count({ where: { attendance_id: att.id } })).toBe(0);
    });

    it("OPEN heredada sin starts_at y futura (zona válida): STAFF tampoco registra actividades", async () => {
      const s = wall(new Date(Date.now() + 2 * HOUR), "America/El_Salvador");
      const ses = await createSession(db, { kind: "OPEN", date: s.date, start: s.hhmm, end: "23:59" });
      expect(await sessionActivity(ses, AS_SA)).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
    });

    it("OPEN sin zona ni starts_at: STAFF no puede probar el inicio → SCHEDULE_INCOMPLETE (sin excepción heredada)", async () => {
      await setPolicy(db, T1, { ...MODALITIES_ON, timezone: null, apply_policy_to_open: false });
      const s = wall(new Date(Date.now() - HOUR), "America/El_Salvador");
      const ses = await createSession(db, { kind: "OPEN", date: s.date, start: s.hhmm, end: "23:59" });
      expect(await sessionActivity(ses, AS_SA)).toMatchObject({ ok: false, code: "SCHEDULE_INCOMPLETE" });
    });

    it("clase en curso: entrenador, SA y BA registran (una fila por actividad)", async () => {
      const ses = await createSession(db, { kind: "OPEN", startsAt: new Date(Date.now() - HOUR / 2) });
      expect(await sessionActivity(ses, AS_TRAINER)).toMatchObject({ ok: true, value: { created: true } });
      expect(await sessionActivity(ses, AS_SA, ACT.squat)).toMatchObject({ ok: true, value: { created: true } });
      expect(await sessionActivity(ses, AS_BA, ACT.bike)).toMatchObject({ ok: true, value: { created: true } });
    });

    it("clase finalizada fuera de plazo: el entrenador no; SA/BA sí, como corrección administrativa", async () => {
      const ses = await createSession(db, { kind: "OPEN", startsAt: new Date(Date.now() - 60 * HOUR) });
      expect(await sessionActivity(ses, AS_TRAINER)).toMatchObject({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
      expect(await sessionActivity(ses, AS_BA)).toMatchObject({ ok: true });
      const closed = await createSession(db, { kind: "GROUP", startsAt: new Date(Date.now() - 2 * HOUR), status: "completed" });
      expect(await sessionActivity(closed, AS_TRAINER)).toMatchObject({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
      expect(await sessionActivity(closed, AS_SA)).toMatchObject({ ok: true });
    });

    it("clase marcada completed antes de su inicio: nadie registra actividades", async () => {
      const ses = await createSession(db, { kind: "OPEN", startsAt: new Date(Date.now() + 3 * HOUR), status: "completed" });
      expect(await sessionActivity(ses, AS_SA)).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
      expect(await sessionActivity(ses, AS_TRAINER)).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
    });

    it("clase cancelada: SESSION_NOT_BOOKABLE para todos", async () => {
      const ses = await createSession(db, { kind: "OPEN", startsAt: new Date(Date.now() - HOUR / 2), status: "cancelled" });
      for (const who of [AS_TRAINER, AS_SA, AS_BA]) {
        expect(await sessionActivity(ses, who)).toMatchObject({ ok: false, code: "SESSION_NOT_BOOKABLE" });
      }
    });

    it("recepción sigue sin registrar actividades", async () => {
      const ses = await createSession(db, { kind: "OPEN", startsAt: new Date(Date.now() - HOUR / 2) });
      expect(await sessionActivity(ses, AS_RC)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    });
  });

  // ── H04 ─────────────────────────────────────────────────────────
  describe("H04 · revocación concurrente del entrenador", () => {
    afterEach(async () => {
      await db.trainer.update({ where: { id: TRAINER_A }, data: { status: "active", user_id: USERS.trainerA } });
    });

    const REVOKE = {
      deactivate: () => db.trainer.update({ where: { id: TRAINER_A }, data: { status: "inactive" } }),
      relink: () => db.trainer.update({ where: { id: TRAINER_A }, data: { user_id: RELINK_USER } }),
    };

    /**
     * 1) `holdSql` bloquea una fila que la operación toma DESPUÉS de autorizar;
     * 2) la operación queda esperando (barrera: 1 conexión en Lock);
     * 3) se revoca al entrenador desde otra conexión;
     * 4) se observa si la revocación confirmó mientras la operación seguía
     *    en vuelo (o si quedó esperando: 2 conexiones en Lock);
     * 5) se libera y se recoge el resultado.
     */
    async function race<R extends { ok: boolean }>(
      holdSql: (tx: Prisma.TransactionClient) => Promise<unknown>,
      op: () => Promise<R>,
      revoke: () => Promise<unknown>
    ) {
      const h = await hold(holdSql);
      const p = op();
      await waitForLockWaiters(it4.name, 1);
      let revokeDone = false;
      const r = revoke().then(() => (revokeDone = true));
      let revokedInFlight: boolean;
      for (;;) {
        if (revokeDone) {
          revokedInFlight = true;
          break;
        }
        try {
          await waitForLockWaiters(it4.name, 2, 25);
          revokedInFlight = false;
          break;
        } catch {
          // ni confirmó ni espera todavía: seguir observando
        }
      }
      h.release();
      await h.done;
      const result = await p;
      await r;
      return { result, revokedInFlight };
    }

    const lockBooking = (bookingId: string) => (tx: Prisma.TransactionClient) =>
      tx.$queryRawUnsafe(`SELECT id FROM class_bookings WHERE id = $1 FOR UPDATE`, bookingId);
    const lockActivityRow = (activityId: string) => (tx: Prisma.TransactionClient) =>
      tx.$queryRawUnsafe(`SELECT id FROM gym_activities WHERE id = $1 FOR UPDATE`, activityId);

    async function runningGroup() {
      const ses = await createSession(db, { kind: "GROUP", startsAt: new Date(Date.now() - HOUR / 2), capacity: 4 });
      const m = await member(ses, "GROUP", new Date(Date.now() - 3 * HOUR));
      return { ses, m };
    }

    for (const [name, revoke] of Object.entries(REVOKE)) {
      it(`asistencia TRAINER vs ${name}: la revocación espera y la escritura queda antes de ella`, async () => {
        const { ses, m } = await runningGroup();
        const { result, revokedInFlight } = await race(lockBooking(m.bookingId), () => attend(m.bookingId, AS_TRAINER), revoke);
        // Serializado: la revocación espera al lock del entrenador y la escritura queda antes.
        expect({ revokedInFlight, ok: result.ok }).toEqual({ revokedInFlight: false, ok: true });
        // Después de la revocación el entrenador ya no opera.
        expect(await attend(m.bookingId, AS_TRAINER)).toMatchObject({ ok: false, code: "FORBIDDEN" });
        expect(await db.classAttendance.count({ where: { scheduled_class_id: ses } })).toBe(1);
      });

      it(`actividad común TRAINER vs ${name}`, async () => {
        const { ses } = await runningGroup();
        const { result, revokedInFlight } = await race(lockActivityRow(ACT.warm), () => sessionActivity(ses, AS_TRAINER), revoke);
        // Serializado: la revocación espera al lock del entrenador y la escritura queda antes.
        expect({ revokedInFlight, ok: result.ok }).toEqual({ revokedInFlight: false, ok: true });
        expect(await sessionActivity(ses, AS_TRAINER, ACT.squat)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      });
    }

    it("actividad individual TRAINER vs desactivación", async () => {
      const { m } = await runningGroup();
      expect(await attend(m.bookingId, AS_TRAINER)).toMatchObject({ ok: true });
      const att = await db.classAttendance.findFirstOrThrow({ where: { booking_id: m.bookingId } });
      const { result, revokedInFlight } = await race(
        lockActivityRow(ACT.bike),
        () => acts.addAttendanceActivity({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", attendanceId: att.id, activityId: ACT.bike }),
        REVOKE.deactivate
      );
      expect({ revokedInFlight, ok: result.ok }).toEqual({ revokedInFlight: false, ok: true });
    });

    it("nota privada TRAINER vs cambio de user_id", async () => {
      const { m } = await runningGroup();
      expect(await attend(m.bookingId, AS_TRAINER)).toMatchObject({ ok: true });
      const { result, revokedInFlight } = await race(
        lockBooking(m.bookingId),
        () => svc.updateTrainingNotes({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", bookingId: m.bookingId, trainingNotes: "n", idempotencyKey: key() }),
        REVOKE.relink
      );
      expect({ revokedInFlight, ok: result.ok }).toEqual({ revokedInFlight: false, ok: true });
    });

    it("revocación primero (sin confirmar): la operación espera y, al confirmarse, falla FORBIDDEN", async () => {
      const { ses, m } = await runningGroup();
      const h = await hold((tx) => tx.$executeRawUnsafe(`UPDATE trainers SET status = 'inactive' WHERE id = $1`, TRAINER_A));
      const p1 = attend(m.bookingId, AS_TRAINER);
      const p2 = sessionActivity(ses, AS_TRAINER);
      try {
        await waitForLockWaiters(it4.name, 2);
      } finally {
        h.release();
        await h.done;
      }
      expect(await p1).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await p2).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await db.classAttendance.count({ where: { scheduled_class_id: ses } })).toBe(0);
    });

    it("STAFF no toma el lock del entrenador: la desactivación no espera a una asistencia de recepción", async () => {
      const { m } = await runningGroup();
      const h = await hold(lockBooking(m.bookingId));
      const p = attend(m.bookingId, AS_RC);
      await waitForLockWaiters(it4.name, 1);
      await REVOKE.deactivate(); // confirma sin esperar
      h.release();
      await h.done;
      expect(await p).toMatchObject({ ok: true });
    });
  });
});
