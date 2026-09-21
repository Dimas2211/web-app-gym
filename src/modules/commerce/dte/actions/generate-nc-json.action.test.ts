// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-nc-json.action.test.ts
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

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, generateNcJsonSpy } = vi.hoisted(() => {
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
    generateNcJsonSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/generate-nc-json.service", () => ({
  generateNcJsonForDte: generateNcJsonSpy,
}));

import { generateNcJsonAction } from "./generate-nc-json.action";

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
  generateNcJsonSpy.mockReset();
});

describe("generateNcJsonAction — FASE VI-E4B", () => {
  it("sin dteDocumentId -> error explícito, no llama requireOperationalContext", async () => {
    const result = await generateNcJsonAction("");
    expect(result).toMatchObject({ ok: false });
    expect(requireOperationalContextMock).not.toHaveBeenCalled();
  });

  it("Support Session (READ_ONLY) bloquea -> generateNcJsonForDte NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await generateNcJsonAction("nc-1");

    expect(result).toMatchObject({ ok: false, message: "Modo runtime read-only activo." });
    expect(generateNcJsonSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> forwardea context.tenantId/locationId/effectiveUser.id/client al service", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    generateNcJsonSpy.mockResolvedValue({
      ok: true,
      dteStatus: "GENERATED",
      dteDocumentId: "nc-1",
      controlNumber: "DTE-05-C001P001-000000000000001",
      generationCode: "GEN-NC-1",
    });

    const result = await generateNcJsonAction("nc-1");

    expect(result).toMatchObject({ ok: true, dteStatus: "GENERATED" });
    expect(generateNcJsonSpy).toHaveBeenCalledWith(
      { dteDocumentId: "nc-1", userId: "u1", tenantId: "tenant-1", locationId: "loc-1" },
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("sin location activa -> error explícito, service nunca se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await generateNcJsonAction("nc-1");

    expect(result).toMatchObject({ ok: false });
    expect(generateNcJsonSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
