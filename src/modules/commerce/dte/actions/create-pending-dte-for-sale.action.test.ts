// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-pending-dte-for-sale.action.test.ts
//
// FASE VI-E3 — migra a requireOperationalContext. Certifica:
//   - Support Session (READ_ONLY) bloquea antes de llamar al service.
//   - Modo normal reenvía context.tenantId/locationId/client al service.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, createPendingDteForSaleSpy } = vi.hoisted(() => {
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
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
    createPendingDteForSaleSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/dte-outgoing.service", () => ({
  createPendingDteForSale: createPendingDteForSaleSpy,
}));

import { createPendingDteForSaleAction } from "./create-pending-dte-for-sale.action";

function fakeHandle(overrides: Partial<{ client: unknown; tenantId: string; locationId: string | null }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: overrides.locationId === undefined ? "loc-1" : overrides.locationId,
      client: overrides.client ?? { __marker: "RUNTIME_CLIENT_DB" },
    },
    dispose: disposeMock,
  };
}

const VALID_INPUT_BASE = {
  sale_id: "11111111-1111-1111-1111-111111111111",
  dte_type_code: "01",
  issuer_config_id: "22222222-2222-2222-2222-222222222222",
  environment: "TEST",
};
const VALID_INPUT = VALID_INPUT_BASE as never;

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  createPendingDteForSaleSpy.mockReset();
});

describe("createPendingDteForSaleAction — FASE VI-E3", () => {
  it("Support Session (READ_ONLY) bloquea -> createPendingDteForSale NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await createPendingDteForSaleAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: false, error: "Modo runtime read-only activo." });
    expect(createPendingDteForSaleSpy).not.toHaveBeenCalled();
  });

  it("modo normal (FE 01) -> forwardea context.tenantId/locationId/client al service", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    createPendingDteForSaleSpy.mockResolvedValue({ ok: true, dte_document_id: "dte-1" });

    const result = await createPendingDteForSaleAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: true, dte_document_id: "dte-1" });
    expect(createPendingDteForSaleSpy).toHaveBeenCalledWith(
      "tenant-1", "loc-1", "u1", expect.objectContaining({ sale_id: "11111111-1111-1111-1111-111111111111" }), runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("modo normal (CCFE 03) -> forwardea context.client al service", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    createPendingDteForSaleSpy.mockResolvedValue({ ok: true, dte_document_id: "dte-2" });

    const result = await createPendingDteForSaleAction({ ...VALID_INPUT_BASE, dte_type_code: "03" } as never);

    expect(result).toMatchObject({ ok: true, dte_document_id: "dte-2" });
    expect(createPendingDteForSaleSpy).toHaveBeenCalledWith(
      "tenant-1", "loc-1", "u1", expect.objectContaining({ dte_type_code: "03" }), runtimeDbMarker,
    );
  });

  it("sin location activa -> error explícito, service nunca se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await createPendingDteForSaleAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: false });
    expect(createPendingDteForSaleSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
