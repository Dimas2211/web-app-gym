// ─────────────────────────────────────────────────────────────────
// GYM-5A auditoría independiente H01 — las acciones de plantillas de planes
// semanales autorizan por el rol y la sede LIVE, no por el JWT.
// Contra PostgreSQL REAL desechable (se omite sin GYM_BOOKING_IT_*).
//
// Escrito ANTES de la corrección: createTemplateAction pasaba requireAdmin
// (JWT) y no exigía que el rol LIVE fuera super_admin o branch_admin, así que
// un JWT super_admin con rol LIVE reception creaba plantillas.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async () => (await import("./testing/plan-action-mocks")).navigationMock());
vi.mock("@/lib/permissions/guards", async () => (await import("./testing/plan-action-mocks")).guardsMock());
vi.mock("@/modules/platform/runtime/require-operational-context", async () => (await import("./testing/plan-action-mocks")).operationalContextMock());

import { createItDatabase, disconnectAdmin, IT_ENABLED, type ItDatabase } from "@/modules/classes/booking/testing/pg-it-harness";
import { FAKE_USERS, seedPlanWorld, W } from "./testing/plan-it-harness";
import { formData as fd, planActionState as state, resetPlanActionState, runAction as run } from "./testing/plan-action-mocks";
import {
  createTemplateAction,
  deleteTemplateAction,
  toggleTemplateStatusAction,
  updateTemplateAction,
  upsertTemplateDayAction,
} from "./actions";

describe.skipIf(!IT_ENABLED)("GYM-5A H01 — plantillas autorizadas por rol/sede LIVE (PostgreSQL real)", () => {
  let it5: ItDatabase;
  let db: PrismaClient;

  beforeAll(async () => {
    it5 = await createItDatabase();
    db = it5.db;
    await seedPlanWorld(db);
  }, 180_000);

  afterAll(async () => {
    await it5?.drop();
    await disconnectAdmin();
  });

  beforeEach(() => {
    resetPlanActionState(FAKE_USERS.sa1);
    state.db = db;
  });

  const templateCount = () => db.weeklyPlanTemplate.count();
  const create = (name: string, extra: Record<string, string> = {}) => run(createTemplateAction(undefined, fd({ name, ...extra })));

  it("H01 JWT super_admin + rol LIVE reception → no crea plantilla", async () => {
    state.user = { ...FAKE_USERS.rc1, locationId: null };
    state.jwtRole = "super_admin";
    const n0 = await templateCount();
    const res = await create("H01-reception");
    expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(await templateCount()).toBe(n0);
    expect(await db.weeklyPlanTemplate.count({ where: { name: "H01-reception" } })).toBe(0);
  });

  for (const live of ["trainer", "client"] as const) {
    it(`H01 JWT super_admin + rol LIVE ${live} → no crea plantilla`, async () => {
      state.user = { ...FAKE_USERS.tr1, role: live };
      state.jwtRole = "super_admin";
      const n0 = await templateCount();
      expect(await create(`H01-${live}`)).toEqual(expect.objectContaining({ error: expect.any(String) }));
      expect(await templateCount()).toBe(n0);
    });
  }

  it("H01 JWT branch_admin con sede trasladada (sede LIVE distinta) → no crea plantilla", async () => {
    await db.user.update({ where: { id: W.U_BA1 }, data: { branch_id: W.B2 } });
    try {
      state.user = FAKE_USERS.ba1; // JWT/contexto aún con B1
      const n0 = await templateCount();
      expect(await create("H01-stale-branch")).toEqual(expect.objectContaining({ error: expect.any(String) }));
      expect(await templateCount()).toBe(n0);
    } finally {
      await db.user.update({ where: { id: W.U_BA1 }, data: { branch_id: W.B1 } });
    }
  });

  it("H01 módulo deshabilitado y Support Session (solo lectura) no crean", async () => {
    const n0 = await templateCount();
    state.moduleDisabled = true;
    expect(await create("H01-module-off")).toEqual(expect.objectContaining({ error: expect.any(String) }));
    state.moduleDisabled = false;
    state.readOnly = true;
    expect(await create("H01-readonly")).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(await templateCount()).toBe(n0);
  });

  it("control positivo: super_admin LIVE crea; branch_admin LIVE crea en su sede y global, no en otra sede", async () => {
    expect(await create("H01-ok-sa")).toBeUndefined();
    expect(await db.weeklyPlanTemplate.count({ where: { name: "H01-ok-sa" } })).toBe(1);

    state.user = FAKE_USERS.ba1;
    expect(await create("H01-ok-ba-own", { branch_id: W.B1 })).toBeUndefined();
    expect(await create("H01-ok-ba-global")).toBeUndefined();
    expect(await create("H01-ba-other", { branch_id: W.B2 })).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(await db.weeklyPlanTemplate.count({ where: { name: { in: ["H01-ok-ba-own", "H01-ok-ba-global"] } } })).toBe(2);
    expect(await db.weeklyPlanTemplate.count({ where: { name: "H01-ba-other" } })).toBe(0);
  });

  it("acciones relacionadas: JWT super_admin + rol LIVE reception no edita, alterna, agrega día ni elimina", async () => {
    state.user = { ...FAKE_USERS.rc1, locationId: null };
    state.jwtRole = "super_admin";
    const before = await db.weeklyPlanTemplate.findUniqueOrThrow({ where: { id: W.TPL_T1 } });
    const days0 = await db.weeklyPlanTemplateDay.count({ where: { template_id: W.TPL_T1 } });

    await run(updateTemplateAction(undefined, fd({ id: W.TPL_T1, name: "HACKED" })));
    await run(toggleTemplateStatusAction(fd({ id: W.TPL_T1 })));
    await run(upsertTemplateDayAction(undefined, fd({ template_id: W.TPL_T1, weekday: "2", duration_minutes: "30" })));
    await run(deleteTemplateAction(undefined, fd({ id: W.TPL_T1 })));

    const after = await db.weeklyPlanTemplate.findUniqueOrThrow({ where: { id: W.TPL_T1 } });
    expect(after.name).toBe(before.name);
    expect(after.status).toBe(before.status);
    expect(await db.weeklyPlanTemplateDay.count({ where: { template_id: W.TPL_T1 } })).toBe(days0);
  });
});
