// ─────────────────────────────────────────────────────────────────
// commerce/inventory — record-inventory-movement.action.test.ts
//
// Bloque B (pasada de cobertura completa) — boundary de movement:
// commerce.inventory deshabilitado debe bloquear ANTES de invocar
// recordInventoryMovement (write real de stock).
//
// FASE VI-D3 — migrado a requireOperationalContext(): certifica además
// que la transacción usa context.client (runtime efectivo) y que el
// rol LIVE decide la autorización, no el rol del JWT.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { recordInventoryMovementSpy, requireOperationalContextMock, disposeMock, FakeOperationalContextError } = vi.hoisted(() => {
  class FakeOperationalContextError extends Error {
    code: string;
    httpStatus: number;
    userMessage: string;
    constructor(code: string, userMessage: string, httpStatus: number) {
      super(userMessage);
      this.code = code;
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    recordInventoryMovementSpy: vi.fn(),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("../services/inventory-movement.service", () => ({
  recordInventoryMovement: recordInventoryMovementSpy,
}));

const { getEffectiveLocationIdMock } = vi.hoisted(() => ({
  getEffectiveLocationIdMock: vi.fn(async () => null),
}));

vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: getEffectiveLocationIdMock,
}));

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { recordInventoryMovementAction } from "./record-inventory-movement.action";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

function fakeHandle(overrides: Partial<{ role: string; client: unknown; tenantId: string; locationId: string | null }> = {}) {
  const locationId = "locationId" in overrides ? overrides.locationId! : "loc-1";
  return {
    context: {
      effectiveUser: { id: "u1", role: overrides.role ?? "super_admin", location_id: locationId },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId,
      client: overrides.client ?? { __marker: "RUNTIME_CLIENT_DB" },
    },
    dispose: disposeMock,
  };
}

const VALID_FORM = fd({ product_location_id: "550e8400-e29b-41d4-a716-446655440000", movement_type: "MANUAL_IN", quantity: "5" });

beforeEach(() => {
  recordInventoryMovementSpy.mockReset();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  getEffectiveLocationIdMock.mockReset();
  getEffectiveLocationIdMock.mockResolvedValue(null);
});

describe("recordInventoryMovementAction — FASE VI-D3", () => {
  it("commerce.inventory deshabilitado (module gate del helper) -> bloquea, recordInventoryMovement NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 402),
    );

    const result = await recordInventoryMovementAction(undefined, VALID_FORM);

    expect(result?.error).toBeTruthy();
    expect(recordInventoryMovementSpy).not.toHaveBeenCalled();
  });

  it("usa context.client (runtime efectivo) y context.locationId, nunca prisma global implícito", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker, tenantId: "tenant-1", locationId: "loc-1" }));
    recordInventoryMovementSpy.mockResolvedValue({ ok: true });

    await recordInventoryMovementAction(undefined, VALID_FORM);

    expect(recordInventoryMovementSpy).toHaveBeenCalledWith(
      "tenant-1",
      "loc-1",
      "u1",
      expect.anything(),
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("rol LIVE (reception) sin canManageStaff -> deniega, recordInventoryMovement NUNCA se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ role: "reception" }));

    const result = await recordInventoryMovementAction(undefined, VALID_FORM);

    expect(result?.error).toBeTruthy();
    expect(recordInventoryMovementSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("location null (identidad tenant-wide sin cookie seleccionada) -> deniega sin inventar location", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await recordInventoryMovementAction(undefined, VALID_FORM);

    expect(result?.error).toBeTruthy();
    expect(recordInventoryMovementSpy).not.toHaveBeenCalled();
  });
});
