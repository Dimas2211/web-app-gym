// ─────────────────────────────────────────────────────────────────
// classes — queries.test.ts
//
// PASO 6C — Auditoría de aislamiento GYM: getScheduledClasses /
// getUpcomingClasses usaban el prisma singleton SIEMPRE. Este test
// fija que ahora aceptan un `client` inyectable y lo usan en vez del
// singleton.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { normalPrismaFindManySpy, normalPrismaFindFirstSpy } = vi.hoisted(() => ({
  normalPrismaFindManySpy: vi.fn(async () => {
    throw new Error("BUG: se usó el prisma singleton normal en vez del client runtime inyectado");
  }),
  normalPrismaFindFirstSpy: vi.fn(async () => {
    throw new Error("BUG: se usó el prisma singleton normal en vez del client runtime inyectado");
  }),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { scheduledClass: { findMany: normalPrismaFindManySpy, findFirst: normalPrismaFindFirstSpy } },
}));

import { getScheduledClasses, getUpcomingClasses, getScheduledClassById } from "./queries";

const SUPER_ADMIN = { id: "u1", tenant_id: "tenant-trustme", role: "super_admin" } as never;

beforeEach(() => {
  normalPrismaFindManySpy.mockClear();
});

describe("getScheduledClasses — runtime-aware", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindManySpy = vi.fn(async () => []);
    const runtimeClient = { scheduledClass: { findMany: runtimeFindManySpy } } as never;

    await getScheduledClasses(SUPER_ADMIN, {}, runtimeClient);

    expect(runtimeFindManySpy).toHaveBeenCalledTimes(1);
    expect(normalPrismaFindManySpy).not.toHaveBeenCalled();
  });
});

describe("getUpcomingClasses — runtime-aware", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindManySpy = vi.fn(async () => []);
    const runtimeClient = { scheduledClass: { findMany: runtimeFindManySpy } } as never;

    await getUpcomingClasses(SUPER_ADMIN, {}, runtimeClient);

    expect(runtimeFindManySpy).toHaveBeenCalledTimes(1);
    expect(normalPrismaFindManySpy).not.toHaveBeenCalled();
  });
});

describe("getScheduledClassById — runtime-aware + cross-tenant scope (página de detalle/edit)", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindFirstSpy = vi.fn(async () => null);
    const runtimeClient = { scheduledClass: { findFirst: runtimeFindFirstSpy } } as never;

    await getScheduledClassById("class-1", SUPER_ADMIN, runtimeClient);

    expect(runtimeFindFirstSpy).toHaveBeenCalledTimes(1);
    expect(normalPrismaFindFirstSpy).not.toHaveBeenCalled();
  });

  it("CASO B — un ID de otro tenant nunca se resuelve: el where siempre incluye el tenant_id efectivo", async () => {
    const runtimeFindFirstSpy = vi.fn(async (args: { where: { tenant_id: string } }) => {
      if (args.where.tenant_id !== "tenant-trustme") {
        throw new Error("BUG: query cross-tenant sin scope efectivo");
      }
      return null;
    });
    const runtimeClient = { scheduledClass: { findFirst: runtimeFindFirstSpy } } as never;

    const result = await getScheduledClassById("class-de-otro-tenant", SUPER_ADMIN, runtimeClient);

    expect(result).toBeNull();
    const callArgs = runtimeFindFirstSpy.mock.calls[0][0];
    expect(callArgs.where.tenant_id).toBe("tenant-trustme");
  });
});
