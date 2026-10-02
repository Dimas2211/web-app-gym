// ─────────────────────────────────────────────────────────────────
// lib/location/active-location.test.ts
//
// FEX11-RUNTIME-WRITES-FINAL-CLOSURE — createExportSaleAction delega la
// location activa de RUNTIME_CLIENT tenant-wide en getEffectiveLocationId.
// Aquí se certifica que ese helper valida la cookie contra la DB runtime
// recibida y el tenant efectivo, y falla cerrado en cualquier otro caso.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { cookieGet, globalPrisma } = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  globalPrisma: new Proxy({}, { get: () => { throw new Error("Prisma global no debe usarse"); } }),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: cookieGet })) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: globalPrisma }));

const getLocationByIdMock = vi.fn();
vi.mock("@/core/modules/locations/queries", () => ({
  getLocationById: (...args: unknown[]) => getLocationByIdMock(...args),
}));

import { getEffectiveLocationId } from "./active-location";
import type { SessionUser } from "@/lib/permissions/guards";
import type { PrismaClient } from "@prisma/client";

const runtimeDb = { __runtimeDb: true } as unknown as PrismaClient;
const tenantWideUser = { id: "user-1", tenant_id: "tenant-RT", location_id: null } as unknown as SessionUser;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getEffectiveLocationId — RUNTIME_CLIENT", () => {
  it("cookie válida del tenant efectivo → devuelve la location validada en la DB runtime", async () => {
    cookieGet.mockReturnValue({ value: "loc-selected" });
    getLocationByIdMock.mockResolvedValue({ id: "loc-selected", tenant_id: "tenant-RT" });

    await expect(getEffectiveLocationId(tenantWideUser, runtimeDb, "tenant-RT")).resolves.toBe("loc-selected");
    expect(getLocationByIdMock).toHaveBeenCalledWith("loc-selected", "tenant-RT", runtimeDb);
  });

  it("cookie ausente → null, sin consulta", async () => {
    cookieGet.mockReturnValue(undefined);

    await expect(getEffectiveLocationId(tenantWideUser, runtimeDb, "tenant-RT")).resolves.toBeNull();
    expect(getLocationByIdMock).not.toHaveBeenCalled();
  });

  it("cookie inválida (no existe en la DB runtime) → null", async () => {
    cookieGet.mockReturnValue({ value: "loc-ghost" });
    getLocationByIdMock.mockResolvedValue(null);

    await expect(getEffectiveLocationId(tenantWideUser, runtimeDb, "tenant-RT")).resolves.toBeNull();
  });

  it("location de otro tenant → null", async () => {
    cookieGet.mockReturnValue({ value: "loc-foreign" });
    getLocationByIdMock.mockResolvedValue({ id: "loc-foreign", tenant_id: "tenant-OTHER" });

    await expect(getEffectiveLocationId(tenantWideUser, runtimeDb, "tenant-RT")).resolves.toBeNull();
  });

  it("usuario con location fija → JWT, sin leer cookie", async () => {
    const fixed = { ...tenantWideUser, location_id: "loc-jwt" } as SessionUser;

    await expect(getEffectiveLocationId(fixed, runtimeDb, "tenant-RT")).resolves.toBe("loc-jwt");
    expect(cookieGet).not.toHaveBeenCalled();
  });
});
