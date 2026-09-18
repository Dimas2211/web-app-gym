// ─────────────────────────────────────────────────────────────────
// commerce/dte — validate-dte-json-schema.action.test.ts
//
// FASE VI-E3 — migra a requireOperationalContext. Certifica:
//   - Support Session (READ_ONLY) bloquea antes de invocar el validador.
//   - Modo normal reenvía context.client (misma runtime DB) al servicio.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, validateDteJsonSchemaSpy } = vi.hoisted(() => {
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
    validateDteJsonSchemaSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/validate-dte-json-schema.service", () => ({
  validateDteJsonSchema: validateDteJsonSchemaSpy,
}));

import { validateDteJsonSchemaAction } from "./validate-dte-json-schema.action";

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
  validateDteJsonSchemaSpy.mockReset();
});

describe("validateDteJsonSchemaAction — FASE VI-E3", () => {
  it("Support Session (READ_ONLY) bloquea -> validateDteJsonSchema NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await validateDteJsonSchemaAction("dte-1");

    expect(result).toMatchObject({ ok: false, error: "Modo runtime read-only activo." });
    expect(validateDteJsonSchemaSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> forwardea context.tenantId/locationId/client al servicio (GENERATED -> SCHEMA_VALIDATED)", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    validateDteJsonSchemaSpy.mockResolvedValue({ ok: true });

    const result = await validateDteJsonSchemaAction("dte-1");

    expect(result).toMatchObject({ ok: true });
    expect(validateDteJsonSchemaSpy).toHaveBeenCalledWith("dte-1", "tenant-1", "loc-1", "u1", runtimeDbMarker);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("sin dte_document_id -> error sin abrir contexto operacional", async () => {
    const result = await validateDteJsonSchemaAction("");

    expect(result).toMatchObject({ ok: false });
    expect(requireOperationalContextMock).not.toHaveBeenCalled();
  });

  it("sin location activa -> error explícito", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await validateDteJsonSchemaAction("dte-1");

    expect(result).toMatchObject({ ok: false });
    expect(validateDteJsonSchemaSpy).not.toHaveBeenCalled();
  });
});
