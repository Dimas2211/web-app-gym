// ─────────────────────────────────────────────────────────────────
// commerce/dte — reconcile-dte-with-mh.action.test.ts
//
// FASE VI-E6A — migrada a requireOperationalContext (mismo patrón que
// reopen-rejected-dte-for-resign.action.ts): garantías de la Server
// Action manual "Consultar estado MH": guard admin, módulo fiscal.dte,
// bloqueo TOTAL bajo Support Session (ANTES de tocar reconcileDteWithMh),
// mapping de cada resultado del servicio a una forma segura sin
// secretos, y que reconcileDteWithMh recibe siempre
// tenantId/locationId/runtimeDb resueltos desde context (context.client
// de la runtime DB del tenant — NUNCA el prisma singleton global).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "user-1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, reconcileDteWithMhSpy } = vi.hoisted(() => {
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
    reconcileDteWithMhSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/dte-reconciliation.service", () => ({
  reconcileDteWithMh: reconcileDteWithMhSpy,
}));

import { reconcileDteWithMhAction } from "./reconcile-dte-with-mh.action";
import { requireAdmin } from "@/lib/permissions/guards";

function fakeHandle(overrides: Partial<{ client: unknown; tenantId: string; locationId: string | null }> = {}) {
  return {
    context: {
      effectiveUser: { id: "user-1", role: "super_admin" },
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
  reconcileDteWithMhSpy.mockReset();
  vi.mocked(requireAdmin).mockClear();
});

describe("reconcileDteWithMhAction — guards", () => {
  it("1. exige requireAdmin (se invoca siempre)", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
    reconcileDteWithMhSpy.mockResolvedValue({ status: "NO_OP", reason: "NOT_APPLICABLE", dteStatus: "ACCEPTED" });
    await reconcileDteWithMhAction("doc-1");
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });

  it("2. fiscal.dte deshabilitado -> denied, reconcileDteWithMh nunca se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "El módulo fiscal.dte no está habilitado.", 403),
    );

    const result = await reconcileDteWithMhAction("doc-1");

    expect(result).toEqual({ ok: false, error: "El módulo fiscal.dte no está habilitado." });
    expect(reconcileDteWithMhSpy).not.toHaveBeenCalled();
  });

  it("3. Support Session activa -> denied ANTES de llamar al service; nunca toca reconcileDteWithMh", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await reconcileDteWithMhAction("doc-1");

    expect(result).toEqual({ ok: false, error: "Modo runtime read-only activo." });
    expect(reconcileDteWithMhSpy).not.toHaveBeenCalled();
    expect(disposeMock).not.toHaveBeenCalled();
  });

  it("sin location activa -> error explícito, service nunca se invoca, dispose llamado", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ locationId: null }));

    const result = await reconcileDteWithMhAction("doc-1");

    expect(result).toEqual({ ok: false, error: "La sesión no tiene una location activa." });
    expect(reconcileDteWithMhSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("dteDocumentId vacío -> error explícito antes de resolver contexto operacional", async () => {
    const result = await reconcileDteWithMhAction("");

    expect(result).toEqual({ ok: false, error: "El ID del documento DTE es requerido." });
    expect(requireOperationalContextMock).not.toHaveBeenCalled();
    expect(reconcileDteWithMhSpy).not.toHaveBeenCalled();
  });

  it("6. runtimeDb efectivo pasado a reconcileDteWithMh es context.client (runtime DB del tenant, nunca el prisma global)", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    reconcileDteWithMhSpy.mockResolvedValue({ status: "NO_OP", reason: "NOT_APPLICABLE", dteStatus: "SIGNED" });

    await reconcileDteWithMhAction("doc-1");

    expect(reconcileDteWithMhSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dteDocumentId: "doc-1",
        tenantId: "tenant-1",
        locationId: "loc-1",
        userId: "user-1",
      }),
    );
    const callArg = reconcileDteWithMhSpy.mock.calls[0]?.[0];
    expect(callArg.runtimeDb).toBe(runtimeDbMarker);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});

