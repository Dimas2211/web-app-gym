// ─────────────────────────────────────────────────────────────────
// branches — queries.test.ts
//
// PASO 6E — Microauditoría de superficies residuales: getBranches /
// getBranchById usaban el prisma singleton SIEMPRE si no se pasaba
// `client`. Este test fija que ahora aceptan un `client` inyectable y
// lo usan en vez del singleton, y que un ID de otro tenant no se resuelve.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { normalFindManySpy, normalFindFirstSpy } = vi.hoisted(() => ({
  normalFindManySpy: vi.fn(async () => {
    throw new Error("BUG: se usó el prisma singleton normal en vez del client runtime inyectado");
  }),
  normalFindFirstSpy: vi.fn(async () => {
    throw new Error("BUG: se usó el prisma singleton normal en vez del client runtime inyectado");
  }),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { branch: { findMany: normalFindManySpy, findFirst: normalFindFirstSpy } },
}));

import { getBranches, getBranchById } from "./queries";

const SUPER_ADMIN = { id: "u1", tenant_id: "tenant-trustme", role: "super_admin" } as never;

beforeEach(() => {
  normalFindManySpy.mockClear();
  normalFindFirstSpy.mockClear();
});

describe("getBranches — runtime-aware", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindManySpy = vi.fn(async () => []);
    const runtimeClient = { branch: { findMany: runtimeFindManySpy } } as never;

    await getBranches(SUPER_ADMIN, runtimeClient);

    expect(runtimeFindManySpy).toHaveBeenCalledTimes(1);
    expect(normalFindManySpy).not.toHaveBeenCalled();
  });
});

describe("getBranchById — runtime-aware + cross-tenant scope", () => {
  it("CASO B — un ID de otro tenant nunca se resuelve: el where siempre incluye el tenant_id efectivo", async () => {
    const runtimeFindFirstSpy = vi.fn(async (args: { where: { tenant_id: string } }) => {
      if (args.where.tenant_id !== "tenant-trustme") {
        throw new Error("BUG: query cross-tenant sin scope efectivo");
      }
      return null;
    });
    const runtimeClient = { branch: { findFirst: runtimeFindFirstSpy } } as never;

    const result = await getBranchById("branch-de-otro-tenant", SUPER_ADMIN, runtimeClient);

    expect(result).toBeNull();
    expect(normalFindFirstSpy).not.toHaveBeenCalled();
  });
});
