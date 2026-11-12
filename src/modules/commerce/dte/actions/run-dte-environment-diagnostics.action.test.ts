// ─────────────────────────────────────────────────────────────────
// commerce/dte — run-dte-environment-diagnostics.action.test.ts
//
// Guard/aislamiento de "Probar conexión y firma": contexto resuelto en
// servidor, Support Session read-only bloqueada, nunca confía en ids
// enviados por el navegador.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireAdminMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));
vi.mock("@/lib/permissions/guards", () => ({ requireAdmin: requireAdminMock }));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, runDiagnosticsSpy } = vi.hoisted(() => {
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
    runDiagnosticsSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));
vi.mock("../services/dte-environment-diagnostics.service", () => ({
  runDteEnvironmentDiagnostics: runDiagnosticsSpy,
}));

import { runDteEnvironmentDiagnosticsAction } from "./run-dte-environment-diagnostics.action";

const runtimeClient = { __marker: "RUNTIME_DB" };

function handle(overrides: Partial<{ tenantId: string; locationId: string | null }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: overrides.locationId === undefined ? "loc-1" : overrides.locationId,
      client: runtimeClient,
    },
    dispose: disposeMock,
  };
}

const okResult = {
  ok: true as const,
  result: {
    environment: "PRODUCTION",
    testedAt: "2026-11-12T00:00:00.000Z",
    auth: { status: "OK", message: "ok" },
    signature: { status: "OK", message: "ok", contentVerified: true, cryptoVerified: false },
    documentsTransmitted: false,
  },
};

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  runDiagnosticsSpy.mockReset();
  requireAdminMock.mockClear();
});

describe("runDteEnvironmentDiagnosticsAction", () => {
  it("usa el mismo guard que la administración de credenciales (fiscal.dte, write)", async () => {
    requireOperationalContextMock.mockResolvedValue(handle());
    runDiagnosticsSpy.mockResolvedValue(okResult);

    await runDteEnvironmentDiagnosticsAction({ environment: "PRODUCTION" });

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(requireOperationalContextMock).toHaveBeenCalledWith(expect.anything(), { module: "fiscal.dte", write: true });
  });

  it("Support Session read-only → bloquea sin ejecutar pruebas", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const r = await runDteEnvironmentDiagnosticsAction({ environment: "TEST" });

    expect(r).toEqual({ ok: false, error: "Modo runtime read-only activo." });
    expect(runDiagnosticsSpy).not.toHaveBeenCalled();
  });

  it("módulo fiscal deshabilitado → bloquea", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 403),
    );
    const r = await runDteEnvironmentDiagnosticsAction({ environment: "TEST" });
    expect(r).toEqual({ ok: false, error: "Módulo no habilitado." });
    expect(runDiagnosticsSpy).not.toHaveBeenCalled();
  });

  it("ambiente inválido → rechaza antes de resolver contexto", async () => {
    const r = await runDteEnvironmentDiagnosticsAction({ environment: "STAGING" });
    expect(r.ok).toBe(false);
    expect(requireOperationalContextMock).not.toHaveBeenCalled();
    expect(runDiagnosticsSpy).not.toHaveBeenCalled();
  });

  it("tenant/location/client vienen del contexto servidor; ids del navegador se ignoran", async () => {
    requireOperationalContextMock.mockResolvedValue(handle({ tenantId: "tenant-A", locationId: "loc-A" }));
    runDiagnosticsSpy.mockResolvedValue(okResult);

    const r = await runDteEnvironmentDiagnosticsAction({
      environment: "PRODUCTION",
      issuerConfigId: "issuer-of-tenant-B",
      tenantId: "tenant-B",
      signerUrl: "https://attacker.example/firmardocumento/",
    } as unknown as { environment: string });

    expect(r.ok).toBe(true);
    expect(runDiagnosticsSpy).toHaveBeenCalledWith({
      tenantId: "tenant-A",
      locationId: "loc-A",
      environment: "PRODUCTION",
      client: runtimeClient,
    });
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("sin location activa → error y dispose", async () => {
    requireOperationalContextMock.mockResolvedValue(handle({ locationId: null }));
    const r = await runDteEnvironmentDiagnosticsAction({ environment: "TEST" });
    expect(r).toEqual({ ok: false, error: "Selecciona una location activa." });
    expect(runDiagnosticsSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("ejecución concurrente (BUSY) → mensaje claro", async () => {
    requireOperationalContextMock.mockResolvedValue(handle());
    runDiagnosticsSpy.mockResolvedValue({ ok: false, error: "BUSY" });
    const r = await runDteEnvironmentDiagnosticsAction({ environment: "TEST" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/en curso/);
  });
});
