// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-credit-note-dte.action.test.ts
//
// FASE VI-E4B — migra a requireOperationalContext. Certifica:
//   - Support Session (READ_ONLY) bloquea antes de llamar al service.
//   - Modo normal reenvía context.tenantId/locationId/effectiveUser.id/client.
//   - Sin location activa -> error explícito, service nunca se invoca.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, createCreditNoteSpy } = vi.hoisted(() => {
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
    createCreditNoteSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/create-credit-note-dte.service", () => ({
  createCreditNoteDteFromAcceptedCcfe: createCreditNoteSpy,
}));

import { createCreditNoteDteAction } from "./create-credit-note-dte.action";

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

const VALID_INPUT = {
  sourceDteDocumentId: "11111111-1111-1111-1111-111111111111",
  reasonText: "Devolución de mercadería",
};

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  createCreditNoteSpy.mockReset();
});

describe("createCreditNoteDteAction — FASE VI-E4B", () => {
  it("Support Session (READ_ONLY) bloquea -> createCreditNoteDteFromAcceptedCcfe NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await createCreditNoteDteAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: false, message: "Modo runtime read-only activo." });
    expect(createCreditNoteSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> forwardea context.tenantId/locationId/effectiveUser.id/client al service", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    createCreditNoteSpy.mockResolvedValue({
      ok: true,
      creditNoteDteId: "nc-1",
      controlNumber: "DTE-05-C001P001-000000000000001",
      generationCode: "GEN-NC-1",
      dteStatus: "PENDING_GENERATION",
    });

    const result = await createCreditNoteDteAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: true, creditNoteDteId: "nc-1" });
    expect(createCreditNoteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDteDocumentId: VALID_INPUT.sourceDteDocumentId,
        userId: "u1",
        tenantId: "tenant-1",
        locationId: "loc-1",
      }),
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("sin location activa -> error explícito, service nunca se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await createCreditNoteDteAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: false });
    expect(createCreditNoteSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("input inválido (sourceDteDocumentId no UUID) -> error de validación, service nunca se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    const result = await createCreditNoteDteAction({ sourceDteDocumentId: "not-a-uuid", reasonText: "abc" });

    expect(result).toMatchObject({ ok: false });
    expect(createCreditNoteSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
