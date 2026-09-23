// ─────────────────────────────────────────────────────────────────
// core/modules/locations — actions.cross-tenant.test.ts
//
// FASE VI-D3 — ETAPA T/U. Certifica que updateLocation/toggleLocationStatus
// nunca mutan una location de OTRO tenant, aunque el ID sea válido en su
// propia base — el aislamiento nace del WHERE { id, tenant_id: tenantId }
// (SHARED-PILOT-3B: tenant_id es la columna de ownership autoritativa,
// gym_id es opcional y nunca decide pertenencia).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { createLocation, updateLocation, toggleLocationStatus } from "./actions";

const FAKE_CTX = {
  mode: "LEGACY_UNMANAGED",
  tenantId: "tenant-A",
  organizationId: null,
  planId: null,
  verticalId: null,
  effectiveModules: new Map(),
  effectiveEntitlements: new Map(),
} as never;

describe("locations/actions — aislamiento cross-tenant", () => {
  it("2. branch de OTRO tenant -> updateLocation denegado (findFirst con tenant_id no la encuentra)", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const fakeDb = {
      branch: { findFirst, update: vi.fn() },
    } as never;

    const result = await updateLocation(
      "branch-of-tenant-B",
      "tenant-A",
      { name: "Intento de edición cruzada" },
      fakeDb,
    );

    expect(result.success).toBe(false);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "branch-of-tenant-B", tenant_id: "tenant-A" },
      select: { id: true },
    });
  });

  it("2. branch de OTRO tenant -> toggleLocationStatus denegado, nunca cambia status", async () => {
    const updateSpy = vi.fn();
    const fakeDb = {
      branch: { findFirst: vi.fn().mockResolvedValue(null), update: updateSpy },
    } as never;

    const result = await toggleLocationStatus("branch-of-tenant-B", "tenant-A", FAKE_CTX, fakeDb);

    expect(result.success).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("branch propia del tenant -> toggleLocationStatus procede normalmente", async () => {
    const updateSpy = vi.fn().mockResolvedValue({});
    const fakeDb = {
      branch: {
        findFirst: vi.fn().mockResolvedValue({ id: "branch-A1", status: "active" }),
        update: updateSpy,
      },
    } as never;

    const result = await toggleLocationStatus("branch-A1", "tenant-A", FAKE_CTX, fakeDb);

    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});

describe("createLocation — Commerce-only vs GYM", () => {
  it("tenant Commerce-only (sin gymId) -> crea Branch con gym_id null", async () => {
    const createSpy = vi.fn().mockResolvedValue({ id: "branch-new" });
    const fakeDb = {
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ branch: { create: createSpy } })),
    } as never;

    const result = await createLocation("tenant-commerce", { name: "Sede Uno" }, FAKE_CTX, fakeDb);

    expect(result.success).toBe(true);
    expect(createSpy).toHaveBeenCalledWith({
      data: { name: "Sede Uno", address: null, phone: null, tenant_id: "tenant-commerce", gym_id: null, status: "active" },
      select: { id: true },
    });
  });

  it("tenant GYM (con gymId resuelto por el caller) -> crea Branch con gym_id poblado", async () => {
    const createSpy = vi.fn().mockResolvedValue({ id: "branch-new" });
    const fakeDb = {
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ branch: { create: createSpy } })),
    } as never;

    const result = await createLocation("tenant-gym", { name: "Sede Uno" }, FAKE_CTX, fakeDb, "gym-1");

    expect(result.success).toBe(true);
    expect(createSpy).toHaveBeenCalledWith({
      data: { name: "Sede Uno", address: null, phone: null, tenant_id: "tenant-gym", gym_id: "gym-1", status: "active" },
      select: { id: true },
    });
  });
});
