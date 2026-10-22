// ─────────────────────────────────────────────────────────────────
// GYM-5A — seguimiento individual por fecha contra PostgreSQL REAL desechable
// (se omite sin GYM_BOOKING_IT_*; ver booking/testing/pg-it-harness).
//
//  E1–E9   ejecuciones por fecha: independencia, reintento, fuentes,
//          corrección, ventanas, concurrencia, datos heredados
//  A1–A6   integración GYM-4: clase sin reserva / con reserva, vínculo
//          explícito y validado, actividades sin duplicar, privacidad
//  D1–D3   integridad en BD (triggers, FKs compuestas, append-only)
//  T1–T3   zona horaria del gimnasio, DST, falla cerrada
//  S1–S5   autorización (acciones reales), Shared y Dedicated
// ─────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async () => (await import("./testing/plan-action-mocks")).navigationMock());
vi.mock("@/lib/permissions/guards", async () => (await import("./testing/plan-action-mocks")).guardsMock());
vi.mock("@/modules/platform/runtime/require-operational-context", async () => (await import("./testing/plan-action-mocks")).operationalContextMock());

import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "@/modules/classes/booking/testing/pg-it-harness";
import {
  createMember,
  createSession,
  invariantViolations,
  NO_VIOLATIONS,
  setPolicy,
  staffBook,
  T1,
  T2,
  TZ,
} from "@/modules/classes/booking/testing/booking-fixtures";
import { createGymBookingService } from "@/modules/classes/booking/booking-service";
import { FAKE_USERS, seedClient, seedPlan, seedPlanWorld, W, type SeededPlan } from "./testing/plan-it-harness";
import { formData as fd, planActionState as state, resetPlanActionState, runAction as run } from "./testing/plan-action-mocks";
import { recordClientReport, recordTrainerExecution, type ClientReportCommand, type TrainerExecutionCommand } from "./training-execution-service";
import { loadPlanTracking } from "./training-tracking-queries";
import { resolveGymClock } from "./gym-clock";
import { gymToday } from "./training-tracking-rules";
import { recordPlanExecutionAction } from "./actions";
import { submitPlanDayAction } from "@/modules/client-portal/actions";

const TODAY = "2026-03-11"; // miércoles, hora local El Salvador 09:00 (UTC−6)
const NOW_ISO = "2026-03-11T15:00:00.000Z";
const PLAN_START = "2026-03-02"; // lunes
const PLAN_END = "2026-04-26"; // domingo

