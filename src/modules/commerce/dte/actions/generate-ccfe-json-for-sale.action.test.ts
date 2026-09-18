// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-ccfe-json-for-sale.action.test.ts
//
// FASE VI-E3 — migra a requireOperationalContext. Certifica:
//   - Support Session (READ_ONLY) bloquea antes de invocar el builder.
//   - Modo normal reenvía context.client (misma runtime DB) al builder.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, generateCcfeJsonForDteSpy } = vi.hoisted(() => {
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
    generateCcfeJsonForDteSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/generate-ccfe-json.service", () => ({
  generateCcfeJsonForDte: generateCcfeJsonForDteSpy,
}));

import { generateCcfeJsonForSaleAction } from "./generate-ccfe-json-for-sale.action";

function fakeHandle(overrides: Partial<{ client: unknown; locationId: string | null }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin" },
      tenantId: "tenant-1",
      locationId: overrides.locationId === undefined ? "loc-1" : overrides.locationId,
      client: overrides.client ?? { __marker: "RUNTIME_CLIENT_DB" },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  generateCcfeJsonForDteSpy.mockReset();
});

describe("generateCcfeJsonForSaleAction — FASE VI-E3", () => {
  it("Support Session (READ_ONLY) bloquea -> generateCcfeJsonForDte NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await generateCcfeJsonForSaleAction("dte-1");

    expect(result).toMatchObject({ ok: false, error: "Modo runtime read-only activo." });
    expect(generateCcfeJsonForDteSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> forwardea context.tenantId/locationId/client al builder", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    generateCcfeJsonForDteSpy.mockResolvedValue({ ok: true });

    const result = await generateCcfeJsonForSaleAction("dte-1");

    expect(result).toMatchObject({ ok: true });
    expect(generateCcfeJsonForDteSpy).toHaveBeenCalledWith("dte-1", "tenant-1", "loc-1", "u1", runtimeDbMarker);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("sin dte_document_id -> error sin abrir contexto operacional", async () => {
    const result = await generateCcfeJsonForSaleAction("");

    expect(result).toMatchObject({ ok: false });
    expect(requireOperationalContextMock).not.toHaveBeenCalled();
  });

  it("sin location activa -> error explícito", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await generateCcfeJsonForSaleAction("dte-1");

    expect(result).toMatchObject({ ok: false });
    expect(generateCcfeJsonForDteSpy).not.toHaveBeenCalled();
  });
});
