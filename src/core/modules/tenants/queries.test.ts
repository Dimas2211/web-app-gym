// ─────────────────────────────────────────────────────────────────
// core/modules/tenants — queries.test.ts
//
// SHARED-PILOT-3 certification. getTenantById debe leer runtime_tenants
// (la raíz neutral), no gyms — Gym es una extensión vertical opcional
// resuelta vía la relación `gym` únicamente para logo_url.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

const runtimeTenantFindUniqueMock = vi.fn();
const runtimeTenantFindManyMock = vi.fn();
const gymFindUniqueMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    runtimeTenant: {
      findUnique: (...args: unknown[]) => runtimeTenantFindUniqueMock(...args),
      findMany: (...args: unknown[]) => runtimeTenantFindManyMock(...args),
    },
    gym: {
      findUnique: (...args: unknown[]) => gymFindUniqueMock(...args),
    },
  },
}));

import { getTenantById, isTenantActive } from "./queries";

describe("getTenantById", () => {
  it("lee runtime_tenants (no gyms) y nunca gym.findUnique por id de tenant", async () => {
    runtimeTenantFindUniqueMock.mockResolvedValue({
      id: "rt-1",
      name: "Cliente A",
      slug: "cliente-a",
      status: "active",
      created_at: new Date("2026-01-01"),
      updated_at: new Date("2026-01-02"),
      gym: { logo_url: "https://example.com/logo.png" },
    });

    const tenant = await getTenantById("rt-1");

    expect(runtimeTenantFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rt-1" } })
    );
    expect(gymFindUniqueMock).not.toHaveBeenCalled();
    expect(tenant).toEqual({
      id: "rt-1",
      name: "Cliente A",
      slug: "cliente-a",
      logo_url: "https://example.com/logo.png",
      status: "active",
      created_at: new Date("2026-01-01"),
      updated_at: new Date("2026-01-02"),
    });
  });

  it("retorna logo_url null cuando el RuntimeTenant no tiene vertical Gym (commerce puro)", async () => {
    runtimeTenantFindUniqueMock.mockResolvedValue({
      id: "rt-2",
      name: "Cliente B",
      slug: "cliente-b",
      status: "active",
      created_at: new Date("2026-01-01"),
      updated_at: new Date("2026-01-02"),
      gym: null,
    });

    const tenant = await getTenantById("rt-2");

    expect(tenant?.logo_url).toBeNull();
  });

  it("retorna null si el RuntimeTenant no existe", async () => {
    runtimeTenantFindUniqueMock.mockResolvedValue(null);

    const tenant = await getTenantById("rt-missing");

    expect(tenant).toBeNull();
  });
});

describe("isTenantActive", () => {
  it("es true solo cuando el RuntimeTenant existe y status=active", async () => {
    runtimeTenantFindUniqueMock.mockResolvedValueOnce({
      id: "rt-1",
      name: "Cliente A",
      slug: "cliente-a",
      status: "suspended",
      created_at: new Date(),
      updated_at: new Date(),
      gym: null,
    });

    expect(await isTenantActive("rt-1")).toBe(false);
  });
});