describe.skipIf(!IT_ENABLED)("GYM-5A — seguimiento por fecha (PostgreSQL real)", () => {
  let it5: ItDatabase;
  let db: PrismaClient;

  beforeAll(async () => {
    it5 = await createItDatabase();
    db = it5.db;
    state.db = db;
    await seedPlanWorld(db);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW_ISO) });
  }, 180_000);

  afterAll(async () => {
    vi.useRealTimers();
    await it5?.drop();
    await disconnectAdmin();
  });

  beforeEach(() => {
    vi.setSystemTime(new Date(NOW_ISO));
    resetPlanActionState(FAKE_USERS.sa1);
    state.db = db;
  });

  afterEach(async () => {
    expect(await invariantViolations(db)).toEqual(NO_VIOLATIONS);
  });

  // ── helpers ─────────────────────────────────────────────────────

  const freshPlan = (over: Partial<Parameters<typeof seedPlan>[1]> = {}) =>
    seedPlan(db, { start: PLAN_START, end: PLAN_END, withClientUser: true, weekdays: [1, 3, 5], ...over });

  const clientCmd = (p: SeededPlan, over: Partial<ClientReportCommand> = {}): ClientReportCommand => ({
    tenantId: T1,
    clientId: p.clientId,
    planDayId: p.days[1],
    localDate: "2026-03-09",
    status: "completed",
    comment: null,
    actorUserId: p.clientUserId!,
    timezone: TZ,
    today: TODAY,
    ...over,
  });

  const trainerCmd = (p: SeededPlan, over: Partial<TrainerExecutionCommand> = {}): TrainerExecutionCommand => ({
    tenantId: T1,
    planId: p.planId,
    planDayId: p.days[1],
    localDate: "2026-03-09",
    status: "completed",
    feedback: null,
    reason: null,
    actor: { userId: W.U_TR1, role: "trainer" },
    timezone: TZ,
    today: TODAY,
    ...over,
  });

  const rowsOf = (p: SeededPlan) => db.clientPlanDayExecution.findMany({ where: { plan_id: p.planId }, orderBy: { local_date: "asc" } });
  const eventsOf = (executionId: string) => db.clientPlanDayExecutionEvent.findMany({ where: { execution_id: executionId }, orderBy: { created_at: "asc" } });

  // ═════════════════ E — ejecuciones por fecha ═════════════════

  it("E1 lunes distintos son registros independientes: ninguno reemplaza al anterior", async () => {
    const p = await freshPlan();
    expect((await recordTrainerExecution(db, trainerCmd(p, { localDate: "2026-03-02", status: "completed" }))).ok).toBe(true);
    expect((await recordTrainerExecution(db, trainerCmd(p, { localDate: "2026-03-09", status: "partial" }))).ok).toBe(true);
    vi.setSystemTime(new Date("2026-03-17T15:00:00.000Z"));
    expect((await recordTrainerExecution(db, trainerCmd(p, { localDate: "2026-03-16", status: "skipped", today: "2026-03-17" }))).ok).toBe(true);
    const rows = await rowsOf(p);
    expect(rows.map((r) => [r.local_date.toISOString().slice(0, 10), r.trainer_status])).toEqual([
      ["2026-03-02", "completed"],
      ["2026-03-09", "partial"],
      ["2026-03-16", "skipped"],
    ]);
  });

  it("E2 reintento idéntico: una fila, revisión 1 y un solo evento", async () => {
    const p = await freshPlan();
    const a = await recordClientReport(db, clientCmd(p, { comment: "Me sentí bien" }));
    const b = await recordClientReport(db, clientCmd(p, { comment: "Me sentí bien" }));
    expect(a).toMatchObject({ ok: true, created: true, changed: true });
    expect(b).toMatchObject({ ok: true, created: false, changed: false });
    const rows = await rowsOf(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].revision).toBe(1);
    expect(await eventsOf(rows[0].id)).toHaveLength(1);
  });

  it("E3 autorreporte y registro del entrenador conviven; prevalece el entrenador sin borrar el autorreporte", async () => {
    const p = await freshPlan();
    await recordClientReport(db, clientCmd(p, { status: "completed", comment: "Terminé todo" }));
    await recordTrainerExecution(db, trainerCmd(p, { status: "partial", feedback: "Faltó el último bloque" }));
    const [row] = await rowsOf(p);
    expect(row).toMatchObject({ client_status: "completed", client_comment: "Terminé todo", trainer_status: "partial", trainer_feedback: "Faltó el último bloque" });
    expect(row.trainer_recorded_role).toBe("trainer");
    const t = await loadPlanTracking(db, { tenantId: T1, planId: p.planId, today: TODAY, audience: "STAFF", includeSessions: false });
    const occ = t!.occurrences.find((o) => o.date === "2026-03-09" && o.weekday === 1)!;
    expect(occ.execution!.effective).toEqual({ status: "partial", source: "TRAINER" });
    expect(occ.execution!.clientStatus).toBe("completed");
    // Una declaración del alumno NO es asistencia verificada.
    expect(occ.execution!.attendance).toBeNull();
  });

  it("E4 tras el registro del entrenador, el alumno ya no puede cambiar su reporte", async () => {
    const p = await freshPlan();
    await recordTrainerExecution(db, trainerCmd(p, { status: "skipped" }));
    const r = await recordClientReport(db, clientCmd(p, { status: "completed" }));
    expect(r).toMatchObject({ ok: false, code: "TRAINER_ALREADY_REVIEWED" });
    expect((await rowsOf(p))[0].client_status).toBeNull();
  });

  it("E5 el alumno puede corregir su autorreporte mientras el entrenador no registre", async () => {
    const p = await freshPlan();
    await recordClientReport(db, clientCmd(p, { status: "partial" }));
    const r = await recordClientReport(db, clientCmd(p, { status: "completed" }));
    expect(r).toMatchObject({ ok: true, changed: true });
    const [row] = await rowsOf(p);
    expect(row.client_status).toBe("completed");
    expect(row.revision).toBe(2);
    const ev = await eventsOf(row.id);
    expect(ev.map((e) => [e.previous_status, e.new_status])).toEqual([[null, "partial"], ["partial", "completed"]]);
  });

  it("E6 corrección autorizada del entrenador: exige motivo y deja bitácora inmutable", async () => {
    const p = await freshPlan();
    await recordTrainerExecution(db, trainerCmd(p, { status: "completed" }));
    expect(await recordTrainerExecution(db, trainerCmd(p, { status: "skipped" }))).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(await recordTrainerExecution(db, trainerCmd(p, { status: "skipped", reason: "Registré el alumno equivocado" }))).toMatchObject({ ok: true, changed: true });
    const [row] = await rowsOf(p);
    expect(row.trainer_status).toBe("skipped");
    const ev = await eventsOf(row.id);
    expect(ev).toHaveLength(2);
    expect(ev[1]).toMatchObject({ previous_status: "completed", new_status: "skipped", reason: "Registré el alumno equivocado", actor_role: "trainer" });
    // Cambiar solo la retroalimentación (mismo estado) no exige motivo.
    expect(await recordTrainerExecution(db, trainerCmd(p, { status: "skipped", feedback: "Lesión leve" }))).toMatchObject({ ok: true, changed: true });
  });

  it("E7 fechas inválidas: futura, otro día de la semana, fuera del plan y ventana del alumno", async () => {
    const p = await freshPlan();
    expect(await recordClientReport(db, clientCmd(p, { localDate: "2026-03-16" }))).toMatchObject({ ok: false, code: "DATE_FUTURE" });
    expect(await recordClientReport(db, clientCmd(p, { localDate: "2026-03-10" }))).toMatchObject({ ok: false, code: "DATE_WRONG_WEEKDAY" });
    expect(await recordClientReport(db, clientCmd(p, { localDate: "2026-02-23" }))).toMatchObject({ ok: false, code: "DATE_OUTSIDE_PLAN" });
    // 2026-03-02 está a 9 días de hoy → dentro de 14; con hoy 2026-03-30 queda fuera de la ventana del alumno
    expect(await recordClientReport(db, clientCmd(p, { localDate: "2026-03-02", today: "2026-03-30" }))).toMatchObject({ ok: false, code: "DATE_TOO_OLD" });
    // …pero el entrenador sí puede registrar una fecha antigua del período.
    expect(await recordTrainerExecution(db, trainerCmd(p, { localDate: "2026-03-02", today: "2026-03-30" }))).toMatchObject({ ok: true });
    expect(await rowsOf(p)).toHaveLength(1);
  });

  it("E8 doce escrituras simultáneas sobre el mismo (día, fecha): una fila, revisión = eventos, sin errores", async () => {
    const p = await freshPlan();
    const statuses = ["completed", "partial", "skipped"] as const;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        i % 2 === 0
          ? recordClientReport(db, clientCmd(p, { status: statuses[i % 3], comment: `c${i}` }))
          : recordTrainerExecution(db, trainerCmd(p, { status: statuses[i % 3], feedback: `f${i}`, reason: "ajuste concurrente" }))
      )
    );
    // El alumno puede ser rechazado si el entrenador ya registró; nada más puede fallar.
    for (const r of results) {
      if (!r.ok) expect(r.code).toBe("TRAINER_ALREADY_REVIEWED");
    }
    const rows = await rowsOf(p);
    expect(rows).toHaveLength(1);
    const ev = await eventsOf(rows[0].id);
    expect(rows[0].revision).toBe(ev.length);
  });

  it("E9 escrituras simultáneas sobre días distintos no se bloquean entre sí", async () => {
    const p = await freshPlan();
    const specs: Array<[number, string]> = [
      [1, "2026-03-02"],
      [1, "2026-03-09"],
      [3, "2026-03-04"],
      [3, "2026-03-11"],
      [5, "2026-03-06"],
    ];
    const results = await Promise.all(specs.map(([wd, date]) => recordTrainerExecution(db, trainerCmd(p, { planDayId: p.days[wd], localDate: date }))));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await rowsOf(p)).toHaveLength(5);
  });

  it("E10 revisión esperada obsoleta se rechaza (concurrencia optimista)", async () => {
    const p = await freshPlan();
    await recordTrainerExecution(db, trainerCmd(p, { status: "completed" }));
    expect(await recordTrainerExecution(db, trainerCmd(p, { status: "completed", feedback: "x", expectedRevision: 0 }))).toMatchObject({ ok: false, code: "STALE_REVISION" });
    expect(await recordTrainerExecution(db, trainerCmd(p, { status: "completed", feedback: "x", expectedRevision: 1 }))).toMatchObject({ ok: true });
  });

  it("E11 datos heredados anteriores a GYM-5A permanecen intactos y no cuentan como ejecuciones", async () => {
    const p = await freshPlan();
    const executedAt = new Date("2026-02-01T10:00:00.000Z");
    await db.clientWeeklyPlanDay.update({
      where: { id: p.days[1] },
      data: { execution_status: "completed", executed_at: executedAt, trainer_feedback: "heredado", client_feedback: "heredado alumno" },
    });
    await recordTrainerExecution(db, trainerCmd(p, { status: "partial" }));
    const legacy = await db.clientWeeklyPlanDay.findUniqueOrThrow({ where: { id: p.days[1] } });
    expect(legacy).toMatchObject({ execution_status: "completed", trainer_feedback: "heredado", client_feedback: "heredado alumno" });
    expect(legacy.executed_at?.toISOString()).toBe(executedAt.toISOString());
    const t = await loadPlanTracking(db, { tenantId: T1, planId: p.planId, today: TODAY, audience: "STAFF", includeSessions: false });
    // Solo el lunes 09 registrado; el heredado no se proyecta a fechas.
    expect(t!.summary.partial).toBe(1);
    expect(t!.summary.completed).toBe(0);
  });

  it("E12 cumplimiento: programados, completados, parciales, omitidos y pendientes", async () => {
    const p = await freshPlan();
    // Vencidos a 2026-03-11: lun 02, mié 04, vie 06, lun 09, mié 11 = 5
    await recordTrainerExecution(db, trainerCmd(p, { localDate: "2026-03-02", status: "completed" }));
    await recordTrainerExecution(db, trainerCmd(p, { planDayId: p.days[3], localDate: "2026-03-04", status: "partial" }));
    await recordClientReport(db, clientCmd(p, { planDayId: p.days[5], localDate: "2026-03-06", status: "skipped" }));
    const t = await loadPlanTracking(db, { tenantId: T1, planId: p.planId, today: TODAY, audience: "STAFF", includeSessions: false });
    expect(t!.summary).toMatchObject({ scheduled: 5, completed: 1, partial: 1, skipped: 1, pending: 2, selfReportedOnly: 1 });
    expect(t!.summary.compliancePct).toBe(30); // (1 + 0,5) / 5
  });

  // ═════════════════ A — integración con GYM-4 ═════════════════

  async function attendance(clientId: string, date: string, opts: { kind?: "OPEN" | "GROUP"; status?: "attended" | "late" | "absent"; withBooking?: boolean; notes?: string } = {}) {
    const sessionId = await createSession(db, { branch: W.B1, trainer: W.TR1, date, start: "07:00", end: "08:00", kind: opts.kind ?? "OPEN" });
    if (opts.withBooking) {
      const svc = createGymBookingService(db);
      const b = await svc.bookSession({ ...staffBook(sessionId, clientId), now: new Date(`${date}T00:00:00.000Z`) });
      if (!b.ok) throw new Error(`booking ${b.code}`);
    }
    const att = await db.classAttendance.create({
      data: { scheduled_class_id: sessionId, client_id: clientId, attendance_status: opts.status ?? "attended", training_notes: opts.notes ?? null },
    });
    return { sessionId, attendanceId: att.id };
  }

  const snapshotGym4 = async (clientId: string) => ({
    attendance: await db.classAttendance.findMany({ where: { client_id: clientId }, orderBy: { id: "asc" } }),
    bookings: await db.classBooking.findMany({ where: { client_id: clientId }, orderBy: { id: "asc" } }),
    memberships: await db.clientMembership.findMany({ where: { client_id: clientId }, orderBy: { id: "asc" } }),
    sessions: await db.scheduledClass.findMany({ where: { attendance: { some: { client_id: clientId } } }, orderBy: { id: "asc" } }),
  });

  it("A1 clase SIN reserva con asistencia: vínculo explícito válido y GYM-4 intacto", async () => {
    const m = await createMember(db, { id: crypto.randomUUID(), branch: W.B1, withUser: true });
    const p = await seedPlan(db, { start: PLAN_START, end: PLAN_END, clientId: m.clientId, weekdays: [1] });
    const { attendanceId } = await attendance(m.clientId, "2026-03-09");
    const before = await snapshotGym4(m.clientId);
    const r = await recordTrainerExecution(db, trainerCmd(p, { attendanceId }));
    expect(r).toMatchObject({ ok: true });
    expect(await snapshotGym4(m.clientId)).toEqual(before);
    const t = await loadPlanTracking(db, { tenantId: T1, planId: p.planId, today: TODAY, audience: "STAFF", includeSessions: true });
    const occ = t!.occurrences.find((o) => o.date === "2026-03-09")!;
    expect(occ.execution!.attendance).toMatchObject({ attendanceId, stillValid: true, classDate: "2026-03-09" });
    expect(t!.sessions![0]).toMatchObject({ attendanceId, linkedExecutionId: occ.execution!.executionId });
  });

  it("A2 clase CON reserva y asistencia: el vínculo no altera cupos, reservas ni consumos", async () => {
    const m = await createMember(db, { id: crypto.randomUUID(), branch: W.B1, withUser: true, sessionsTotal: null });
    const p = await seedPlan(db, { start: PLAN_START, end: PLAN_END, clientId: m.clientId, weekdays: [3] });
    vi.setSystemTime(new Date("2026-03-03T12:00:00.000Z"));
    const { attendanceId } = await attendance(m.clientId, "2026-03-04", { withBooking: true });
    vi.setSystemTime(new Date(NOW_ISO));
    const before = await snapshotGym4(m.clientId);
    expect(before.bookings).toHaveLength(1);
    const r = await recordTrainerExecution(db, trainerCmd(p, { planDayId: p.days[3], localDate: "2026-03-04", attendanceId }));
    expect(r).toMatchObject({ ok: true });
    expect(await snapshotGym4(m.clientId)).toEqual(before);
  });

  it("A3 el vínculo es explícito: la coincidencia de fecha NO vincula, y se rechazan asistencias ajenas, de otra fecha, ausentes o ya vinculadas", async () => {
    const m = await createMember(db, { id: crypto.randomUUID(), branch: W.B1, withUser: true });
    const other = await createMember(db, { id: crypto.randomUUID(), branch: W.B1 });
    const p = await seedPlan(db, { start: PLAN_START, end: PLAN_END, clientId: m.clientId, weekdays: [1] });
    const same = await attendance(m.clientId, "2026-03-09");
    const otherDate = await attendance(m.clientId, "2026-03-02");
    const absent = await attendance(m.clientId, "2026-03-09", { status: "absent" });
    const foreign = await attendance(other.clientId, "2026-03-09");

    // Sin vínculo explícito, registrar la ejecución no asocia la clase aunque la fecha coincida.
    await recordTrainerExecution(db, trainerCmd(p, { status: "completed" }));
    expect((await rowsOf(p))[0].attendance_id).toBeNull();

    for (const bad of [foreign.attendanceId, otherDate.attendanceId, absent.attendanceId, crypto.randomUUID()]) {
      expect(await recordTrainerExecution(db, trainerCmd(p, { attendanceId: bad }))).toMatchObject({ ok: false, code: "ATTENDANCE_INVALID" });
    }
    expect(await recordTrainerExecution(db, trainerCmd(p, { attendanceId: same.attendanceId }))).toMatchObject({ ok: true });

    // La misma asistencia no puede vincularse a otra ejecución (otro plan histórico, misma fecha).
    const old = await seedPlan(db, { start: PLAN_START, end: PLAN_END, clientId: m.clientId, weekdays: [1], status: "inactive" });
    expect(await recordTrainerExecution(db, trainerCmd(old, { attendanceId: same.attendanceId }))).toMatchObject({ ok: false, code: "ATTENDANCE_ALREADY_LINKED" });

    // Desvincular y re-vincular.
    expect(await recordTrainerExecution(db, trainerCmd(p, { attendanceId: null }))).toMatchObject({ ok: true, changed: true });
    expect((await rowsOf(p))[0].attendance_id).toBeNull();
    expect(await recordTrainerExecution(db, trainerCmd(old, { attendanceId: same.attendanceId }))).toMatchObject({ ok: true });
  });

  it("A4 actividades comunes e individuales sin duplicados; una actividad GROUP no se suma por integrante", async () => {
    const members = [];
    for (let i = 0; i < 3; i++) members.push(await createMember(db, { id: crypto.randomUUID(), branch: W.B1, withUser: true }));
    const p = await seedPlan(db, { start: PLAN_START, end: PLAN_END, clientId: members[0].clientId, weekdays: [1] });

    const actWarm = crypto.randomUUID();
    const actSquat = crypto.randomUUID();
    const actBike = crypto.randomUUID();
    await db.gymActivity.createMany({
      data: [
        { id: actWarm, tenant_id: T1, name: `Calentamiento-${actWarm}` },
        { id: actSquat, tenant_id: T1, name: `Sentadilla-${actSquat}` },
        { id: actBike, tenant_id: T1, name: `Bicicleta-${actBike}` },
      ],
    });

    const sessionId = await createSession(db, { branch: W.B1, trainer: W.TR1, date: "2026-03-09", kind: "GROUP" });
    await db.scheduledClassActivity.createMany({
      data: [
        { tenant_id: T1, scheduled_class_id: sessionId, activity_id: actWarm, activity_name: "Calentamiento" },
        { tenant_id: T1, scheduled_class_id: sessionId, activity_id: actSquat, activity_name: "Sentadilla" },
      ],
    });
    const attIds: string[] = [];
    for (const m of members) {
      const a = await db.classAttendance.create({
        data: { scheduled_class_id: sessionId, client_id: m.clientId, attendance_status: "attended", training_notes: "SECRETO-NOTA-ENTRENADOR" },
      });
      attIds.push(a.id);
    }
    // Individuales del primer alumno: una repetida respecto a las comunes (sentadilla) y una propia (bicicleta).
    await db.classAttendanceActivity.createMany({
      data: [
        { tenant_id: T1, attendance_id: attIds[0], activity_id: actSquat, activity_name: "Sentadilla", notes: "SECRETO-NOTA-ACTIVIDAD" },
        { tenant_id: T1, attendance_id: attIds[0], activity_id: actBike, activity_name: "Bicicleta", notes: "SECRETO-NOTA-ACTIVIDAD" },
      ],
    });
    await recordTrainerExecution(db, trainerCmd(p, { attendanceId: attIds[0] }));

    const staff = await loadPlanTracking(db, { tenantId: T1, planId: p.planId, today: TODAY, audience: "STAFF", includeSessions: true });
    expect(staff!.sessions).toHaveLength(1);
    expect(staff!.sessions![0].commonActivities.sort()).toEqual(["Calentamiento", "Sentadilla"]);
    expect(staff!.sessions![0].individualActivities.sort()).toEqual(["Bicicleta", "Sentadilla"]);
    // Pares únicos (sesión, actividad): calentamiento, sentadilla, bicicleta = 3 (no 2×3 integrantes ni 4).
    expect(staff!.distinctActivities).toBe(3);

    // Privacidad: ni training_notes ni notas de actividades en ninguna audiencia.
    const client = await loadPlanTracking(db, { tenantId: T1, planId: p.planId, today: TODAY, audience: "CLIENT", includeSessions: true });
    for (const t of [staff, client]) expect(JSON.stringify(t)).not.toContain("SECRETO");
    expect(client!.sessions).toBeNull();
    expect(client!.occurrences.every((o) => o.execution?.trainerRecordedRole == null)).toBe(true);
  });

  it("A5 con gym.classes deshabilitado el seguimiento no incluye sesiones ni actividades", async () => {
    const p = await freshPlan();
    const t = await loadPlanTracking(db, { tenantId: T1, planId: p.planId, today: TODAY, audience: "STAFF", includeSessions: false });
    expect(t!.sessions).toBeNull();
    expect(t!.distinctActivities).toBeNull();
  });

  // ═════════════════ D — integridad en BD ═════════════════

  it("D1 triggers y restricciones: weekday, período, identidad, asistencia ajena, append-only y sin borrado", async () => {
    const p = await freshPlan();
    const base = { tenant_id: T1, client_id: p.clientId, plan_id: p.planId, plan_day_id: p.days[1], timezone: TZ, client_status: "completed" as const, client_reported_at: new Date(), client_reported_by: "u" };
    const ins = (over: Record<string, unknown>) => db.clientPlanDayExecution.create({ data: { ...base, local_date: new Date("2026-03-09T00:00:00.000Z"), ...over } as never });

    await expect(ins({ local_date: new Date("2026-03-10T00:00:00.000Z") })).rejects.toThrow(/GYM_PLAN_EXECUTION_WEEKDAY/);
    await expect(ins({ local_date: new Date("2026-05-04T00:00:00.000Z") })).rejects.toThrow(/GYM_PLAN_EXECUTION_DATE/);
    await expect(ins({ plan_day_id: (await freshPlan()).days[1] })).rejects.toThrow(); // día de otro plan (FK compuesta)
    await expect(ins({ tenant_id: T2 })).rejects.toThrow(); // tenant cruzado (FK compuesta)
    await expect(ins({ client_status: "pending" })).rejects.toThrow(); // CHECK: pending no es un registro

    const ok = await ins({});
    await expect(db.clientPlanDayExecution.update({ where: { id: ok.id }, data: { local_date: new Date("2026-03-16T00:00:00.000Z") } })).rejects.toThrow(/GYM_PLAN_EXECUTION_IMMUTABLE/);
    await expect(db.clientPlanDayExecution.delete({ where: { id: ok.id } })).rejects.toThrow(/GYM_APPEND_ONLY/);
    await expect(db.clientWeeklyPlanDay.delete({ where: { id: p.days[1] } })).rejects.toThrow(); // RESTRICT: hay ejecuciones

    await recordClientReport(db, clientCmd(p, { localDate: "2026-03-02", status: "partial" }));
    const [ev] = await db.clientPlanDayExecutionEvent.findMany({ take: 1 });
    await expect(db.clientPlanDayExecutionEvent.update({ where: { id: ev.id }, data: { reason: "x" } })).rejects.toThrow(/GYM_APPEND_ONLY/);
    await expect(db.clientPlanDayExecutionEvent.delete({ where: { id: ev.id } })).rejects.toThrow(/GYM_APPEND_ONLY/);
  });

  it("D2 el trigger rechaza una asistencia de otro alumno aunque se salte el servicio", async () => {
    const m = await createMember(db, { id: crypto.randomUUID(), branch: W.B1 });
    const other = await createMember(db, { id: crypto.randomUUID(), branch: W.B1 });
    const p = await seedPlan(db, { start: PLAN_START, end: PLAN_END, clientId: m.clientId, weekdays: [1] });
    const foreign = await attendance(other.clientId, "2026-03-09");
    await expect(
      db.clientPlanDayExecution.create({
        data: {
          tenant_id: T1,
          client_id: m.clientId,
          plan_id: p.planId,
          plan_day_id: p.days[1],
          local_date: new Date("2026-03-09T00:00:00.000Z"),
          timezone: TZ,
          trainer_status: "completed",
          trainer_recorded_at: new Date(),
          trainer_recorded_by: "u",
          trainer_recorded_role: "trainer",
          attendance_id: foreign.attendanceId,
          attendance_linked_by: "u",
          attendance_linked_at: new Date(),
        },
      })
    ).rejects.toThrow(/GYM_PLAN_EXECUTION_ATTENDANCE/);
  });

  // ═════════════════ T — zona horaria ═════════════════

  it("T1 'hoy' es la fecha local del gimnasio, no la fecha UTC del servidor", async () => {
    const p = await freshPlan();
    // 2026-03-13T03:00Z = jueves 21:00 en El Salvador; UTC ya es viernes 13.
    const instant = new Date("2026-03-13T03:00:00.000Z");
    vi.setSystemTime(instant);
    const clock = await resolveGymClock(db, T1);
    expect(clock).toEqual({ timezone: TZ, today: "2026-03-12" });
    // El viernes 13 todavía es futuro para el gimnasio.
    expect(await recordClientReport(db, clientCmd(p, { planDayId: p.days[5], localDate: "2026-03-13", today: clock!.today }))).toMatchObject({ ok: false, code: "DATE_FUTURE" });
    // Tres horas después ya es viernes local.
    vi.setSystemTime(new Date("2026-03-13T06:00:00.000Z"));
    const later = await resolveGymClock(db, T1);
    expect(later!.today).toBe("2026-03-13");
    expect(await recordClientReport(db, clientCmd(p, { planDayId: p.days[5], localDate: "2026-03-13", today: later!.today }))).toMatchObject({ ok: true });
  });

  it("T2 DST (America/New_York): domingo 08-mar y lunes 09-mar sobre el cambio de horario", async () => {
    const c = await seedClient(db, { tenant: T2 });
    const p = await seedPlan(db, { tenant: T2, clientId: c.clientId, start: "2026-03-01", end: "2026-03-29", weekdays: [0, 1] });
    const cmd = (over: Partial<ClientReportCommand>): ClientReportCommand => ({
      tenantId: T2,
      clientId: p.clientId,
      planDayId: p.days[0],
      localDate: "2026-03-08",
      status: "completed",
      comment: null,
      actorUserId: "u",
      timezone: "America/New_York",
      today: "2026-03-08",
      ...over,
    });
    // 2026-03-09T03:30Z = domingo 23:30 EDT (ya con DST). El lunes 09 sigue siendo futuro.
    const late = new Date("2026-03-09T03:30:00.000Z");
    vi.setSystemTime(late);
    const clockSunday = await resolveGymClock(db, T2);
    expect(clockSunday!.today).toBe("2026-03-08");
    expect(await recordClientReport(db, cmd({ today: clockSunday!.today }))).toMatchObject({ ok: true });
    expect(await recordClientReport(db, cmd({ planDayId: p.days[1], localDate: "2026-03-09", today: clockSunday!.today }))).toMatchObject({ ok: false, code: "DATE_FUTURE" });
    // Una hora después es lunes local.
    vi.setSystemTime(new Date("2026-03-09T04:30:00.000Z"));
    const clockMonday = await resolveGymClock(db, T2);
    expect(clockMonday!.today).toBe("2026-03-09");
    expect(await recordClientReport(db, cmd({ planDayId: p.days[1], localDate: "2026-03-09", today: clockMonday!.today }))).toMatchObject({ ok: true });
    // Fin de DST: 2026-11-02T04:59Z aún es domingo 1° de noviembre (EST).
    expect(gymToday("America/New_York", new Date("2026-11-02T04:59:00.000Z"))).toBe("2026-11-01");
    expect(gymToday("America/New_York", new Date("2026-11-02T05:00:00.000Z"))).toBe("2026-11-02");
  });

  it("T3 sin zona horaria válida las escrituras fechadas fallan cerradas y no se asume UTC", async () => {
    await setPolicy(db, T2, { timezone: null });
    expect(await resolveGymClock(db, T2)).toBeNull();
    await setPolicy(db, T2, { timezone: "Mars/Olympus" });
    expect(await resolveGymClock(db, T2)).toBeNull();

    // Acción del entrenador del tenant 2: error y ninguna fila.
    const c = await seedClient(db, { tenant: T2 });
    const p = await seedPlan(db, { tenant: T2, clientId: c.clientId, start: "2026-03-01", end: "2026-03-29", weekdays: [1] });
    resetPlanActionState(FAKE_USERS.sa2);
    state.db = db;
    const res = await run(
      recordPlanExecutionAction(undefined, fd({ plan_id: p.planId, day_id: p.days[1], local_date: "2026-03-02", execution_status: "completed" }))
    );
    expect(res).toEqual(expect.objectContaining({ error: expect.stringContaining("zona horaria") }));
    expect(await db.clientPlanDayExecution.count({ where: { plan_id: p.planId } })).toBe(0);
    await setPolicy(db, T2, { timezone: "America/New_York" });
  });

  // ═════════════════ S — autorización, Shared y Dedicated ═════════════════

  const recordForm = (p: SeededPlan, over: Record<string, string> = {}) =>
    fd({ plan_id: p.planId, day_id: p.days[1], local_date: "2026-03-09", execution_status: "completed", ...over });

  it("S1 registro del entrenador: admin y entrenador asignado sí; recepción, otro entrenador, otra sede y otro tenant no", async () => {
    const p = await freshPlan(); // entrenador 1, sede 1
    const attempt = async (user: keyof typeof FAKE_USERS) => {
      resetPlanActionState(FAKE_USERS[user]);
      state.db = db;
      return run(recordPlanExecutionAction(undefined, recordForm(p, { execution_status: "completed" })));
    };
    for (const denied of ["rc1", "tr2", "ba2", "sa2"] as const) {
      expect(await attempt(denied), denied).toEqual(expect.objectContaining({ error: expect.any(String) }));
    }
    expect(await rowsOf(p)).toHaveLength(0);
    expect(await attempt("tr1")).toEqual({ ok: true });
    expect(await attempt("ba1")).toEqual({ ok: true, unchanged: true });
    expect(await attempt("sa1")).toEqual({ ok: true, unchanged: true });
    const [row] = await rowsOf(p);
    expect(row).toMatchObject({ trainer_recorded_by: FAKE_USERS.tr1.id, trainer_recorded_role: "trainer" });
  });

  it("S2 el entrenador pierde acceso si su rol LIVE cambió, con Support Session o módulo deshabilitado", async () => {
    const p = await freshPlan();
    resetPlanActionState({ ...FAKE_USERS.tr1, role: "client" });
    state.jwtRole = "trainer";
    state.db = db;
    expect(await run(recordPlanExecutionAction(undefined, recordForm(p)))).toEqual(expect.objectContaining({ error: expect.any(String) }));
    resetPlanActionState(FAKE_USERS.tr1);
    state.db = db;
    state.readOnly = true;
    expect(await run(recordPlanExecutionAction(undefined, recordForm(p)))).toEqual(expect.objectContaining({ error: expect.any(String) }));
    state.readOnly = false;
    state.disabledModules.add("gym.weekly_plans");
    expect(await run(recordPlanExecutionAction(undefined, recordForm(p)))).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(await rowsOf(p)).toHaveLength(0);
  });

  it("S3 vincular asistencia exige gym.classes habilitado", async () => {
    const m = await createMember(db, { id: crypto.randomUUID(), branch: W.B1 });
    const p = await seedPlan(db, { start: PLAN_START, end: PLAN_END, clientId: m.clientId, weekdays: [1] });
    const { attendanceId } = await attendance(m.clientId, "2026-03-09");
    resetPlanActionState(FAKE_USERS.tr1);
    state.db = db;
    state.disabledModules.add("gym.classes");
    const denied = await run(recordPlanExecutionAction(undefined, recordForm(p, { attendance_id: attendanceId })));
    expect(denied).toEqual(expect.objectContaining({ error: expect.stringContaining("clases") }));
    // Sin vincular, el registro funciona aunque gym.classes esté apagado.
    expect(await run(recordPlanExecutionAction(undefined, recordForm(p)))).toEqual({ ok: true });
    state.disabledModules.delete("gym.classes");
    expect(await run(recordPlanExecutionAction(undefined, recordForm(p, { attendance_id: attendanceId })))).toEqual({ ok: true });
    expect((await rowsOf(p))[0].attendance_id).toBe(attendanceId);
  });

  it("S4 portal: el alumno reporta SU día; no el de otro, ni con plan inactivo; la política de membresía se aplica al escribir", async () => {
    const p = await freshPlan();
    const mine = (over: Record<string, string> = {}) =>
      fd({ plan_day_id: p.days[1], local_date: "2026-03-09", execution_status: "partial", client_feedback: "Me dolió la rodilla", ...over });
    resetPlanActionState({ id: p.clientUserId!, role: "client", tenantId: T1, locationId: W.B1 });
    state.db = db;

    // Sin membresía registrada la política deja ver el plan (comportamiento vigente).
    expect(await submitPlanDayAction(undefined, mine())).toEqual({ success: true });
    const [row] = await rowsOf(p);
    expect(row).toMatchObject({ client_status: "partial", client_comment: "Me dolió la rodilla", trainer_status: null, attendance_id: null });
    expect(row.client_reported_by).toBe(p.clientUserId);

    // Día de otro alumno / de otro tenant.
    const stranger = await freshPlan();
    const t2 = await seedPlan(db, { tenant: T2, start: PLAN_START, end: PLAN_END, weekdays: [1] });
    for (const dayId of [stranger.days[1], t2.days[1]]) {
      expect(await submitPlanDayAction(undefined, mine({ plan_day_id: dayId }))).toEqual(expect.objectContaining({ error: expect.any(String) }));
    }
    expect(await db.clientPlanDayExecution.count({ where: { plan_id: { in: [stranger.planId, t2.planId] } } })).toBe(0);

    // Plan inactivo.
    await db.clientWeeklyPlan.update({ where: { id: p.planId }, data: { status: "inactive" } });
    expect(await submitPlanDayAction(undefined, mine({ execution_status: "completed" }))).toEqual(expect.objectContaining({ error: expect.any(String) }));
    await db.clientWeeklyPlan.update({ where: { id: p.planId }, data: { status: "active" } });

    // Membresía vencida hace más de 3 días hábiles → bloqueado; dentro de la gracia → permitido.
    await db.clientMembership.create({
      data: {
        gym_id: T1, tenant_id: T1, branch_id: W.B1, client_id: p.clientId, membership_plan_id: "it-plan-1",
        start_date: new Date("2026-01-01T00:00:00.000Z"), end_date: new Date("2026-03-04T00:00:00.000Z"), // miércoles
        price_at_sale: 30, final_amount: 30, payment_status: "paid", status: "active",
      },
    });
    // 05 jue, 06 vie, 09 lun, 10 mar, 11 mié = 5 días hábiles ≥ 3 → oculto.
    expect(await submitPlanDayAction(undefined, mine({ execution_status: "completed" }))).toEqual(expect.objectContaining({ error: expect.stringContaining("no están disponibles") }));
    vi.setSystemTime(new Date("2026-03-06T15:00:00.000Z")); // viernes: 2 días hábiles desde el 04
    expect(await submitPlanDayAction(undefined, mine({ local_date: "2026-03-02", execution_status: "completed" }))).toEqual({ success: true });
  });

  it("S5 Shared: dos tenants en la misma base no se ven; FK compuesta impide cruzar tenant", async () => {
    const t1p = await freshPlan();
    await recordTrainerExecution(db, trainerCmd(t1p));
    expect(await loadPlanTracking(db, { tenantId: T2, planId: t1p.planId, today: TODAY, audience: "STAFF", includeSessions: true })).toBeNull();
    expect(await recordTrainerExecution(db, trainerCmd(t1p, { tenantId: T2 }))).toMatchObject({ ok: false, code: "DAY_NOT_FOUND" });
    expect(await recordClientReport(db, clientCmd(t1p, { tenantId: T2 }))).toMatchObject({ ok: false, code: "DAY_NOT_FOUND" });
  });

  it("S6 Dedicated: bases físicas separadas con los mismos ids no comparten ejecuciones", async () => {
    const other = await createItDatabase();
    try {
      await seedPlanWorld(other.db);
      const p = await freshPlan();
      await recordTrainerExecution(db, trainerCmd(p));
      // La otra base ni conoce el plan: nada se escribe ni se lee allí.
      expect(await loadPlanTracking(other.db, { tenantId: T1, planId: p.planId, today: TODAY, audience: "STAFF", includeSessions: true })).toBeNull();
      expect(await recordTrainerExecution(other.db, trainerCmd(p))).toMatchObject({ ok: false, code: "DAY_NOT_FOUND" });
      expect(await other.db.clientPlanDayExecution.count()).toBe(0);
      // Y la acción apuntada a la base dedicada tampoco encuentra el plan de la compartida.
      resetPlanActionState(FAKE_USERS.sa1);
      state.db = other.db;
      expect(await run(recordPlanExecutionAction(undefined, recordForm(p)))).toEqual(expect.objectContaining({ error: expect.any(String) }));
      expect(await other.db.clientPlanDayExecution.count()).toBe(0);
    } finally {
      await other.drop();
    }
  });
});
