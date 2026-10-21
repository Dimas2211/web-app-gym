// ─────────────────────────────────────────────────────────────────
// GYM-4 — operación del entrenador contra PostgreSQL REAL desechable
// (se omite sin GYM_BOOKING_IT_*; ver testing/pg-it-harness.ts).
//
//  A–C   identidad: Trainer activo vinculado, sin usuario, inactivo
//  D–J   agenda OPEN / PERSONALIZED / GROUP, asignación, sede, tenant
//  M–T   asistencia por canal TRAINER, idempotencia, ventana R32, cierre,
//        corrección administrativa
//  U–Y   actividades comunes / individuales, tenant, sede, desactivada
//  Z     notas privadas (R36) sin fingir check-in; portal sin notas
//  C1–C10 concurrencia con conexiones independientes y sincronización
//        observable (pg_stat_activity), sin sleeps; Shared y Dedicated
// ─────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { GymSessionKind, Prisma, PrismaClient } from "@prisma/client";
import { createGymBookingService } from "../booking/booking-service";
import { createSessionActivityService } from "../booking/session-activities";
import type { GymBookingActor, GymBookingScope } from "../booking/booking-contracts";
import { createItDatabase, disconnectAdmin, IT_ENABLED, waitForLockWaiters, type ItDatabase } from "../booking/testing/pg-it-harness";
import {
  actor,
  B1,
  B1B,
  BA1,
  createMember,
  createSession,
  invariantViolations,
  key,
  MODALITIES_ON,
  NO_VIOLATIONS,
  RC1,
  SA2,
  seedBase,
  setPolicy,
  staffBook,
  T1,
  T2,
  TRAINER_A,
  TRAINER_C,
  TRAINER_Z,
  USERS,
} from "../booking/testing/booking-fixtures";
import { resolveLinkedTrainer, resolveSessionOperator } from "./trainer-access";
import { getSessionTrainingDetail, getTrainerAgenda } from "./trainer-queries";
import { getMyAttendance, loadPortalBookings } from "@/modules/client-portal/queries";

const HOUR = 3_600_000;
const TRAINER: GymBookingActor = actor(USERS.trainerA, "trainer");
const TRAINER_OTHER: GymBookingActor = actor(USERS.trainerC, "trainer");
const TSCOPE: GymBookingScope = { tenantId: T1, locationId: B1 };
const SEDE: GymBookingScope = { tenantId: T1, locationId: B1 };
const T2_SCOPE: GymBookingScope = { tenantId: T2, locationId: null };

const ACT = {
  warm: "it-act-warm", // global
  circuit: "it-act-circuit", // sede B1
  stretch: "it-act-stretch", // global
  squat: "it-act-squat",
  bench: "it-act-bench",
  bike: "it-act-bike",
  mobility: "it-act-mobility",
  treadmill: "it-act-treadmill",
  otherBranch: "it-act-b1b", // sede B1B
  inactive: "it-act-off",
  t2: "it-act-t2", // tenant 2, mismo nombre que warm
};

