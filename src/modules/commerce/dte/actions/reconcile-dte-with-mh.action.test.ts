// ─────────────────────────────────────────────────────────────────
// commerce/dte — reconcile-dte-with-mh.action.test.ts
//
// FASE IV-C — garantías de la Server Action manual "Consultar estado
// MH": guard admin, módulo fiscal.dte, bloqueo TOTAL bajo Support
// Session (ANTES de tocar reconcileDteWithMh), mapping de cada
// resultado del servicio a una forma segura sin secretos, y que
// reconcileDteWithMh recibe siempre tenantId/locationId/runtimeDb
// resueltos server-side (nunca desde el cliente).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "user-1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: vi.fn(async () => "loc-1"),
}));

const { isRuntimeReadOnlyActiveMock, reconcileDteWithMhSpy } = vi.hoisted(() => ({
  isRuntimeReadOnlyActiveMock: vi.fn(),
  reconcileDteWithMhSpy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { __marker: "GLOBAL_PRISMA_SINGLETON" },
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: isRuntimeReadOnlyActiveMock,
  RUNTIME_READONLY_MESSAGE: "Modo runtime read-only activo.",
}));

vi.mock("../services/dte-reconciliation.service", () => ({
  reconcileDteWithMh: reconcileDteWithMhSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return {
    ...actual,
    resolveCommercialEnforcementContext: vi.fn(async () => ({
      mode: "MANAGED", tenantId: "tenant-1", organizationId: "org-1", planId: "plan-1", verticalId: null,
      effectiveModules: new Map([["fiscal.dte", { module_id: "m1", code: "fiscal.dte", name: "DTE", category: "INTEGRATION", is_core: false, enabled: true, source: "PLAN" }]]),
      effectiveEntitlements: new Map(),
      organizationTimezone: "America/El_Salvador",
    })),
  };
});

import { reconcileDteWithMhAction } from "./reconcile-dte-with-mh.action";
import { requireAdmin } from "@/lib/permissions/guards";
import { resolveCommercialEnforcementContext } from "@/modules/platform/runtime/commercial-enforcement";

beforeEach(() => {
  isRuntimeReadOnlyActiveMock.mockReset();
  reconcileDteWithMhSpy.mockReset();
  vi.mocked(requireAdmin).mockClear();
});

describe("reconcileDteWithMhAction — guards", () => {
  it("1. exige requireAdmin (se invoca siempre)", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
    reconcileDteWithMhSpy.mockResolvedValue({ status: "NO_OP", reason: "NOT_APPLICABLE", dteStatus: "ACCEPTED" });
    await reconcileDteWithMhAction("doc-1");
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });

  it("2. fiscal.dte deshabilitado -> denied, reconcileDteWithMh nunca se invoca", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
    vi.mocked(resolveCommercialEnforcementContext).mockResolvedValueOnce({
      mode: "MANAGED", tenantId: "tenant-1", organizationId: "org-1", planId: "plan-1", verticalId: null,
      effectiveModules: new Map(), // fiscal.dte ausente -> no habilitado
      effectiveEntitlements: new Map(),
      organizationTimezone: "America/El_Salvador",
    });

    const result = await reconcileDteWithMhAction("doc-1");

    expect(result.ok).toBe(false);
    expect(reconcileDteWithMhSpy).not.toHaveBeenCalled();
  });

  it("3. Support Session activa -> denied ANTES de llamar al service; nunca toca reconcileDteWithMh", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    const result = await reconcileDteWithMhAction("doc-1");

    expect(result).toEqual({ ok: false, error: "Modo runtime read-only activo." });
    expect(reconcileDteWithMhSpy).not.toHaveBeenCalled();
  });

  it("6. runtimeDb efectivo pasado a reconcileDteWithMh es el prisma singleton resuelto server-side", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
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
    expect(callArg.runtimeDb).toEqual({ __marker: "GLOBAL_PRISMA_SINGLETON" });
  });
});

describe("reconcileDteWithMhAction — mapping de resultados (sin secretos)", () => {
  beforeEach(() => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
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
});
