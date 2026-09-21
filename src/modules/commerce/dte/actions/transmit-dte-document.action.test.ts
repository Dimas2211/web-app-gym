// ─────────────────────────────────────────────────────────────────
// commerce/dte — transmit-dte-document.action.test.ts
//
// FASE VI-E5B — migra transmitDteDocumentAction a requireOperationalContext
// (mismo patrón que sign-dte-document.action.ts de VI-E5A). Certifica:
//   - fiscal.dte deshabilitado / READ_ONLY (Support Session) bloquean
//     ANTES de invocar transmitDteDocument — nunca se toca MH, el
//     documento ni el ledger de metering.
//   - Modo normal: transmitDteDocument recibe context.client como
//     segundo argumento (misma runtime DB del documento/emisor/
//     credencial).
//   - Sin location activa -> error explícito, transmitDteDocument nunca
//     se invoca.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const {
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
  transmitDteDocumentSpy,
} = vi.hoisted(() => {
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
    transmitDteDocumentSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/transmit-dte-document.service", () => ({
  transmitDteDocument: transmitDteDocumentSpy,
}));

import { transmitDteDocumentAction } from "./transmit-dte-document.action";

function fakeHandle(
  overrides: Partial<{ client: unknown; tenantId: string; locationId: string | null }> = {},
) {
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

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  transmitDteDocumentSpy.mockReset();
});

describe("transmitDteDocumentAction — FASE VI-E5B", () => {
  it("fiscal.dte deshabilitado / MODULE_DISABLED -> bloquea, transmitDteDocument NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "El módulo fiscal.dte no está habilitado.", 403),
    );

    const result = await transmitDteDocumentAction("dte-doc-1");

    expect(result.ok).toBe(false);
    expect(transmitDteDocumentSpy).not.toHaveBeenCalled();
  });

  it("Support Session (READ_ONLY) bloquea -> transmitDteDocument NUNCA se invoca (0 llamadas a MH/metering)", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await transmitDteDocumentAction("dte-doc-1");

    expect(result).toMatchObject({ ok: false, error: "Modo runtime read-only activo." });
    expect(transmitDteDocumentSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> transmitDteDocument recibe context.client (runtime DB) como segundo argumento", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    transmitDteDocumentSpy.mockResolvedValue({
      ok: true,
      dteStatus: "ACCEPTED",
      mhEstado: "PROCESADO",
      descripcionMsg: null,
      selloRecibido: "SELLO-1",
    });

    const result = await transmitDteDocumentAction("dte-doc-1");

    expect(result).toMatchObject({ ok: true, dteStatus: "ACCEPTED" });
    expect(transmitDteDocumentSpy).toHaveBeenCalledWith(
      { dteDocumentId: "dte-doc-1", userId: "u1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("sin location activa -> error explícito, transmitDteDocument nunca se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await transmitDteDocumentAction("dte-doc-1");

    expect(result).toMatchObject({ ok: false });
    expect(transmitDteDocumentSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("sin dteDocumentId -> error explícito, requireOperationalContext no se llega a resolver el pipeline", async () => {
    const result = await transmitDteDocumentAction("");

    expect(result).toMatchObject({ ok: false });
    expect(transmitDteDocumentSpy).not.toHaveBeenCalled();
  });
});
