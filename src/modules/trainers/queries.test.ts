// ─────────────────────────────────────────────────────────────────
// trainers — queries.test.ts
//
// PASO 6C — Auditoría de aislamiento GYM: getTrainers usaba el prisma
// singleton SIEMPRE. Este test fija que ahora acepta un `client`
// inyectable y lo usa en vez del singleton.
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
  prisma: { trainer: { findMany: normalPrismaFindManySpy, findFirst: normalPrismaFindFirstSpy } },
}));

import { getTrainers, getTrainerById } from "./queries";

const SUPER_ADMIN = { id: "u1", tenant_id: "tenant-trustme", role: "super_admin" } as never;

beforeEach(() => {
  normalPrismaFindManySpy.mockClear();
});

describe("getTrainers — runtime-aware", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindManySpy = vi.fn(async () => []);
    const runtimeClient = { trainer: { findMany: runtimeFindManySpy } } as never;

    await getTrainers(SUPER_ADMIN, {}, runtimeClient);

    expect(runtimeFindManySpy).toHaveBeenCalledTimes(1);
    expect(normalPrismaFindManySpy).not.toHaveBeenCalled();
  });

  it("el where usa tenant_id del `user` recibido — el caller debe pasar el tenant EFECTIVO", async () => {
    const runtimeFindManySpy = vi.fn(async (args: { where: { tenant_id: string } }) => {
      void args;
      return [];
    });
    const runtimeClient = { trainer: { findMany: runtimeFindManySpy } } as never;

    await getTrainers(SUPER_ADMIN, {}, runtimeClient);

    const callArgs = runtimeFindManySpy.mock.calls[0][0];
    expect(callArgs.where.tenant_id).toBe("tenant-trustme");
  });
});

describe("getTrainerById — runtime-aware + cross-tenant scope (páginas de detalle/edit/availability)", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindFirstSpy = vi.fn(async () => null);
    const runtimeClient = { trainer: { findFirst: runtimeFindFirstSpy } } as never;

    await getTrainerById("trainer-1", SUPER_ADMIN, runtimeClient);

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
    const runtimeClient = { trainer: { findFirst: runtimeFindFirstSpy } } as never;

    const result = await getTrainerById("trainer-de-otro-tenant", SUPER_ADMIN, runtimeClient);

    expect(result).toBeNull();
    const callArgs = runtimeFindFirstSpy.mock.calls[0][0];
    expect(callArgs.where.tenant_id).toBe("tenant-trustme");
  });
});
