// ─────────────────────────────────────────────────────────────────
// commerce/dte — reopen-rejected-dte-for-resign.action.test.ts
//
// FASE VI-E5A — migra a requireOperationalContext (mismo patrón que
// sign-dte-document.action.ts): el documento se reabre en la MISMA
// runtime DB (context.client) donde después se firmará. Certifica:
//   - READ_ONLY (Support Session) bloquea ANTES de invocar el service.
//   - Modo normal: el service recibe context.client como segundo
//     argumento y tenantId/locationId/userId desde el contexto.
//   - Sin location activa -> error explícito, service nunca se invoca.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, reopenSpy } = vi.hoisted(() => {
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
    reopenSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/reopen-rejected-dte-for-resign.service", () => ({
  reopenRejectedDteForResign: reopenSpy,
}));

import { reopenRejectedDteForResignAction } from "./reopen-rejected-dte-for-resign.action";

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

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  reopenSpy.mockReset();
});

describe("reopenRejectedDteForResignAction — FASE VI-E5A", () => {
  it("Support Session (READ_ONLY) bloquea -> reopenRejectedDteForResign NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await reopenRejectedDteForResignAction("dte-1");

    expect(result).toMatchObject({ ok: false, error: "Modo runtime read-only activo." });
    expect(reopenSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> forwardea tenantId/locationId/userId y context.client al service", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    reopenSpy.mockResolvedValue({ ok: true });

    const result = await reopenRejectedDteForResignAction("dte-1");

    expect(result).toMatchObject({ ok: true });
    expect(reopenSpy).toHaveBeenCalledWith(
      { dteDocumentId: "dte-1", tenantId: "tenant-1", locationId: "loc-1", userId: "u1" },
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("sin location activa -> error explícito, service nunca se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await reopenRejectedDteForResignAction("dte-1");

    expect(result).toMatchObject({ ok: false });
    expect(reopenSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("dteDocumentId vacío -> error explícito antes de resolver contexto operacional", async () => {
    const result = await reopenRejectedDteForResignAction("");

    expect(result).toMatchObject({ ok: false });
    expect(requireOperationalContextMock).not.toHaveBeenCalled();
    expect(reopenSpy).not.toHaveBeenCalled();
  });
});
