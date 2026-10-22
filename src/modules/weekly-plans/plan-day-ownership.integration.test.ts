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

const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: string; tenantId: string; locationId: string | null },
  jwtRole: null as null | string,
  db: null as unknown,
  readOnly: false,
  moduleDisabled: false,
  runtimeMode: "RUNTIME_CLIENT" as string,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

function sessionUser() {
  const u = state.user!;
  return {
    id: u.id,
    tenant_id: u.tenantId,
    location_id: u.locationId,
    role: state.jwtRole ?? u.role,
    auth_scope: "RUNTIME_CLIENT",
  };
}

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => sessionUser()),
  requireClassViewer: vi.fn(async () => sessionUser()),
  requireClient: vi.fn(async () => sessionUser()),
  getSessionOrRedirect: vi.fn(async () => sessionUser()),
  canDeleteDirectly: vi.fn(() => true),
}));

vi.mock("@/modules/platform/runtime/require-operational-context", () => {
  class OperationalContextError extends Error {
    code: string;
    httpStatus: number;
    userMessage: string;
    constructor(code: string, userMessage: string, httpStatus: number) {
      super(userMessage);
      this.code = code;
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    OperationalContextError,
    requireOperationalContext: vi.fn(async (_s: unknown, opts: { module?: string; write?: boolean } = {}) => {
      if (opts.write && state.readOnly) throw new OperationalContextError("READ_ONLY", "Sesión de soporte de solo lectura.", 403);
      if (opts.module && state.moduleDisabled) throw new OperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 403);
      const u = state.user!;
      return {
        context: {
          runtimeMode: state.runtimeMode,
          authScope: "RUNTIME_CLIENT",
          effectiveUser: { id: u.id, tenant_id: u.tenantId, location_id: u.locationId, role: u.role, auth_scope: "RUNTIME_CLIENT" },
          organizationId: null,
          tenantId: u.tenantId,
          gymId: u.tenantId,
          locationId: u.locationId,
          client: state.db,
          readOnly: state.readOnly,
          commercialContext: null,
        },
        dispose: async () => {},
      };
    }),
  };
});

import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "@/modules/classes/booking/testing/pg-it-harness";
import { B1B, seedBase, T2, TRAINER_C } from "@/modules/classes/booking/testing/booking-fixtures";
import { FAKE_USERS, seedPlan, type SeededPlan } from "./testing/plan-it-harness";
import { markClientPlanDayAction, updateClientPlanDayAction } from "./actions";
import { submitPlanDayAction } from "@/modules/client-portal/actions";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

async function run<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) return undefined;
    throw e;
  }
}

