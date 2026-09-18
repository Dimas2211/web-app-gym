// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-dte-issuer-config.action.test.ts
//
// FASE VI-E2B — cierra el gap detectado en VI-E1.1: esta action NUNCA
// bloqueaba escrituras bajo Support Session de solo lectura (a
// diferencia de su hermana upsert-dte-issuer-config-for-client.action.ts,
// que sí lo hacía). Migrada a requireOperationalContext, que resuelve
// el bloqueo estructuralmente (options.write: true).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, createDteIssuerConfigSpy } = vi.hoisted(() => {
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
    createDteIssuerConfigSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/dte-issuer-config.service", () => ({
  createDteIssuerConfig: createDteIssuerConfigSpy,
}));

import { createDteIssuerConfigAction } from "./create-dte-issuer-config.action";

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

const VALID_INPUT = { environment: "TEST", nit: "00000000000000", name: "Emisor Test" } as never;

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  createDteIssuerConfigSpy.mockReset();
});

describe("createDteIssuerConfigAction — FASE VI-E2B", () => {
  it("requireOperationalContext falla (READ_ONLY bajo Support Session) -> bloquea, createDteIssuerConfig NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await createDteIssuerConfigAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: false, error: "Modo runtime read-only activo." });
    expect(createDteIssuerConfigSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> forwardea context.client/tenantId/locationId al service", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    createDteIssuerConfigSpy.mockResolvedValue({ ok: true, id: "cfg-1" });

    const result = await createDteIssuerConfigAction(VALID_INPUT);

    expect(result).toMatchObject({ ok: true, id: "cfg-1" });
    expect(createDteIssuerConfigSpy).toHaveBeenCalledWith("tenant-1", "loc-1", "u1", expect.anything(), runtimeDbMarker);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
