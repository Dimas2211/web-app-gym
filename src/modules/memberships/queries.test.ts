// ─────────────────────────────────────────────────────────────────
// memberships — queries.test.ts
//
// PASO 6C — Auditoría de aislamiento GYM: getClientMemberships /
// getMembershipPlans usaban el prisma singleton SIEMPRE, sin importar
// si había una sesión runtime "Operar como cliente" activa. Estos
// tests fijan que ahora aceptan un `client` inyectable y lo usan en
// vez del singleton — condición necesaria para que
// resolveEffectiveTenantContext(...).client realmente tenga efecto.
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
  prisma: {
    clientMembership: { findMany: normalPrismaFindManySpy, findFirst: normalPrismaFindFirstSpy },
    membershipPlan: { findMany: normalPrismaFindManySpy },
  },
}));

import { getClientMemberships, getMembershipPlans, getClientMembershipById } from "./queries";

const SUPER_ADMIN = { id: "u1", tenant_id: "tenant-trustme", role: "super_admin" } as never;

beforeEach(() => {
  normalPrismaFindManySpy.mockClear();
});

describe("getClientMemberships — runtime-aware", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindManySpy = vi.fn(async () => []);
    const runtimeClient = { clientMembership: { findMany: runtimeFindManySpy } } as never;

    await getClientMemberships(SUPER_ADMIN, {}, runtimeClient);

    expect(runtimeFindManySpy).toHaveBeenCalledTimes(1);
    expect(normalPrismaFindManySpy).not.toHaveBeenCalled();
  });

  it("el where usa tenant_id del `user` recibido — el caller debe pasar el tenant EFECTIVO", async () => {
    const runtimeFindManySpy = vi.fn(async (args: { where: { tenant_id: string } }) => {
      void args;
      return [];
    });
    const runtimeClient = { clientMembership: { findMany: runtimeFindManySpy } } as never;

    await getClientMemberships(SUPER_ADMIN, {}, runtimeClient);

    const callArgs = runtimeFindManySpy.mock.calls[0][0];
    expect(callArgs.where.tenant_id).toBe("tenant-trustme");
  });
});

describe("getMembershipPlans — runtime-aware", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindManySpy = vi.fn(async () => []);
    const runtimeClient = { membershipPlan: { findMany: runtimeFindManySpy } } as never;

    await getMembershipPlans(SUPER_ADMIN, {}, runtimeClient);

    expect(runtimeFindManySpy).toHaveBeenCalledTimes(1);
    expect(normalPrismaFindManySpy).not.toHaveBeenCalled();
  });
});

describe("getClientMembershipById — runtime-aware + cross-tenant scope (páginas de detalle/edit)", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindFirstSpy = vi.fn(async () => null);
    const runtimeClient = { clientMembership: { findFirst: runtimeFindFirstSpy } } as never;

    await getClientMembershipById("membership-1", SUPER_ADMIN, runtimeClient);

    expect(runtimeFindFirstSpy).toHaveBeenCalledTimes(1);
    expect(normalPrismaFindFirstSpy).not.toHaveBeenCalled();
  });

  it("CASO B — un ID que pertenece a otro tenant nunca se resuelve: el where siempre incluye el tenant_id efectivo", async () => {
    // Simula la DB runtime: solo tiene registros del tenant efectivo (tenant-trustme).
    // Un ID válido pero de otro tenant (tenant-real) debe llegar con ese filtro
    // y la query (real, no simulada) nunca lo devolvería.
    const runtimeFindFirstSpy = vi.fn(async (args: { where: { tenant_id: string } }) => {
      // Verificamos que el caller nunca pide sin tenant_id ni con el tenant_id incorrecto.
      if (args.where.tenant_id !== "tenant-trustme") {
        throw new Error("BUG: query cross-tenant sin scope efectivo");
      }
      return null;
    });
    const runtimeClient = { clientMembership: { findFirst: runtimeFindFirstSpy } } as never;

    const result = await getClientMembershipById("membership-de-otro-tenant", SUPER_ADMIN, runtimeClient);

    expect(result).toBeNull();
    expect(runtimeFindFirstSpy).toHaveBeenCalledTimes(1);
    const callArgs = runtimeFindFirstSpy.mock.calls[0][0];
    expect(callArgs.where.tenant_id).toBe("tenant-trustme");
  });
});
