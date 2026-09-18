// ─────────────────────────────────────────────────────────────────
// commerce/dte — switch-dte-environment.action.test.ts
//
// FASE VI-E2B — migrado a requireOperationalContext: certifica que
// switchDteEnvironmentAction usa context.client (efectivo/runtime),
// bloquea bajo Support Session de solo lectura ANTES de tocar la DB,
// y falla closed si el contexto operacional no puede resolverse.
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
  dteIssuerConfigFindFirstSpy,
  switchActiveDteEnvironmentSpy,
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
    dteIssuerConfigFindFirstSpy: vi.fn(),
    switchActiveDteEnvironmentSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/dte-issuer-config.service", () => ({
  switchActiveDteEnvironment: switchActiveDteEnvironmentSpy,
}));

import { switchDteEnvironmentAction } from "./switch-dte-environment.action";

function fakeHandle(overrides: Partial<{ client: unknown; tenantId: string; locationId: string | null }> = {}) {
  const client = overrides.client ?? { dteIssuerConfig: { findFirst: dteIssuerConfigFindFirstSpy } };
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: overrides.locationId === undefined ? "loc-1" : overrides.locationId,
      client,
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  dteIssuerConfigFindFirstSpy.mockReset();
  switchActiveDteEnvironmentSpy.mockReset();
});

describe("switchDteEnvironmentAction — FASE VI-E2B", () => {
  it("requireOperationalContext falla (READ_ONLY bajo Support Session) -> bloquea ANTES de consultar/tocar la DB", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );
    const fd = new FormData();
    fd.set("target_issuer_config_id", "11111111-1111-1111-1111-111111111111");

    const result = await switchDteEnvironmentAction(undefined, fd);

    expect(result).toMatchObject({ error: "Modo runtime read-only activo." });
    expect(dteIssuerConfigFindFirstSpy).not.toHaveBeenCalled();
    expect(switchActiveDteEnvironmentSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> el guard no bloquea, continúa el flujo (llega a consultar el issuer config vía context.client)", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    dteIssuerConfigFindFirstSpy.mockResolvedValue(null); // documento no encontrado -> error de negocio normal, no de runtime

    const fd = new FormData();
    fd.set("target_issuer_config_id", "11111111-1111-1111-1111-111111111111");

    const result = await switchDteEnvironmentAction(undefined, fd);

    expect(dteIssuerConfigFindFirstSpy).toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.stringContaining("no pertenece") });
  });

  it("target válido (TEST, sin confirmación requerida) -> forwardea context.client al service", async () => {
    const runtimeDbMarker = { dteIssuerConfig: { findFirst: dteIssuerConfigFindFirstSpy }, __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    dteIssuerConfigFindFirstSpy.mockResolvedValue({ id: "cfg-1", environment: "TEST" });
    switchActiveDteEnvironmentSpy.mockResolvedValue({ ok: true, environment: "TEST", issuer_config_id: "cfg-1" });

    const fd = new FormData();
    fd.set("target_issuer_config_id", "11111111-1111-1111-1111-111111111111");

    const result = await switchDteEnvironmentAction(undefined, fd);

    expect(result).toMatchObject({ success: true, environment: "TEST" });
    expect(switchActiveDteEnvironmentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-1", location_id: "loc-1", target_issuer_config_id: "cfg-1", user_id: "u1" }),
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("cross-tenant: target de otro tenant no aparece en context.client -> deniega, switchActiveDteEnvironment NUNCA se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ tenantId: "tenant-A" }));
    dteIssuerConfigFindFirstSpy.mockResolvedValue(null);

    const fd = new FormData();
    fd.set("target_issuer_config_id", "22222222-2222-2222-2222-222222222222");

    const result = await switchDteEnvironmentAction(undefined, fd);

    expect(result).toMatchObject({ error: expect.stringContaining("no pertenece") });
    expect(switchActiveDteEnvironmentSpy).not.toHaveBeenCalled();
  });
});
