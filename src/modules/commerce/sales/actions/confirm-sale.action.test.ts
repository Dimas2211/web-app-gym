// ─────────────────────────────────────────────────────────────────
// commerce/sales — confirm-sale.action.test.ts
//
// Bloque B (pasada de cobertura completa) — boundary secundario
// (no create): confirmSaleAction con commerce.sales deshabilitado
// debe bloquear ANTES de invocar confirmSale (el service/write real
// nunca se ejecuta).
//
// Migrado a requireOperationalContext() (runtime context pattern):
// certifica además que confirmSale se invoca con context.client
// (runtime efectivo), nunca con el Prisma global implícito.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { getEffectiveLocationIdMock } = vi.hoisted(() => ({
  getEffectiveLocationIdMock: vi.fn(async (): Promise<string | null> => "loc-1"),
}));

vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: getEffectiveLocationIdMock,
}));

const { confirmSaleSpy, requireOperationalContextMock, disposeMock, FakeOperationalContextError } = vi.hoisted(() => {
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
    confirmSaleSpy: vi.fn(),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("../services/sale.service", () => ({
  confirmSale: confirmSaleSpy,
}));

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { confirmSaleAction } from "./confirm-sale.action";

function fakeHandle(overrides: Partial<{ tenantId: string; locationId: string | null; client: unknown; userId: string }> = {}) {
  const locationId = "locationId" in overrides ? overrides.locationId! : "loc-1";
  return {
    context: {
      effectiveUser: { id: overrides.userId ?? "u1", role: "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId,
      client: overrides.client ?? { __marker: "RUNTIME_CLIENT_DB" },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  confirmSaleSpy.mockReset();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  getEffectiveLocationIdMock.mockReset();
  getEffectiveLocationIdMock.mockResolvedValue("loc-1");
});

describe("confirmSaleAction — module guard en boundary secundario (no create)", () => {
  it("commerce.sales deshabilitado -> bloquea, confirmSale (write) NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 402),
    );

    const result = await confirmSaleAction("sale-1");

    expect(result.ok).toBe(false);
    expect(confirmSaleSpy).not.toHaveBeenCalled();
  });

  it("commerce.sales habilitado -> permite continuar hasta el service, usando context.client", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    confirmSaleSpy.mockResolvedValue({ ok: true });

    const result = await confirmSaleAction("sale-1");

    expect(confirmSaleSpy).toHaveBeenCalledTimes(1);
    expect(confirmSaleSpy).toHaveBeenCalledWith("sale-1", "tenant-1", "loc-1", "u1", runtimeDbMarker);
    expect(result.ok).toBe(true);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("location null (identidad tenant-wide sin cookie seleccionada ni fallback) -> deniega sin inventar location", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));
    getEffectiveLocationIdMock.mockResolvedValue(null);

    const result = await confirmSaleAction("sale-1");

    expect(result.ok).toBe(false);
    expect(confirmSaleSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
