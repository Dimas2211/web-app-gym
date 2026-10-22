// ─────────────────────────────────────────────────────────────────
// GYM-5A §5 — pertenencia día↔plan y autorización de las acciones de día,
// contra PostgreSQL REAL desechable (se omite sin GYM_BOOKING_IT_*).
//
// Estas pruebas se escribieron ANTES de la corrección para demostrar el
// defecto: updateClientPlanDayAction / markClientPlanDayAction autorizaban
// por plan_id pero actualizaban por day_id sin comprobar que el día
// perteneciera a ese plan (IDOR). Las acciones se ejecutan de verdad; solo
// se simulan la sesión y el contexto operacional.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async () => (await import("./testing/plan-action-mocks")).navigationMock());
vi.mock("@/lib/permissions/guards", async () => (await import("./testing/plan-action-mocks")).guardsMock());
vi.mock("@/modules/platform/runtime/require-operational-context", async () => (await import("./testing/plan-action-mocks")).operationalContextMock());

import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "@/modules/classes/booking/testing/pg-it-harness";
import { T2 } from "@/modules/classes/booking/testing/booking-fixtures";
import { FAKE_USERS, seedPlan, seedPlanWorld, W, type SeededPlan } from "./testing/plan-it-harness";
import { formData as fd, planActionState as state, resetPlanActionState, runAction as run } from "./testing/plan-action-mocks";
import { recordPlanExecutionAction, updateClientPlanDayAction } from "./actions";
import { submitPlanDayAction } from "@/modules/client-portal/actions";

