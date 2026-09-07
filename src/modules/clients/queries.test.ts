// ─────────────────────────────────────────────────────────────────
// clients — queries.test.ts
//
// PASO 6D — Auditoría de aislamiento GYM (ruta transitiva /dashboard/clients):
// getClients / getClientById usaban el prisma singleton SIEMPRE, sin
// importar si había una sesión runtime "Operar como cliente" activa.
// Estos tests fijan que ahora aceptan un `client` inyectable y lo usan
// en vez del singleton, y que un ID de otro tenant nunca se resuelve.
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
  prisma: {
    client: { findMany: normalFindManySpy, findFirst: normalFindFirstSpy },
  },
}));

import { getClients, getClientById } from "./queries";

const SUPER_ADMIN = { id: "u1", tenant_id: "tenant-trustme", role: "super_admin" } as never;

beforeEach(() => {
  normalFindManySpy.mockClear();
  normalFindFirstSpy.mockClear();
});

describe("getClients — runtime-aware", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindManySpy = vi.fn(async () => []);
    const runtimeClient = { client: { findMany: runtimeFindManySpy } } as never;

    await getClients(SUPER_ADMIN, {}, runtimeClient);

    expect(runtimeFindManySpy).toHaveBeenCalledTimes(1);
    expect(normalFindManySpy).not.toHaveBeenCalled();
  });
});

describe("getClientById — runtime-aware + cross-tenant scope (ficha de cliente enlazada desde memberships/trainers/weekly-plans)", () => {
  it("con `client` runtime inyectado, consulta ESE client — nunca el prisma singleton", async () => {
    const runtimeFindFirstSpy = vi.fn(async () => null);
    const runtimeClient = { client: { findFirst: runtimeFindFirstSpy } } as never;

    await getClientById("client-1", SUPER_ADMIN, runtimeClient);

    expect(runtimeFindFirstSpy).toHaveBeenCalledTimes(1);
    expect(normalFindFirstSpy).not.toHaveBeenCalled();
  });

  it("CASO D — un ID de cliente de otro tenant nunca se resuelve: el where siempre incluye el tenant_id efectivo", async () => {
    const runtimeFindFirstSpy = vi.fn(async (args: { where: { tenant_id: string } }) => {
      if (args.where.tenant_id !== "tenant-trustme") {
        throw new Error("BUG: query cross-tenant sin scope efectivo");
      }
      return null;
    });
    const runtimeClient = { client: { findFirst: runtimeFindFirstSpy } } as never;

    const result = await getClientById("client-de-otro-tenant", SUPER_ADMIN, runtimeClient);

    expect(result).toBeNull();
    const callArgs = runtimeFindFirstSpy.mock.calls[0][0];
    expect(callArgs.where.tenant_id).toBe("tenant-trustme");
  });
});
