// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-dte-document.action.test.ts
//
// FASE VI-E5A — migra signDteDocumentAction a requireOperationalContext
// (mismo patrón que sign-dte-document.action.ts de VI-E3/E4). Certifica:
//   - fiscal.dte deshabilitado / READ_ONLY (Support Session) bloquean
//     ANTES de tocar el documento DTE o el pipeline de firma — el
//     firmador NUNCA se invoca (signDteDocument mockeado como spy).
//   - Modo normal: el documento se busca en context.client (runtime DB)
//     y signDteDocument recibe context.client como segundo argumento.
//   - Sin location activa -> error explícito, ni el documento ni el
//     firmador se tocan.
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
  signDteDocumentSpy,
  dteOutgoingDocumentFindFirstSpy,
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
    signDteDocumentSpy: vi.fn(),
    dteOutgoingDocumentFindFirstSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/sign-dte-document.service", () => ({
  signDteDocument: signDteDocumentSpy,
}));

import { signDteDocumentAction } from "./sign-dte-document.action";

function fakeHandle(
  overrides: Partial<{ client: unknown; tenantId: string; locationId: string | null }> = {},
) {
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: overrides.locationId === undefined ? "loc-1" : overrides.locationId,
      client: overrides.client ?? { dteOutgoingDocument: { findFirst: dteOutgoingDocumentFindFirstSpy } },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  signDteDocumentSpy.mockReset();
  dteOutgoingDocumentFindFirstSpy.mockReset();
});

describe("signDteDocumentAction — FASE VI-E5A", () => {
  it("fiscal.dte deshabilitado / MODULE_DISABLED -> bloquea, signDteDocument NUNCA se invoca, ni siquiera se consulta el documento", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "El módulo fiscal.dte no está habilitado.", 403),
    );

    const result = await signDteDocumentAction("dte-doc-1");

    expect(result.ok).toBe(false);
    expect(dteOutgoingDocumentFindFirstSpy).not.toHaveBeenCalled();
    expect(signDteDocumentSpy).not.toHaveBeenCalled();
  });

  it("Support Session (READ_ONLY) bloquea -> el firmador NUNCA se invoca (signer mock call count = 0)", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await signDteDocumentAction("dte-doc-1");

    expect(result).toMatchObject({ ok: false, error: "Modo runtime read-only activo." });
    expect(dteOutgoingDocumentFindFirstSpy).not.toHaveBeenCalled();
    expect(signDteDocumentSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> busca el documento en context.client y firma con context.client (runtime DB)", async () => {
    const runtimeDbMarker = { dteOutgoingDocument: { findFirst: dteOutgoingDocumentFindFirstSpy } };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    dteOutgoingDocumentFindFirstSpy.mockResolvedValue({
      dte_type_code: "01",
      dte_status: "SCHEMA_VALIDATED",
      signed_jws: null,
      environment: "TEST",
    });
    signDteDocumentSpy.mockResolvedValue({ ok: true, dteStatus: "SIGNED", signedAt: "2026-01-01T00:00:00.000Z" });

    const result = await signDteDocumentAction("dte-doc-1");

    expect(result).toMatchObject({ ok: true, dteStatus: "SIGNED" });
    expect(dteOutgoingDocumentFindFirstSpy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dte-doc-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(signDteDocumentSpy).toHaveBeenCalledWith(
      { dteDocumentId: "dte-doc-1", userId: "u1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("sin location activa -> error explícito, ni el documento ni el firmador se tocan", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await signDteDocumentAction("dte-doc-1");

    expect(result).toMatchObject({ ok: false });
    expect(dteOutgoingDocumentFindFirstSpy).not.toHaveBeenCalled();
    expect(signDteDocumentSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("documento inexistente en context.client (cross-tenant/location no visible) -> error, signDteDocument nunca se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    dteOutgoingDocumentFindFirstSpy.mockResolvedValue(null);

    const result = await signDteDocumentAction("dte-doc-otro-tenant");

    expect(result).toMatchObject({ ok: false });
    expect(signDteDocumentSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("FEX 11 fuera de la ventana de feature-guard -> bloquea, signDteDocument nunca se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    dteOutgoingDocumentFindFirstSpy.mockResolvedValue({
      dte_type_code: "11",
      dte_status: "SCHEMA_VALIDATED",
      signed_jws: null,
      environment: "PRODUCTION",
    });

    const result = await signDteDocumentAction("dte-doc-fex");

    expect(result).toMatchObject({ ok: false });
    expect(signDteDocumentSpy).not.toHaveBeenCalled();
  });
});