describe.skipIf(!IT_ENABLED)("GYM-5A — pertenencia de día y autorización (PostgreSQL real)", () => {
  let it5: ItDatabase;
  let db: PrismaClient;
  let own: SeededPlan & { clientUserId: string | null }; // T1/B1, entrenador A
  let otherClient: SeededPlan & { clientUserId: string | null }; // T1/B1, entrenador A, otro alumno
  let otherTrainer: SeededPlan & { clientUserId: string | null }; // T1/B1, entrenador C
  let otherBranch: SeededPlan & { clientUserId: string | null }; // T1/B1B
  let otherTenant: SeededPlan & { clientUserId: string | null }; // T2

  beforeAll(async () => {
    it5 = await createItDatabase();
    db = it5.db;
    state.db = db;
    await seedBase(db);
    own = await seedPlan(db, { start: "2026-01-01", end: "2026-12-31", withClientUser: true });
    otherClient = await seedPlan(db, { start: "2026-01-01", end: "2026-12-31", withClientUser: true });
    otherTrainer = await seedPlan(db, { start: "2026-01-01", end: "2026-12-31", trainerId: TRAINER_C });
    otherBranch = await seedPlan(db, { start: "2026-01-01", end: "2026-12-31", branch: B1B, trainerId: null });
    otherTenant = await seedPlan(db, { tenant: T2, start: "2026-01-01", end: "2026-12-31" });
  }, 180_000);

  afterAll(async () => {
    await it5?.drop();
    await disconnectAdmin();
  });

  beforeEach(() => {
    state.user = FAKE_USERS.sa1;
    state.jwtRole = null;
    state.readOnly = false;
    state.moduleDisabled = false;
    state.runtimeMode = "RUNTIME_CLIENT";
  });

  const snapshot = async (dayId: string) =>
    db.clientWeeklyPlanDay.findUniqueOrThrow({ where: { id: dayId } });

  const editForm = (planId: string, dayId: string) =>
    fd({ plan_id: planId, day_id: dayId, duration_minutes: "99", session_name: "HACKED", trainer_feedback: "HACKED" });
  const markForm = (planId: string, dayId: string) =>
    fd({ plan_id: planId, day_id: dayId, execution_status: "completed", trainer_feedback: "HACKED" });

  type Victim = { name: string; plan: () => SeededPlan; as?: keyof typeof FAKE_USERS; weekday: number };
  const cases: Victim[] = [
    { name: "alumno ajeno (mismo tenant y sede)", plan: () => otherClient, weekday: 1 },
    { name: "otro entrenador", plan: () => otherTrainer, as: "trainerA", weekday: 1 },
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

    it(`markClientPlanDayAction: plan autorizado + day_id de ${c.name} → sin cambios`, async () => {
      state.user = FAKE_USERS[c.as ?? "sa1"];
      const victim = c.plan();
      const before = await snapshot(victim.days[c.weekday]);
      await run(markClientPlanDayAction(markForm(own.planId, victim.days[c.weekday])));
      const after = await snapshot(victim.days[c.weekday]);
      expect(after.execution_status).toBe(before.execution_status);
      expect(after.trainer_feedback).toBe(before.trainer_feedback);
      expect(after.executed_at).toBe(before.executed_at);
    });
  }

  it("portal: el alumno no puede registrar el día de otro alumno ni de otro tenant", async () => {
    state.user = { id: own.clientUserId!, role: "client", tenantId: "it-tenant-1", locationId: "it-branch-1a" };
    for (const victim of [otherClient, otherTenant]) {
      const dayId = Object.values(victim.days)[0];
      const before = await snapshot(dayId);
      const res = await submitPlanDayAction(undefined, fd({ plan_day_id: dayId, execution_status: "completed", client_feedback: "HACKED" }));
      expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
      const after = await snapshot(dayId);
      expect(after.execution_status).toBe(before.execution_status);
      expect(after.client_feedback).toBe(before.client_feedback);
    }
  });

  it("rol LIVE degradado (JWT trainer, LIVE client) pierde el acceso de escritura", async () => {
    state.user = { ...FAKE_USERS.trainerA, role: "client" };
    state.jwtRole = "trainer";
    const dayId = own.days[1];
    const before = await snapshot(dayId);
    await run(markClientPlanDayAction(markForm(own.planId, dayId)));
    await run(updateClientPlanDayAction(undefined, editForm(own.planId, dayId)));
    const after = await snapshot(dayId);
    expect(after.trainer_feedback).toBe(before.trainer_feedback);
    expect(after.execution_status).toBe(before.execution_status);
  });

  it("Support Session (solo lectura) y módulo deshabilitado no escriben", async () => {
    const dayId = own.days[3];
    const before = await snapshot(dayId);
    state.readOnly = true;
    await run(markClientPlanDayAction(markForm(own.planId, dayId)));
    const r1 = await run(updateClientPlanDayAction(undefined, editForm(own.planId, dayId)));
    expect(r1).toEqual(expect.objectContaining({ error: expect.any(String) }));
    state.readOnly = false;
    state.moduleDisabled = true;
    await run(markClientPlanDayAction(markForm(own.planId, dayId)));
    const r2 = await run(updateClientPlanDayAction(undefined, editForm(own.planId, dayId)));
    expect(r2).toEqual(expect.objectContaining({ error: expect.any(String) }));
    const after = await snapshot(dayId);
    expect(after.trainer_feedback).toBe(before.trainer_feedback);
    expect(after.execution_status).toBe(before.execution_status);
  });

  it("control positivo: el entrenador asignado edita un día de SU plan", async () => {
    state.user = FAKE_USERS.trainerA;
    const dayId = own.days[5];
    await run(updateClientPlanDayAction(undefined, fd({ plan_id: own.planId, day_id: dayId, duration_minutes: "45", session_name: "Pierna" })));
    const after = await snapshot(dayId);
    expect(after.duration_minutes).toBe(45);
    expect(after.session_name).toBe("Pierna");
  });
});
