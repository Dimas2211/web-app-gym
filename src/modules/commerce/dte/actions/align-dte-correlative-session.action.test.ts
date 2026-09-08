// ─────────────────────────────────────────────────────────────────
// commerce/dte — align-dte-correlative-session.action.test.ts
//
// FASE 5 (bug residual post FASE IV-A) — alinear el baseline de un
// correlativo DTE debe bloquearse ANTES de tocar la DB bajo sesión
// runtime read-only.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const {
  isRuntimeReadOnlyActiveMock,
  dteIssuerConfigFindFirstSpy,
  alignDteCorrelativeBaselineSpy,
} = vi.hoisted(() => ({
  isRuntimeReadOnlyActiveMock: vi.fn(),
  dteIssuerConfigFindFirstSpy: vi.fn(),
  alignDteCorrelativeBaselineSpy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { dteIssuerConfig: { findFirst: dteIssuerConfigFindFirstSpy } },
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: isRuntimeReadOnlyActiveMock,
  RUNTIME_READONLY_MESSAGE: "Modo runtime read-only activo.",
}));

vi.mock("../services/dte-correlative.service", () => ({
  alignDteCorrelativeBaseline: alignDteCorrelativeBaselineSpy,
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

import { alignDteCorrelativeSessionAction } from "./align-dte-correlative-session.action";

function validFormData(): FormData {
  const fd = new FormData();
  fd.set("location_id", "loc-1");
  fd.set("issuer_config_id", "11111111-1111-1111-1111-111111111111");
  fd.set("environment", "PRODUCTION");
  fd.set("dte_type_code", "01");
  fd.set("cod_estable_mh", "M001");
  fd.set("cod_punto_venta_mh", "P001");
  fd.set("last_used_sequence", "5");
  fd.set("notes", "Migración desde sistema anterior.");
  return fd;
}

beforeEach(() => {
  isRuntimeReadOnlyActiveMock.mockReset();
  dteIssuerConfigFindFirstSpy.mockReset();
  alignDteCorrelativeBaselineSpy.mockReset();
});

describe("alignDteCorrelativeSessionAction — runtime read-only guard", () => {
  it("sesión runtime activa -> bloquea ANTES de tocar la DB, alignDteCorrelativeBaseline NUNCA se invoca", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    const result = await alignDteCorrelativeSessionAction(undefined, validFormData());

    expect(result).toMatchObject({ error: "Modo runtime read-only activo." });
    expect(dteIssuerConfigFindFirstSpy).not.toHaveBeenCalled();
    expect(alignDteCorrelativeBaselineSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> el guard no bloquea, continúa el flujo (llega a consultar el issuer config)", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
    dteIssuerConfigFindFirstSpy.mockResolvedValue(null);

    const result = await alignDteCorrelativeSessionAction(undefined, validFormData());

    expect(dteIssuerConfigFindFirstSpy).toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.stringContaining("no corresponde") });
  });
});