describe("reconcileDteWithMhAction — mapping de resultados (sin secretos)", () => {
  beforeEach(() => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());
  });

  it("7. RESOLVED ACCEPTED -> ok:true", async () => {
    reconcileDteWithMhSpy.mockResolvedValue({ status: "RESOLVED", dteStatus: "ACCEPTED" });
    const result = await reconcileDteWithMhAction("doc-1");
    expect(result).toEqual({ ok: true, status: "RESOLVED", dteStatus: "ACCEPTED" });
  });

  it("8. RESOLVED OBSERVED -> ok:true con dteStatus=OBSERVED", async () => {
    reconcileDteWithMhSpy.mockResolvedValue({ status: "RESOLVED", dteStatus: "OBSERVED" });
    const result = await reconcileDteWithMhAction("doc-1");
    expect(result).toEqual({ ok: true, status: "RESOLVED", dteStatus: "OBSERVED" });
  });

  it("9. PENDING_UNCHANGED -> ok:true, sin insinuar rechazo/no-existe", async () => {
    reconcileDteWithMhSpy.mockResolvedValue({ status: "PENDING_UNCHANGED", queryKind: "QUERY_REJECTED_OR_ERROR" });
    const result = await reconcileDteWithMhAction("doc-1");
    expect(result).toEqual({ ok: true, status: "PENDING_UNCHANGED" });
  });

  it("10. NO_OP -> ok:true", async () => {
    reconcileDteWithMhSpy.mockResolvedValue({ status: "NO_OP", reason: "ALREADY_RESOLVED", dteStatus: "ACCEPTED" });
    const result = await reconcileDteWithMhAction("doc-1");
    expect(result).toEqual({ ok: true, status: "NO_OP", reason: "ALREADY_RESOLVED", dteStatus: "ACCEPTED" });
  });

  it("11. INCONSISTENT_LOCAL_STATE -> ok:false con detail como error operativo", async () => {
    reconcileDteWithMhSpy.mockResolvedValue({ status: "INCONSISTENT_LOCAL_STATE", detail: "ledger inconsistente" });
    const result = await reconcileDteWithMhAction("doc-1");
    expect(result).toEqual({ ok: false, status: "INCONSISTENT_LOCAL_STATE", error: "ledger inconsistente" });
  });

  it("12. ABORTED_CONCURRENT_CHANGE -> ok:false, informa recargar", async () => {
    reconcileDteWithMhSpy.mockResolvedValue({ status: "ABORTED_CONCURRENT_CHANGE", detail: "cambió concurrentemente" });
    const result = await reconcileDteWithMhAction("doc-1");
    expect(result).toEqual({ ok: false, status: "ABORTED_CONCURRENT_CHANGE", error: "cambió concurrentemente" });
  });

  it("BUSINESS_ERROR -> ok:false", async () => {
    reconcileDteWithMhSpy.mockResolvedValue({ status: "BUSINESS_ERROR", error: "El documento no tiene código de generación." });
    const result = await reconcileDteWithMhAction("doc-1");
    expect(result).toEqual({ ok: false, status: "BUSINESS_ERROR", error: "El documento no tiene código de generación." });
  });

  it("13. ningún resultado mapeado contiene claves de secretos", async () => {
    reconcileDteWithMhSpy.mockResolvedValue({ status: "RESOLVED", dteStatus: "ACCEPTED" });
    const result = await reconcileDteWithMhAction("doc-1");
    const serialized = JSON.stringify(result).toLowerCase();
    for (const forbidden of ["authorization", "bearer", "token", "password", "signed_jws", "encrypted_payload"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("14. dispose siempre se invoca tras el camino feliz", async () => {
    reconcileDteWithMhSpy.mockResolvedValue({ status: "RESOLVED", dteStatus: "ACCEPTED" });
    await reconcileDteWithMhAction("doc-1");
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
