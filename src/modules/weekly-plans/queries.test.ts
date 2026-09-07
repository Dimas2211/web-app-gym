// ─────────────────────────────────────────────────────────────────
// weekly-plans — queries.test.ts
//
// PASO 6C — Auditoría de aislamiento GYM: getClientWeeklyPlans /
// getWeeklyPlanTemplates usaban el prisma singleton SIEMPRE. Este
// test fija que ahora aceptan un `client` inyectable y lo usan en vez
// del singleton.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { normalPrismaFindManySpy, normalTrainerFindFirstSpy, normalFindFirstSpy } = vi.hoisted(() => ({
  normalPrismaFindManySpy: vi.fn(async () => {
    throw new Error("BUG: se usó el prisma singleton normal en vez del client runtime inyectado");
  }),
  normalTrainerFindFirstSpy: vi.fn(async () => {
    throw new Error("BUG: se usó el prisma singleton normal en vez del client runtime inyectado");
  }),
  normalFindFirstSpy: vi.fn(async () => {
    throw new Error("BUG: se usó el prisma singleton normal en vez del client runtime inyectado");
  }),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    clientWeeklyPlan: { findMany: normalPrismaFindManySpy, findFirst: normalFindFirstSpy },
    weeklyPlanTemplate: { findMany: normalPrismaFindManySpy, findFirst: normalFindFirstSpy },
    trainer: { findFirst: normalTrainerFindFirstSpy },
  },
}));

import {
  getClientWeeklyPlans,
  getWeeklyPlanTemplates,
  getClientWeeklyPlanById,
  getWeeklyPlanTemplateById,
} from "./queries";

const SUPER_ADMIN = { id: "u1", tenant_id: "tenant-trustme", role: "super_admin" } as never;

beforeEach(() => {
  normalPrismaFindManySpy.mockClear();
  normalTrainerFindFirstSpy.mockClear();
  normalFindFirstSpy.mockClear();
});

describe("getClientWeeklyPlans — runtime-aware", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindManySpy = vi.fn(async () => []);
    const runtimeClient = { clientWeeklyPlan: { findMany: runtimeFindManySpy } } as never;

    await getClientWeeklyPlans(SUPER_ADMIN, {}, runtimeClient);

    expect(runtimeFindManySpy).toHaveBeenCalledTimes(1);
    expect(normalPrismaFindManySpy).not.toHaveBeenCalled();
  });
});

describe("getWeeklyPlanTemplates — runtime-aware", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindManySpy = vi.fn(async () => []);
    const runtimeClient = { weeklyPlanTemplate: { findMany: runtimeFindManySpy } } as never;

    await getWeeklyPlanTemplates(SUPER_ADMIN, {}, runtimeClient);

    expect(runtimeFindManySpy).toHaveBeenCalledTimes(1);
    expect(normalPrismaFindManySpy).not.toHaveBeenCalled();
  });
});

describe("getClientWeeklyPlanById — runtime-aware + cross-tenant scope (página de detalle/edit)", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindFirstSpy = vi.fn(async () => null);
    const runtimeClient = { clientWeeklyPlan: { findFirst: runtimeFindFirstSpy } } as never;

    await getClientWeeklyPlanById("plan-1", SUPER_ADMIN, runtimeClient);

    expect(runtimeFindFirstSpy).toHaveBeenCalledTimes(1);
    expect(normalFindFirstSpy).not.toHaveBeenCalled();
  });

  it("CASO B — un ID de otro tenant nunca se resuelve: el where siempre incluye el tenant_id efectivo", async () => {
    const runtimeFindFirstSpy = vi.fn(async (args: { where: { tenant_id: string } }) => {
      if (args.where.tenant_id !== "tenant-trustme") {
        throw new Error("BUG: query cross-tenant sin scope efectivo");
      }
      return null;
    });
    const runtimeClient = { clientWeeklyPlan: { findFirst: runtimeFindFirstSpy } } as never;

    const result = await getClientWeeklyPlanById("plan-de-otro-tenant", SUPER_ADMIN, runtimeClient);

    expect(result).toBeNull();
    const callArgs = runtimeFindFirstSpy.mock.calls[0][0];
    expect(callArgs.where.tenant_id).toBe("tenant-trustme");
  });
});

describe("getWeeklyPlanTemplateById — runtime-aware + cross-tenant scope (página de detalle/edit)", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindFirstSpy = vi.fn(async () => null);
    const runtimeClient = { weeklyPlanTemplate: { findFirst: runtimeFindFirstSpy } } as never;

    await getWeeklyPlanTemplateById("template-1", SUPER_ADMIN, runtimeClient);

    expect(runtimeFindFirstSpy).toHaveBeenCalledTimes(1);
    expect(normalFindFirstSpy).not.toHaveBeenCalled();
  });
});