describe.skipIf(!IT_ENABLED)("GYM-5A — pertenencia de día y autorización (PostgreSQL real)", () => {
  let it5: ItDatabase;
  let db: PrismaClient;
  let own: SeededPlan; // T1/B1, entrenador A
  let otherClient: SeededPlan; // T1/B1, entrenador A, otro alumno
  let otherTrainer: SeededPlan; // T1/B1, entrenador C
  let otherBranch: SeededPlan; // T1/B1B
  let otherTenant: SeededPlan; // T2

  beforeAll(async () => {
    it5 = await createItDatabase();
    db = it5.db;
    state.db = db;
    await seedPlanWorld(db);
    own = await seedPlan(db, { start: "2026-01-01", end: "2026-12-31", withClientUser: true });
    otherClient = await seedPlan(db, { start: "2026-01-01", end: "2026-12-31", withClientUser: true });
    otherTrainer = await seedPlan(db, { start: "2026-01-01", end: "2026-12-31", trainerId: W.TR2 });
    otherBranch = await seedPlan(db, { start: "2026-01-01", end: "2026-12-31", branch: W.B2, trainerId: null });
    otherTenant = await seedPlan(db, { tenant: T2, start: "2026-01-01", end: "2026-12-31" });
  }, 180_000);

  afterAll(async () => {
    await it5?.drop();
    await disconnectAdmin();
  });

  beforeEach(() => {
    resetPlanActionState(FAKE_USERS.sa1);
    state.db = db;
  });

  const snapshot = async (dayId: string) =>
    db.clientWeeklyPlanDay.findUniqueOrThrow({ where: { id: dayId } });

  const editForm = (planId: string, dayId: string) =>
    fd({ plan_id: planId, day_id: dayId, duration_minutes: "99", session_name: "HACKED", trainer_feedback: "HACKED" });
  // GYM-5A: el registro del entrenador es por fecha local; 2026-01-05 es lunes.
  const DATE_BY_WEEKDAY: Record<number, string> = { 1: "2026-01-05", 3: "2026-01-07", 5: "2026-01-09" };
  const markForm = (planId: string, dayId: string, weekday = 1) =>
    fd({ plan_id: planId, day_id: dayId, local_date: DATE_BY_WEEKDAY[weekday], execution_status: "completed", trainer_feedback: "HACKED" });
  const executionCount = () => db.clientPlanDayExecution.count();

  type Victim = { name: string; plan: () => SeededPlan; as?: keyof typeof FAKE_USERS; weekday: number };
  const cases: Victim[] = [
    { name: "alumno ajeno (mismo tenant y sede)", plan: () => otherClient, weekday: 1 },
    { name: "otro entrenador", plan: () => otherTrainer, as: "tr1", weekday: 1 },
    { name: "otra sucursal", plan: () => otherBranch, as: "ba1", weekday: 3 },
    { name: "otro tenant Shared", plan: () => otherTenant, weekday: 5 },
  ];

  for (const c of cases) {
    it(`updateClientPlanDayAction: plan autorizado + day_id de ${c.name} → rechazado y sin cambios`, async () => {
      state.user = FAKE_USERS[c.as ?? "sa1"];
      const victim = c.plan();
      const before = await snapshot(victim.days[c.weekday]);
      const res = await run(updateClientPlanDayAction(undefined, editForm(own.planId, victim.days[c.weekday])));
      const after = await snapshot(victim.days[c.weekday]);
      expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
      expect(after.session_name).toBe(before.session_name);
      expect(after.trainer_feedback).toBe(before.trainer_feedback);
      expect(res).toBeDefined(); // no hubo redirect de éxito
    });

    it(`recordPlanExecutionAction: plan autorizado + day_id de ${c.name} → rechazado, sin ejecución ni cambios`, async () => {
      state.user = FAKE_USERS[c.as ?? "sa1"];
      const victim = c.plan();
      const before = await snapshot(victim.days[c.weekday]);
      const n0 = await executionCount();
      const res = await run(recordPlanExecutionAction(undefined, markForm(own.planId, victim.days[c.weekday], c.weekday)));
      expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
      expect(await executionCount()).toBe(n0);
      const after = await snapshot(victim.days[c.weekday]);
      expect(after.execution_status).toBe(before.execution_status);
      expect(after.trainer_feedback).toBe(before.trainer_feedback);
      expect(after.executed_at).toBe(before.executed_at);
    });
  }

  it("portal: el alumno no puede registrar el día de otro alumno ni de otro tenant", async () => {
    state.user = { id: own.clientUserId!, role: "client", tenantId: "it-tenant-1", locationId: W.B1 };
    for (const victim of [otherClient, otherTenant]) {
      const dayId = Object.values(victim.days)[0];
      const before = await snapshot(dayId);
      const res = await submitPlanDayAction(undefined, fd({ plan_day_id: dayId, local_date: "2026-01-05", execution_status: "completed", client_feedback: "HACKED" }));
      expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
      const after = await snapshot(dayId);
      expect(after.execution_status).toBe(before.execution_status);
      expect(after.client_feedback).toBe(before.client_feedback);
    }
  });

  it("rol LIVE degradado (JWT trainer, LIVE client) pierde el acceso de escritura", async () => {
    state.user = { ...FAKE_USERS.tr1, role: "client" };
    state.jwtRole = "trainer";
    const dayId = own.days[1];
    const before = await snapshot(dayId);
    const n0 = await executionCount();
    expect(await run(recordPlanExecutionAction(undefined, markForm(own.planId, dayId)))).toEqual(expect.objectContaining({ error: expect.any(String) }));
    await run(updateClientPlanDayAction(undefined, editForm(own.planId, dayId)));
    const after = await snapshot(dayId);
    expect(after.trainer_feedback).toBe(before.trainer_feedback);
    expect(after.execution_status).toBe(before.execution_status);
    expect(await executionCount()).toBe(n0);
  });

  it("Support Session (solo lectura) y módulo deshabilitado no escriben", async () => {
    const dayId = own.days[3];
    const before = await snapshot(dayId);
    const n0 = await executionCount();
    state.readOnly = true;
    await run(recordPlanExecutionAction(undefined, markForm(own.planId, dayId, 3)));
    const r1 = await run(updateClientPlanDayAction(undefined, editForm(own.planId, dayId)));
    expect(r1).toEqual(expect.objectContaining({ error: expect.any(String) }));
    state.readOnly = false;
    state.moduleDisabled = true;
    await run(recordPlanExecutionAction(undefined, markForm(own.planId, dayId, 3)));
    const r2 = await run(updateClientPlanDayAction(undefined, editForm(own.planId, dayId)));
    expect(r2).toEqual(expect.objectContaining({ error: expect.any(String) }));
    const after = await snapshot(dayId);
    expect(after.trainer_feedback).toBe(before.trainer_feedback);
    expect(after.execution_status).toBe(before.execution_status);
    expect(await executionCount()).toBe(n0);
  });

  it("control positivo: el entrenador asignado edita un día de SU plan", async () => {
    state.user = FAKE_USERS.tr1;
    const dayId = own.days[5];
    await run(updateClientPlanDayAction(undefined, fd({ plan_id: own.planId, day_id: dayId, duration_minutes: "45", session_name: "Pierna" })));
    const after = await snapshot(dayId);
    expect(after.duration_minutes).toBe(45);
    expect(after.session_name).toBe("Pierna");
  });
});
