// ─────────────────────────────────────────────────────────────────
// core/modules/locations — actions.cross-tenant.test.ts
//
// FASE VI-D3 — ETAPA T/U. Certifica que updateLocation/toggleLocationStatus
// nunca mutan una location de OTRO tenant, aunque el ID sea válido en su
// propia base — el aislamiento nace del WHERE { id, gym_id: tenantId }.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { updateLocation, toggleLocationStatus } from "./actions";

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
  it("2. branch de OTRO tenant -> updateLocation denegado (findFirst con gym_id no la encuentra)", async () => {
    const fakeDb = {
      branch: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    } as never;

    const result = await updateLocation(
      "branch-of-tenant-B",
      "tenant-A",
      { name: "Intento de edición cruzada" },
      fakeDb,
    );

    expect(result.success).toBe(false);
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