describe.skipIf(!IT_ENABLED)("GYM-4 — operación del entrenador (PostgreSQL real)", () => {
  let it4: ItDatabase;
  let db: PrismaClient;
  let svc: ReturnType<typeof createGymBookingService>;
  let acts: ReturnType<typeof createSessionActivityService>;
  let retries = 0;

  beforeAll(async () => {
    it4 = await createItDatabase();
    db = it4.db;
    await seedBase(db);
    await setPolicy(db, T1, MODALITIES_ON);
    await setPolicy(db, T2, MODALITIES_ON);
    const a = (id: string, name: string, extra: { tenant?: string; location?: string | null; status?: "active" | "inactive" } = {}) => ({
      id,
      tenant_id: extra.tenant ?? T1,
      location_id: extra.location ?? null,
      name,
      status: extra.status ?? "active",
    });
    await db.gymActivity.createMany({
      data: [
        a(ACT.warm, "Calentamiento"),
        a(ACT.circuit, "Circuito funcional", { location: B1 }),
        a(ACT.stretch, "Estiramiento"),
        a(ACT.squat, "Sentadilla"),
        a(ACT.bench, "Press de banca"),
        a(ACT.bike, "Bicicleta"),
        a(ACT.mobility, "Movilidad"),
        a(ACT.treadmill, "Caminadora"),
        a(ACT.otherBranch, "Remo sede 1B", { location: B1B }),
        a(ACT.inactive, "Actividad retirada", { status: "inactive" }),
        a(ACT.t2, "Calentamiento", { tenant: T2 }),
      ],
    });
    svc = createGymBookingService(db, { onRetry: () => void retries++ });
    acts = createSessionActivityService(db);
  }, 180_000);

  afterEach(async () => {
    expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
  });

  afterAll(async () => {
    await it4?.drop();
    await disconnectAdmin();
  });

  // ── helpers ─────────────────────────────────────────────────────

  /** Sesión del entrenador A con `n` alumnos reservados (reserva hecha antes del inicio). */
  async function sessionWithMembers(kind: GymSessionKind, startsAt: Date, n = 1, extra: { trainer?: string; branch?: string } = {}) {
    const ses = await createSession(db, {
      kind,
      trainer: extra.trainer ?? TRAINER_A,
      branch: extra.branch,
      startsAt,
      durationMinutes: 60,
      capacity: Math.max(n, 2),
    });
    const modality = kind === "OPEN" ? "NORMAL" : kind;
    const members = [];
    for (let i = 0; i < n; i++) {
      const m = await createMember(db, {
        modality,
        branch: extra.branch,
        sessionsTotal: kind === "OPEN" ? null : 8,
        trainerId: kind === "PERSONALIZED" ? (extra.trainer ?? TRAINER_A) : null,
      });
      const b = await svc.bookSession({ ...staffBook(ses, m.clientId), now: new Date(startsAt.getTime() - 3 * HOUR) });
      if (!b.ok) throw new Error(`booking ${b.code}`);
      members.push({ ...m, bookingId: b.value.bookingId });
    }
    return { ses, members };
  }

  const startedAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  const attend = (bookingId: string, status: "attended" | "late" | "absent", extra: Partial<Parameters<typeof svc.recordAttendance>[0]> = {}) =>
    svc.recordAttendance({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", bookingId, status, idempotencyKey: key(), ...extra });

  const attendanceOf = (sessionId: string, clientId: string) =>
    db.classAttendance.findUnique({ where: { scheduled_class_id_client_id: { scheduled_class_id: sessionId, client_id: clientId } } });

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

  // ── A–C identidad ───────────────────────────────────────────────
  describe("A–C · identidad del entrenador", () => {
    it("A entrenador activo con usuario vinculado → canal TRAINER con su Trainer.id", async () => {
      expect(await resolveLinkedTrainer(db, USERS.trainerA, T1)).toMatchObject({ id: TRAINER_A, branch_id: B1 });
      const op = await resolveSessionOperator({ effectiveUser: { id: USERS.trainerA, role: "trainer" }, tenantId: T1, client: db }, { allowAdmin: true });
      expect(op).toMatchObject({ ok: true, channel: "TRAINER", trainerId: TRAINER_A });
    });

    it("B usuario trainer sin perfil vinculado (o perfil sin usuario) → sin acceso y sin permisos por defecto", async () => {
      await db.user.create({
        data: { id: "it-user-trainer-nolink", tenant_id: T1, gym_id: T1, branch_id: B1, email: "nolink@it.invalid", password_hash: "x", first_name: "N", last_name: "L", role: "trainer" },
      });
      expect(await resolveLinkedTrainer(db, "it-user-trainer-nolink", T1)).toBeNull();
      const op = await resolveSessionOperator({ effectiveUser: { id: "it-user-trainer-nolink", role: "trainer" }, tenantId: T1, client: db }, { allowAdmin: true });
      expect(op.ok).toBe(false);
      // Trainer "it-trainer-b" no tiene usuario: ningún usuario lo resuelve.
      expect(await db.trainer.count({ where: { id: "it-trainer-b", user_id: { not: null } } })).toBe(0);
    });

    it("C entrenador inactivo → no se resuelve y el motor rechaza su canal TRAINER (FORBIDDEN)", async () => {
      const { ses, members } = await sessionWithMembers("OPEN", startedAgo(20), 1, { trainer: TRAINER_C });
      await db.trainer.update({ where: { id: TRAINER_C }, data: { status: "inactive" } });
      try {
        expect(await resolveLinkedTrainer(db, USERS.trainerC, T1)).toBeNull();
        const r = await svc.recordAttendance({ scope: TSCOPE, actor: TRAINER_OTHER, channel: "TRAINER", bookingId: members[0].bookingId, status: "attended", idempotencyKey: key() });
        expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
        const a = await acts.addSessionActivity({ scope: TSCOPE, actor: TRAINER_OTHER, channel: "TRAINER", sessionId: ses, activityId: ACT.warm });
        expect(a).toMatchObject({ ok: false, code: "FORBIDDEN" });
        expect(await attendanceOf(ses, members[0].clientId)).toBeNull();
      } finally {
        await db.trainer.update({ where: { id: TRAINER_C }, data: { status: "active" } });
      }
    });

    it("roles sin canal: recepción y alumno no operan el registro de entrenamiento", async () => {
      const ctx = (role: string) => ({ effectiveUser: { id: USERS.rc1, role }, tenantId: T1, client: db });
      expect((await resolveSessionOperator(ctx("reception"), { allowAdmin: true })).ok).toBe(false);
      expect((await resolveSessionOperator(ctx("client"), { allowAdmin: true })).ok).toBe(false);
      expect((await resolveSessionOperator({ ...ctx("branch_admin"), effectiveUser: { id: USERS.ba1, role: "branch_admin" } }, { allowAdmin: false })).ok).toBe(false);
    });
  });

  // ── D–J agenda ──────────────────────────────────────────────────
  describe("D–J · agenda del entrenador", () => {
    // 2026-10-22 03:00Z = 2026-10-21 21:00 en El Salvador: el día local NO es el día UTC.
    const NOW = new Date("2026-10-22T03:00:00.000Z");

    it("D/E/F hoy, próximas y anteriores con OPEN, PERSONALIZED y GROUP; solo sesiones asignadas", async () => {
      const mk = (date: string, kind: GymSessionKind, trainer = TRAINER_A, tenant = T1) =>
        createSession(db, { date, start: "18:00", end: "19:00", kind, trainer, tenant });
      const todayOpen = await mk("2026-10-21", "OPEN");
      const todayPers = await mk("2026-10-21", "PERSONALIZED");
      const todayGroup = await mk("2026-10-21", "GROUP");
      const upcoming = await mk("2026-10-22", "GROUP");
      const past = await mk("2026-10-20", "PERSONALIZED");
      const otherTrainer = await mk("2026-10-21", "OPEN", TRAINER_C);
      const otherTenant = await mk("2026-10-21", "OPEN", TRAINER_Z, T2);
      const cancelled = await mk("2026-10-21", "OPEN");
      await db.scheduledClass.update({ where: { id: cancelled }, data: { status: "cancelled" } });

      const agenda = await getTrainerAgenda(db, T1, TRAINER_A, NOW);
      expect(agenda.today).toBe("2026-10-21");
      const ids = (l: { id: string }[]) => l.map((s) => s.id);
      expect(ids(agenda.todaySessions)).toEqual(expect.arrayContaining([todayOpen, todayPers, todayGroup, cancelled]));
      expect(new Set(agenda.todaySessions.map((s) => s.session_kind))).toEqual(new Set(["OPEN", "PERSONALIZED", "GROUP"]));
      expect(ids(agenda.upcoming)).toContain(upcoming);
      expect(ids(agenda.past)).toContain(past);
      const all = [...agenda.todaySessions, ...agenda.upcoming, ...agenda.past];
      expect(ids(all)).not.toContain(otherTrainer);
      expect(ids(all)).not.toContain(otherTenant);
      // Cancelada visible con su estado (no se oculta al entrenador).
      expect(agenda.todaySessions.find((s) => s.id === cancelled)?.status).toBe("cancelled");
      // Campos de presentación: sede, tipo, cupo, reservas.
      expect(agenda.todaySessions[0]).toMatchObject({ branch: { name: expect.any(String) }, class_type: { name: expect.any(String) } });
    });

    it("G/H detalle: sesión asignada visible; la de otro entrenador no pasa el filtro de asignación", async () => {
      const mine = await createSession(db, { trainer: TRAINER_A });
      const theirs = await createSession(db, { trainer: TRAINER_C });
      const d1 = await getSessionTrainingDetail(db, T1, mine, { includePrivateNotes: false });
      const d2 = await getSessionTrainingDetail(db, T1, theirs, { includePrivateNotes: false });
      expect(d1?.session.trainer.id).toBe(TRAINER_A);
      expect(d2?.session.trainer.id).not.toBe(TRAINER_A); // la página responde notFound
    });

    it("J sesión de otro tenant: el detalle no la resuelve (tenant explícito)", async () => {
      const t2ses = await createSession(db, { tenant: T2 });
      expect(await getSessionTrainingDetail(db, T1, t2ses, { includePrivateNotes: true })).toBeNull();
    });
  });

  // ── M–T asistencia ──────────────────────────────────────────────
  describe("M–T · asistencia por canal TRAINER", () => {
    it("M/N/O asistió, llegó tarde, no asistió (GROUP en curso); checked_in_at solo en asistió", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30), 3);
      const statuses = ["attended", "late", "absent"] as const;
      for (let i = 0; i < 3; i++) {
        const r = await attend(members[i].bookingId, statuses[i]);
        expect(r.ok).toBe(true);
        const a = await attendanceOf(ses, members[i].clientId);
        expect(a?.attendance_status).toBe(statuses[i]);
        expect(a?.recorded_by_user_id).toBe(USERS.trainerA);
        expect(a?.checked_in_at === null).toBe(statuses[i] !== "attended");
      }
      const ops = await db.gymBookingOperation.findMany({ where: { target_id: { in: members.map((m) => m.bookingId) } } });
      expect(ops.every((o) => o.channel === "TRAINER" && o.actor_user_id === USERS.trainerA)).toBe(true);
      // La asistencia no cambia la reserva ni el consumo (R31: el ausente sigue consumido).
      const b = await db.classBooking.findUniqueOrThrow({ where: { id: members[2].bookingId } });
      expect(b).toMatchObject({ booking_status: "confirmed", consumption: "CONSUMED" });
    });

    it("M PERSONALIZED y OPEN también se registran por el entrenador asignado", async () => {
      for (const kind of ["PERSONALIZED", "OPEN"] as const) {
        const { ses, members } = await sessionWithMembers(kind, startedAgo(15));
        expect((await attend(members[0].bookingId, "attended")).ok).toBe(true);
        expect((await attendanceOf(ses, members[0].clientId))?.attendance_status).toBe("attended");
      }
    });

    it("P doble registro con la misma clave → replay, 1 operación y 1 evento", async () => {
      const { members } = await sessionWithMembers("GROUP", startedAgo(30));
      const k = key();
      const r1 = await attend(members[0].bookingId, "attended", { idempotencyKey: k });
      const r2 = await attend(members[0].bookingId, "attended", { idempotencyKey: k });
      expect(r1).toMatchObject({ ok: true, replayed: false });
      expect(r2).toMatchObject({ ok: true, replayed: true });
      expect(await db.gymBookingOperation.count({ where: { tenant_id: T1, idempotency_key: k } })).toBe(1);
      expect(await db.classBookingEvent.count({ where: { booking_id: members[0].bookingId, event_type: { in: ["ATTENDANCE_RECORDED", "ATTENDANCE_UPDATED"] } } })).toBe(1);
    });

    it("Q antes del inicio → ATTENDANCE_NOT_STARTED, sin asistencia", async () => {
      const startsAt = new Date(Date.now() + 2 * HOUR);
      const { ses, members } = await sessionWithMembers("GROUP", startsAt);
      expect(await attend(members[0].bookingId, "attended")).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
      expect(await attendanceOf(ses, members[0].clientId)).toBeNull();
    });

    it("R fuera de ventana (fin + 48 h) → ATTENDANCE_WINDOW_CLOSED; T: BA corrige como corrección administrativa", async () => {
      const startsAt = new Date(Date.now() - 50 * HOUR);
      const { ses, members } = await sessionWithMembers("GROUP", startsAt);
      expect(await attend(members[0].bookingId, "attended")).toMatchObject({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
      const r = await svc.recordAttendance({ scope: SEDE, actor: BA1, channel: "STAFF", bookingId: members[0].bookingId, status: "late", idempotencyKey: key() });
      expect(r.ok).toBe(true);
      const ev = await db.classBookingEvent.findFirstOrThrow({ where: { booking_id: members[0].bookingId, event_type: "ATTENDANCE_RECORDED" } });
      expect(ev.metadata).toMatchObject({ administrative_correction: true });
      // Tras la corrección, el entrenador sigue sin poder editar.
      expect(await attend(members[0].bookingId, "attended")).toMatchObject({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
      expect((await attendanceOf(ses, members[0].clientId))?.attendance_status).toBe("late");
    });

    it("S sesión cerrada (completed) → el entrenador no edita; recepción tampoco obtiene notas", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30));
      expect((await attend(members[0].bookingId, "attended")).ok).toBe(true);
      await db.scheduledClass.update({ where: { id: ses }, data: { status: "completed", completed_at: new Date() } });
      expect(await attend(members[0].bookingId, "absent")).toMatchObject({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
      const n = await svc.updateTrainingNotes({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", bookingId: members[0].bookingId, trainingNotes: "tarde", idempotencyKey: key() });
      expect(n).toMatchObject({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
      const rc = await svc.updateTrainingNotes({ scope: SEDE, actor: RC1, channel: "STAFF", bookingId: members[0].bookingId, trainingNotes: "x", idempotencyKey: key() });
      expect(rc).toMatchObject({ ok: false, code: "FORBIDDEN" });
    });

    it("H/I/J IDs manipulados: sesión de otro entrenador, otra sede y otro tenant", async () => {
      const other = await sessionWithMembers("OPEN", startedAgo(20), 1, { trainer: TRAINER_C });
      expect(await attend(other.members[0].bookingId, "attended")).toMatchObject({ ok: false, code: "FORBIDDEN" });
      const otherBranch = await sessionWithMembers("OPEN", startedAgo(20), 1, { trainer: "it-trainer-b", branch: B1B });
      expect(await attend(otherBranch.members[0].bookingId, "attended")).toMatchObject({ ok: false, code: "FORBIDDEN" });
      // Tenant 2: la reserva no existe en el tenant del contexto.
      const t2ses = await createSession(db, { tenant: T2, startsAt: startedAgo(20) });
      const t2m = await createMember(db, { tenant: T2 });
      const t2b = await svc.bookSession({ scope: T2_SCOPE, actor: SA2, channel: "STAFF", sessionId: t2ses, clientId: t2m.clientId, idempotencyKey: key() });
      if (!t2b.ok) throw new Error(t2b.code);
      expect(await attend(t2b.value.bookingId, "attended")).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await db.classAttendance.count({ where: { booking_id: { in: [other.members[0].bookingId, otherBranch.members[0].bookingId, t2b.value.bookingId] } } })).toBe(0);
    });

    it("I asignación manda: sesión OPEN de otra sede asignada al entrenador A → la opera", async () => {
      const { ses, members } = await sessionWithMembers("OPEN", startedAgo(20), 1, { branch: B1B });
      expect((await attend(members[0].bookingId, "attended")).ok).toBe(true);
      expect((await attendanceOf(ses, members[0].clientId))?.attendance_status).toBe("attended");
    });

    it("sesión cancelada → SESSION_NOT_BOOKABLE para asistencia, notas y actividades", async () => {
      const { ses, members } = await sessionWithMembers("OPEN", startedAgo(20));
      await db.scheduledClass.update({ where: { id: ses }, data: { status: "cancelled" } });
      expect(await attend(members[0].bookingId, "attended")).toMatchObject({ ok: false, code: "SESSION_NOT_BOOKABLE" });
      expect(await acts.addSessionActivity({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", sessionId: ses, activityId: ACT.warm })).toMatchObject({ ok: false, code: "SESSION_NOT_BOOKABLE" });
    });

    it("STAFF heredado intacto: recepción registra OPEN sin ventana por canal STAFF", async () => {
      const ses = await createSession(db, { kind: "OPEN", date: "2026-01-05", start: "07:00", end: "08:00" });
      const m = await createMember(db, {});
      const b = await svc.bookSession(staffBook(ses, m.clientId));
      if (!b.ok) throw new Error(b.code);
      expect((await svc.recordAttendance({ scope: SEDE, actor: RC1, channel: "STAFF", bookingId: b.value.bookingId, status: "attended", idempotencyKey: key() })).ok).toBe(true);
      // El mismo día pasado por canal TRAINER sí sigue R32.
      expect(await attend(b.value.bookingId, "absent")).toMatchObject({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
    });
  });

  // ── U–Y actividades ─────────────────────────────────────────────
  describe("U–Y · actividades impartidas", () => {
    const addCommon = (sessionId: string, activityId: string, extra: Partial<Parameters<typeof acts.addSessionActivity>[0]> = {}) =>
      acts.addSessionActivity({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", sessionId, activityId, ...extra });
    const addOwn = (attendanceId: string, activityId: string, extra: Partial<Parameters<typeof acts.addAttendanceActivity>[0]> = {}) =>
      acts.addAttendanceActivity({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", attendanceId, activityId, ...extra });

    it("U GROUP: 3 actividades comunes una sola vez por sesión, sin copias por alumno; repetir no duplica", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30), 3);
      for (const m of members) await attend(m.bookingId, "attended");
      for (const a of [ACT.warm, ACT.circuit, ACT.stretch]) {
        expect(await addCommon(ses, a, { notes: "10 min" })).toMatchObject({ ok: true, value: { created: true, sessionId: ses } });
      }
      expect(await addCommon(ses, ACT.warm)).toMatchObject({ ok: true, value: { created: false } });
      const rows = await db.scheduledClassActivity.findMany({ where: { scheduled_class_id: ses }, orderBy: { activity_name: "asc" } });
      expect(rows.map((r) => r.activity_name)).toEqual(["Calentamiento", "Circuito funcional", "Estiramiento"]);
      expect(rows.every((r) => r.tenant_id === T1 && r.created_by === USERS.trainerA)).toBe(true);
      const atts = await db.classAttendance.findMany({ where: { scheduled_class_id: ses }, select: { id: true } });
      expect(await db.classAttendanceActivity.count({ where: { attendance_id: { in: atts.map((a) => a.id) } } })).toBe(0);
    });

    it("V PERSONALIZED: actividades individuales por alumno; ausente o sin asistencia → ATTENDANCE_REQUIRED sin check-in ficticio", async () => {
      const { ses, members } = await sessionWithMembers("PERSONALIZED", startedAgo(30), 3);
      const [A, B, C] = members;
      await attend(A.bookingId, "attended");
      await attend(B.bookingId, "late");
      await attend(C.bookingId, "absent");
      const aAtt = (await attendanceOf(ses, A.clientId))!;
      const bAtt = (await attendanceOf(ses, B.clientId))!;
      const cAtt = (await attendanceOf(ses, C.clientId))!;
      for (const x of [ACT.squat, ACT.bench, ACT.bike]) expect((await addOwn(aAtt.id, x)).ok).toBe(true);
      for (const x of [ACT.mobility, ACT.treadmill]) expect((await addOwn(bAtt.id, x)).ok).toBe(true);
      expect(await addOwn(aAtt.id, ACT.squat)).toMatchObject({ ok: true, value: { created: false } });
      expect(await addOwn(cAtt.id, ACT.squat)).toMatchObject({ ok: false, code: "ATTENDANCE_REQUIRED" });
      const names = async (id: string) =>
        (await db.classAttendanceActivity.findMany({ where: { attendance_id: id }, orderBy: { activity_name: "asc" } })).map((r) => r.activity_name);
      expect(await names(aAtt.id)).toEqual(["Bicicleta", "Press de banca", "Sentadilla"]);
      expect(await names(bAtt.id)).toEqual(["Caminadora", "Movilidad"]);
      expect(await names(cAtt.id)).toEqual([]);
      // La actividad no altera la asistencia (no hay registro automático).
      expect((await attendanceOf(ses, C.clientId))?.attendance_status).toBe("absent");
      expect(await db.scheduledClassActivity.count({ where: { scheduled_class_id: ses } })).toBe(0);
    });

    it("V asistencia heredada sin reserva vinculada → ATTENDANCE_REQUIRED", async () => {
      const ses = await createSession(db, { startsAt: startedAgo(30) });
      const m = await createMember(db, {});
      const legacy = await db.classAttendance.create({
        data: { tenant_id: T1, scheduled_class_id: ses, client_id: m.clientId, attendance_status: "attended" },
      });
      expect(await addOwn(legacy.id, ACT.squat)).toMatchObject({ ok: false, code: "ATTENDANCE_REQUIRED" });
    });

    it("W/X/Y actividad de otro tenant, de otra sede o desactivada → ACTIVITY_UNAVAILABLE, sin filas", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30));
      await attend(members[0].bookingId, "attended");
      const att = (await attendanceOf(ses, members[0].clientId))!;
      for (const a of [ACT.t2, ACT.otherBranch, ACT.inactive, "no-existe"]) {
        expect(await addCommon(ses, a)).toMatchObject({ ok: false, code: "ACTIVITY_UNAVAILABLE" });
        expect(await addOwn(att.id, a)).toMatchObject({ ok: false, code: "ACTIVITY_UNAVAILABLE" });
      }
      expect(await db.scheduledClassActivity.count({ where: { scheduled_class_id: ses } })).toBe(0);
      expect(await db.classAttendanceActivity.count({ where: { attendance_id: att.id } })).toBe(0);
    });

    it("Y desactivar o renombrar el catálogo conserva el historial y su snapshot", async () => {
      const { ses } = await sessionWithMembers("GROUP", startedAgo(30));
      const temp = await db.gymActivity.create({ data: { tenant_id: T1, name: "Pliometría" } });
      expect((await addCommon(ses, temp.id)).ok).toBe(true);
      await db.gymActivity.update({ where: { id: temp.id }, data: { name: "Pliometría avanzada", status: "inactive" } });
      const row = await db.scheduledClassActivity.findFirstOrThrow({ where: { scheduled_class_id: ses, activity_id: temp.id } });
      expect(row.activity_name).toBe("Pliometría");
      // Desactivada: no se ofrece para nuevas altas.
      const other = await sessionWithMembers("GROUP", startedAgo(30));
      expect(await addCommon(other.ses, temp.id)).toMatchObject({ ok: false, code: "ACTIVITY_UNAVAILABLE" });
      const detail = await getSessionTrainingDetail(db, T1, other.ses, { includePrivateNotes: false });
      expect(detail?.catalog.map((c) => c.id)).not.toContain(temp.id);
      expect(detail?.catalog.map((c) => c.id)).not.toContain(ACT.otherBranch);
    });

    it("ventana: actividades antes del inicio o fuera de plazo → rechazo; SA/BA corrigen después", async () => {
      const future = await sessionWithMembers("GROUP", new Date(Date.now() + 2 * HOUR));
      expect(await addCommon(future.ses, ACT.warm)).toMatchObject({ ok: false, code: "ATTENDANCE_NOT_STARTED" });
      const old = await sessionWithMembers("GROUP", new Date(Date.now() - 50 * HOUR));
      expect(await addCommon(old.ses, ACT.warm)).toMatchObject({ ok: false, code: "ATTENDANCE_WINDOW_CLOSED" });
      expect((await acts.addSessionActivity({ scope: SEDE, actor: BA1, channel: "STAFF", sessionId: old.ses, activityId: ACT.warm })).ok).toBe(true);
      // Recepción no registra actividades (no adquiere privilegios de entrenador).
      expect(await acts.addSessionActivity({ scope: SEDE, actor: RC1, channel: "STAFF", sessionId: old.ses, activityId: ACT.stretch })).toMatchObject({ ok: false, code: "FORBIDDEN" });
      // BA de otra sede no alcanza la sesión.
      expect(
        await acts.addSessionActivity({ scope: { tenantId: T1, locationId: B1B }, actor: actor(USERS.ba1b, "branch_admin"), channel: "STAFF", sessionId: old.ses, activityId: ACT.stretch })
      ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    });

    it("otro entrenador o IDs de otro tenant no registran actividades", async () => {
      const { ses } = await sessionWithMembers("GROUP", startedAgo(30));
      expect(await acts.addSessionActivity({ scope: TSCOPE, actor: TRAINER_OTHER, channel: "TRAINER", sessionId: ses, activityId: ACT.warm })).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await acts.addSessionActivity({ scope: T2_SCOPE, actor: SA2, channel: "STAFF", sessionId: ses, activityId: ACT.t2 })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });
  });

  // ── Z notas privadas ────────────────────────────────────────────
  describe("Z · notas privadas (R36)", () => {
    it("guardar nota no cambia estado, check-in, quién registró ni la nota operativa; evento sin texto", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30));
      await svc.recordAttendance({ scope: SEDE, actor: RC1, channel: "STAFF", bookingId: members[0].bookingId, status: "attended", notes: "check-in recepción", idempotencyKey: key() });
      const before = (await attendanceOf(ses, members[0].clientId))!;
      const r = await svc.updateTrainingNotes({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", bookingId: members[0].bookingId, trainingNotes: "NOTA PRIVADA: rodilla izquierda", idempotencyKey: key() });
      expect(r.ok).toBe(true);
      const after = (await attendanceOf(ses, members[0].clientId))!;
      expect(after).toMatchObject({
        attendance_status: before.attendance_status,
        checked_in_at: before.checked_in_at,
        recorded_by_user_id: USERS.rc1,
        recorded_at: before.recorded_at,
        notes: "check-in recepción",
        training_notes: "NOTA PRIVADA: rodilla izquierda",
      });
      const ev = await db.classBookingEvent.findFirstOrThrow({ where: { booking_id: members[0].bookingId, event_type: "ATTENDANCE_UPDATED" } });
      expect(ev.metadata).toMatchObject({ change: "training_notes", attendance_from: "attended", attendance_to: "attended" });
      expect(JSON.stringify(ev.metadata)).not.toContain("rodilla");
      // Borrar la nota (texto vacío → null) también es una operación propia.
      expect((await svc.updateTrainingNotes({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", bookingId: members[0].bookingId, trainingNotes: null, idempotencyKey: key() })).ok).toBe(true);
      expect((await attendanceOf(ses, members[0].clientId))?.training_notes).toBeNull();
    });

    it("sin asistencia → ATTENDANCE_REQUIRED (no se crea check-in); otro entrenador y recepción → FORBIDDEN", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30));
      const n = await svc.updateTrainingNotes({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", bookingId: members[0].bookingId, trainingNotes: "x", idempotencyKey: key() });
      expect(n).toMatchObject({ ok: false, code: "ATTENDANCE_REQUIRED" });
      expect(await attendanceOf(ses, members[0].clientId)).toBeNull();
      await attend(members[0].bookingId, "attended");
      expect(await svc.updateTrainingNotes({ scope: TSCOPE, actor: TRAINER_OTHER, channel: "TRAINER", bookingId: members[0].bookingId, trainingNotes: "x", idempotencyKey: key() })).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await svc.updateTrainingNotes({ scope: SEDE, actor: RC1, channel: "STAFF", bookingId: members[0].bookingId, trainingNotes: "x", idempotencyKey: key() })).toMatchObject({ ok: false, code: "FORBIDDEN" });
      // Una key de asistencia no puede reutilizarse para notas.
      const k = key();
      await attend(members[0].bookingId, "late", { idempotencyKey: k });
      expect(await svc.updateTrainingNotes({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", bookingId: members[0].bookingId, trainingNotes: "x", idempotencyKey: k })).toMatchObject({ ok: false, code: "IDEMPOTENCY_KEY_REUSED" });
    });

    it("el portal del alumno nunca recibe training_notes; el detalle sin autorización tampoco", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30), 1);
      await attend(members[0].bookingId, "attended");
      await svc.updateTrainingNotes({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", bookingId: members[0].bookingId, trainingNotes: "NOTA PRIVADA Z", idempotencyKey: key() });
      const history = await getMyAttendance(members[0].clientId, db, T1);
      const client = await db.client.findUniqueOrThrow({ where: { id: members[0].clientId } });
      const bookings = await loadPortalBookings({ db, tenantId: T1, client });
      expect(JSON.stringify(history)).not.toContain("NOTA PRIVADA");
      expect(JSON.stringify(bookings)).not.toContain("NOTA PRIVADA");
      const detail = await getSessionTrainingDetail(db, T1, ses, { includePrivateNotes: false });
      expect(JSON.stringify(detail)).not.toContain("NOTA PRIVADA");
      expect(detail?.session.attendance[0]).not.toHaveProperty("training_notes");
      const authorized = await getSessionTrainingDetail(db, T1, ses, { includePrivateNotes: true });
      expect(authorized?.session.attendance[0].training_notes).toBe("NOTA PRIVADA Z");
    });
  });

  // ── C1–C10 concurrencia e aislamiento ───────────────────────────
  describe("C1–C10 · concurrencia (conexiones independientes, sin sleeps)", () => {
    const lockSession = (id: string) => (tx: Prisma.TransactionClient) =>
      tx.$queryRawUnsafe(`SELECT id FROM scheduled_classes WHERE id = $1 FOR UPDATE`, id);

    it("C1 dos registros simultáneos (claves distintas) de la misma reserva → 1 asistencia, 2 eventos, 0 reintentos", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30));
      retries = 0;
      const h = await hold(lockSession(ses));
      const p = [attend(members[0].bookingId, "attended"), attend(members[0].bookingId, "late")];
      await waitForLockWaiters(it4.name, 2);
      h.release();
      await h.done;
      const rs = await Promise.all(p);
      expect(rs.every((r) => r.ok)).toBe(true);
      expect(await db.classAttendance.count({ where: { scheduled_class_id: ses } })).toBe(1);
      const evs = await db.classBookingEvent.findMany({ where: { booking_id: members[0].bookingId, event_type: { in: ["ATTENDANCE_RECORDED", "ATTENDANCE_UPDATED"] } } });
      expect(evs.map((e) => e.event_type).sort()).toEqual(["ATTENDANCE_RECORDED", "ATTENDANCE_UPDATED"]);
      expect(retries).toBe(0);
    });

    it("C2 reintento simultáneo con la misma clave → una operación, un evento, un replay", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30));
      const k = key();
      const h = await hold(lockSession(ses));
      const p = [attend(members[0].bookingId, "attended", { idempotencyKey: k }), attend(members[0].bookingId, "attended", { idempotencyKey: k })];
      await waitForLockWaiters(it4.name, 2); // la primera espera la sesión; la segunda, el advisory lock de la key
      h.release();
      await h.done;
      const rs = await Promise.all(p);
      expect(rs.filter((r) => r.ok && r.replayed)).toHaveLength(1);
      expect(await db.gymBookingOperation.count({ where: { tenant_id: T1, idempotency_key: k } })).toBe(1);
      expect(await db.classBookingEvent.count({ where: { booking_id: members[0].bookingId } })).toBe(2); // BOOKED + ATTENDANCE_RECORDED
    });

    it("C3 reserva cancelada durante el intento de asistencia → NOT_CONFIRMED, sin asistencia ni interbloqueo", async () => {
      const { ses, members } = await sessionWithMembers("OPEN", startedAgo(30));
      retries = 0;
      const h = await hold(lockSession(ses));
      const cancel = svc.cancelBooking({ scope: SEDE, actor: BA1, channel: "STAFF", bookingId: members[0].bookingId, reason: "baja", idempotencyKey: key() });
      await waitForLockWaiters(it4.name, 1); // cancel: clients FOR UPDATE → espera la sesión
      const att = attend(members[0].bookingId, "attended");
      await waitForLockWaiters(it4.name, 2); // asistencia: clients KEY SHARE espera a la cancelación
      h.release();
      await h.done;
      expect((await cancel).ok).toBe(true);
      expect(await att).toMatchObject({ ok: false, code: "NOT_CONFIRMED" });
      expect(await attendanceOf(ses, members[0].clientId)).toBeNull();
      expect(retries).toBe(0);
    });

    it("C4 la sesión se cancela mientras se registra asistencia → SESSION_NOT_BOOKABLE", async () => {
      const { ses, members } = await sessionWithMembers("OPEN", startedAgo(30));
      const h = await hold((tx) => tx.$executeRawUnsafe(`UPDATE scheduled_classes SET status = 'cancelled' WHERE id = $1`, ses));
      const att = attend(members[0].bookingId, "attended");
      await waitForLockWaiters(it4.name, 1);
      h.release();
      await h.done;
      expect(await att).toMatchObject({ ok: false, code: "SESSION_NOT_BOOKABLE" });
      expect(await attendanceOf(ses, members[0].clientId)).toBeNull();
    });

    it("C5 dos altas simultáneas de la misma actividad común → una fila, una creada", async () => {
      const { ses } = await sessionWithMembers("GROUP", startedAgo(30));
      const h = await hold(lockSession(ses));
      const p = [1, 2, 3].map(() => acts.addSessionActivity({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", sessionId: ses, activityId: ACT.warm }));
      await waitForLockWaiters(it4.name, 3);
      h.release();
      await h.done;
      const rs = await Promise.all(p);
      expect(rs.every((r) => r.ok)).toBe(true);
      expect(rs.filter((r) => r.ok && r.value.created)).toHaveLength(1);
      expect(await db.scheduledClassActivity.count({ where: { scheduled_class_id: ses, activity_id: ACT.warm } })).toBe(1);
    });

    it("C6 dos altas simultáneas de la misma actividad individual → una fila", async () => {
      const { ses, members } = await sessionWithMembers("PERSONALIZED", startedAgo(30));
      await attend(members[0].bookingId, "attended");
      const att = (await attendanceOf(ses, members[0].clientId))!;
      const h = await hold(lockSession(ses));
      const p = [1, 2, 3].map(() => acts.addAttendanceActivity({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", attendanceId: att.id, activityId: ACT.squat }));
      await waitForLockWaiters(it4.name, 3);
      h.release();
      await h.done;
      const rs = await Promise.all(p);
      expect(rs.every((r) => r.ok)).toBe(true);
      expect(rs.filter((r) => r.ok && r.value.created)).toHaveLength(1);
      expect(await db.classAttendanceActivity.count({ where: { attendance_id: att.id, activity_id: ACT.squat } })).toBe(1);
    });

    it("C6b actividad individual y asistencia simultáneas: se serializan por la sesión sin interbloqueo", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30));
      await attend(members[0].bookingId, "attended");
      const att = (await attendanceOf(ses, members[0].clientId))!;
      retries = 0;
      const h = await hold(lockSession(ses));
      const p1 = acts.addAttendanceActivity({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", attendanceId: att.id, activityId: ACT.bike });
      const p2 = attend(members[0].bookingId, "absent");
      await waitForLockWaiters(it4.name, 2);
      h.release();
      await h.done;
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r2.ok).toBe(true);
      // Si la actividad entró primero, quedó registrada con el alumno presente;
      // si entró después, el alumno ya era ausente y se rechazó.
      if (r1.ok) expect(await db.classAttendanceActivity.count({ where: { attendance_id: att.id, activity_id: ACT.bike } })).toBe(1);
      else expect(r1.code).toBe("ATTENDANCE_REQUIRED");
      expect(retries).toBe(0);
    });

    it("C7 el entrenador pierde la asignación entre la carga y el guardado → FORBIDDEN (bajo lock)", async () => {
      const { ses, members } = await sessionWithMembers("OPEN", startedAgo(30));
      const h = await hold((tx) => tx.$executeRawUnsafe(`UPDATE scheduled_classes SET trainer_id = $1 WHERE id = $2`, TRAINER_C, ses));
      const att = attend(members[0].bookingId, "attended");
      const act = acts.addSessionActivity({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", sessionId: ses, activityId: ACT.warm });
      await waitForLockWaiters(it4.name, 2);
      h.release();
      await h.done;
      expect(await att).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await act).toMatchObject({ ok: false, code: "FORBIDDEN" });
      // Y si el perfil se desactiva (sin reasignación), también pierde el acceso.
      const s2 = await sessionWithMembers("OPEN", startedAgo(30));
      await db.trainer.update({ where: { id: TRAINER_A }, data: { status: "inactive" } });
      try {
        expect(await attend(s2.members[0].bookingId, "attended")).toMatchObject({ ok: false, code: "FORBIDDEN" });
      } finally {
        await db.trainer.update({ where: { id: TRAINER_A }, data: { status: "active" } });
      }
    });

    it("C8 otro entrenador no lee ni escribe notas ajenas", async () => {
      const { ses, members } = await sessionWithMembers("GROUP", startedAgo(30));
      await attend(members[0].bookingId, "attended");
      const detail = await getSessionTrainingDetail(db, T1, ses, { includePrivateNotes: true });
      // La página del entrenador solo muestra el detalle si la sesión es suya.
      const linked = await resolveLinkedTrainer(db, USERS.trainerC, T1);
      expect(detail?.session.trainer.id === linked?.id).toBe(false);
      expect(await svc.updateTrainingNotes({ scope: TSCOPE, actor: TRAINER_OTHER, channel: "TRAINER", bookingId: members[0].bookingId, trainingNotes: "x", idempotencyKey: key() })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    });

    it("C9 Shared: dos tenants en la misma base reutilizan clave y nombre de actividad sin cruzarse", async () => {
      const a = await sessionWithMembers("GROUP", startedAgo(30));
      await attend(a.members[0].bookingId, "attended");
      const t2ses = await createSession(db, { tenant: T2, kind: "OPEN", startsAt: startedAgo(30) });
      const t2m = await createMember(db, { tenant: T2 });
      const t2b = await svc.bookSession({ scope: T2_SCOPE, actor: SA2, channel: "STAFF", sessionId: t2ses, clientId: t2m.clientId, idempotencyKey: key() });
      if (!t2b.ok) throw new Error(t2b.code);
      await svc.recordAttendance({ scope: T2_SCOPE, actor: SA2, channel: "STAFF", bookingId: t2b.value.bookingId, status: "attended", idempotencyKey: key() });
      const shared = key();
      const r1 = await svc.updateTrainingNotes({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", bookingId: a.members[0].bookingId, trainingNotes: "T1", idempotencyKey: shared });
      const r2 = await svc.updateTrainingNotes({ scope: T2_SCOPE, actor: SA2, channel: "STAFF", bookingId: t2b.value.bookingId, trainingNotes: "T2", idempotencyKey: shared });
      expect(r1).toMatchObject({ ok: true, replayed: false });
      expect(r2).toMatchObject({ ok: true, replayed: false });
      // "Calentamiento" existe en ambos tenants: cada uno solo usa el suyo.
      expect((await acts.addSessionActivity({ scope: T2_SCOPE, actor: SA2, channel: "STAFF", sessionId: t2ses, activityId: ACT.t2 })).ok).toBe(true);
      expect(await acts.addSessionActivity({ scope: T2_SCOPE, actor: SA2, channel: "STAFF", sessionId: t2ses, activityId: ACT.warm })).toMatchObject({ ok: false, code: "ACTIVITY_UNAVAILABLE" });
      // SA de T2 con ids de T1 → no encontrado.
      expect(await svc.updateTrainingNotes({ scope: T2_SCOPE, actor: SA2, channel: "STAFF", bookingId: a.members[0].bookingId, trainingNotes: "x", idempotencyKey: key() })).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect((await attendanceOf(a.ses, a.members[0].clientId))?.training_notes).toBe("T1");
    });

    it("C10 Dedicated: el servicio sobre la base propia escribe solo allí (mismos ids en dos bases físicas)", async () => {
      const ded = await createItDatabase();
      try {
        await seedBase(ded.db);
        await setPolicy(ded.db, T1, MODALITIES_ON);
        const SID = "it-ses-dedicated";
        const startsAt = startedAgo(30);
        await createSession(db, { id: SID, startsAt });
        await createSession(ded.db, { id: SID, startsAt });
        const m = await createMember(ded.db, { id: "it-cli-dedicated" });
        const dsvc = createGymBookingService(ded.db);
        const b = await dsvc.bookSession({ ...staffBook(SID, m.clientId), now: new Date(startsAt.getTime() - HOUR) });
        if (!b.ok) throw new Error(b.code);
        expect((await dsvc.recordAttendance({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", bookingId: b.value.bookingId, status: "attended", idempotencyKey: key() })).ok).toBe(true);
        await ded.db.gymActivity.create({ data: { id: ACT.warm, tenant_id: T1, name: "Calentamiento" } });
        expect((await createSessionActivityService(ded.db).addSessionActivity({ scope: TSCOPE, actor: TRAINER, channel: "TRAINER", sessionId: SID, activityId: ACT.warm })).ok).toBe(true);
        expect(await ded.db.classAttendance.count({ where: { scheduled_class_id: SID } })).toBe(1);
        expect(await ded.db.scheduledClassActivity.count({ where: { scheduled_class_id: SID } })).toBe(1);
        // La base Shared no recibió nada para la misma sesión.
        expect(await db.classAttendance.count({ where: { scheduled_class_id: SID } })).toBe(0);
        expect(await db.scheduledClassActivity.count({ where: { scheduled_class_id: SID } })).toBe(0);
        expect(await db.client.count({ where: { id: "it-cli-dedicated" } })).toBe(0);
        // Desde la base Shared, la reserva dedicada no existe.
        expect(await attend(b.value.bookingId, "absent")).toMatchObject({ ok: false, code: "NOT_FOUND" });
        expect(await invariantViolations(ded.db)).toEqual(NO_VIOLATIONS);
      } finally {
        await ded.drop();
      }
    });
  });
});
