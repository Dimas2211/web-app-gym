// ─────────────────────────────────────────────────────────────────
// commerce/purchases — confirm-purchase.action.test.ts
//
// Bloque B (pasada de cobertura completa) — boundary secundario
// (no create): confirmPurchaseAction con commerce.purchases
// deshabilitado debe bloquear ANTES de invocar confirmPurchase.
//
// Migrado a requireOperationalContext() — certifica además que
// confirmPurchase recibe context.client (runtime efectivo), nunca
// Prisma global implícito.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { getEffectiveLocationIdMock } = vi.hoisted(() => ({
  getEffectiveLocationIdMock: vi.fn(async () => null),
}));

vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: getEffectiveLocationIdMock,
}));

const { confirmPurchaseSpy, requireOperationalContextMock, disposeMock, FakeOperationalContextError } = vi.hoisted(() => {
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
    confirmPurchaseSpy: vi.fn(),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("../services/purchase.service", () => ({
  confirmPurchase: confirmPurchaseSpy,
}));

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { confirmPurchaseAction } from "./confirm-purchase.action";

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

beforeEach(() => {
  confirmPurchaseSpy.mockReset();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  getEffectiveLocationIdMock.mockReset();
  getEffectiveLocationIdMock.mockResolvedValue(null);
});

describe("confirmPurchaseAction — module guard en boundary secundario (no create)", () => {
  it("commerce.purchases deshabilitado -> bloquea, confirmPurchase (write) NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 402),
    );

    const result = await confirmPurchaseAction(undefined, fd({ purchase_id: "p1" }));

    expect(result?.error).toBeTruthy();
    expect(confirmPurchaseSpy).not.toHaveBeenCalled();
  });

  it("usa context.client (runtime efectivo) y context.locationId, nunca prisma global implícito", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker, tenantId: "tenant-1", locationId: "loc-1" }));
    confirmPurchaseSpy.mockResolvedValue({ ok: true });

    await confirmPurchaseAction(undefined, fd({ purchase_id: "p1" }));

    expect(confirmPurchaseSpy).toHaveBeenCalledWith(
      "p1",
      "tenant-1",
      "loc-1",
      "u1",
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("location null (identidad tenant-wide sin cookie seleccionada) -> deniega sin inventar location", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await confirmPurchaseAction(undefined, fd({ purchase_id: "p1" }));

    expect(result?.error).toBeTruthy();
    expect(confirmPurchaseSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
