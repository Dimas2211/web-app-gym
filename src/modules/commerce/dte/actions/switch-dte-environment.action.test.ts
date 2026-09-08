// ─────────────────────────────────────────────────────────────────
// commerce/dte — switch-dte-environment.action.test.ts
//
// FASE 5 (bug residual post FASE IV-A) — activar un ambiente DTE debe
// bloquearse ANTES de tocar la DB bajo sesión runtime read-only.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: vi.fn(async () => "loc-1"),
}));

const {
  isRuntimeReadOnlyActiveMock,
  dteIssuerConfigFindFirstSpy,
  switchActiveDteEnvironmentSpy,
} = vi.hoisted(() => ({
  isRuntimeReadOnlyActiveMock: vi.fn(),
  dteIssuerConfigFindFirstSpy: vi.fn(),
  switchActiveDteEnvironmentSpy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { dteIssuerConfig: { findFirst: dteIssuerConfigFindFirstSpy } },
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: isRuntimeReadOnlyActiveMock,
  RUNTIME_READONLY_MESSAGE: "Modo runtime read-only activo.",
}));

vi.mock("../services/dte-issuer-config.service", () => ({
  switchActiveDteEnvironment: switchActiveDteEnvironmentSpy,
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

import { switchDteEnvironmentAction } from "./switch-dte-environment.action";

beforeEach(() => {
  isRuntimeReadOnlyActiveMock.mockReset();
  dteIssuerConfigFindFirstSpy.mockReset();
  switchActiveDteEnvironmentSpy.mockReset();
});

describe("switchDteEnvironmentAction — runtime read-only guard", () => {
  it("sesión runtime activa -> bloquea ANTES de consultar/tocar la DB, switchActiveDteEnvironment NUNCA se invoca", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);
    const fd = new FormData();
    fd.set("target_issuer_config_id", "cfg-1");

    const result = await switchDteEnvironmentAction(undefined, fd);

    expect(result).toMatchObject({ error: "Modo runtime read-only activo." });
    expect(dteIssuerConfigFindFirstSpy).not.toHaveBeenCalled();
    expect(switchActiveDteEnvironmentSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> el guard no bloquea, continúa el flujo (llega a consultar el issuer config)", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
    dteIssuerConfigFindFirstSpy.mockResolvedValue(null); // documento no encontrado -> error de negocio normal, no de runtime

    const fd = new FormData();
    fd.set("target_issuer_config_id", "11111111-1111-1111-1111-111111111111");

    const result = await switchDteEnvironmentAction(undefined, fd);

    expect(dteIssuerConfigFindFirstSpy).toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.stringContaining("no pertenece") });
  });
});
