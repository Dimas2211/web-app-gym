// ─────────────────────────────────────────────────────────────────
// commerce/dte — upsert-dte-credential.action.test.ts
//
// FASE 5 (bug residual post FASE IV-A) — guardar credenciales MH debe
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
  upsertDteCredentialSpy,
} = vi.hoisted(() => ({
  isRuntimeReadOnlyActiveMock: vi.fn(),
  dteIssuerConfigFindFirstSpy: vi.fn(),
  upsertDteCredentialSpy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { dteIssuerConfig: { findFirst: dteIssuerConfigFindFirstSpy } },
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: isRuntimeReadOnlyActiveMock,
  RUNTIME_READONLY_MESSAGE: "Modo runtime read-only activo.",
}));

vi.mock("../services/dte-credential.service", () => ({
  upsertDteCredential: upsertDteCredentialSpy,
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

import { upsertDteCredentialAction } from "./upsert-dte-credential.action";

beforeEach(() => {
  isRuntimeReadOnlyActiveMock.mockReset();
  dteIssuerConfigFindFirstSpy.mockReset();
  upsertDteCredentialSpy.mockReset();
});

describe("upsertDteCredentialAction — runtime read-only guard", () => {
  it("sesión runtime activa -> bloquea ANTES de tocar la DB, upsertDteCredential NUNCA se invoca", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);
    const fd = new FormData();
    fd.set("issuer_config_id", "11111111-1111-1111-1111-111111111111");

    const result = await upsertDteCredentialAction(undefined, fd);

    expect(result).toMatchObject({ error: "Modo runtime read-only activo." });
    expect(dteIssuerConfigFindFirstSpy).not.toHaveBeenCalled();
    expect(upsertDteCredentialSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> el guard no bloquea, continúa el flujo (llega a consultar el issuer config)", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
    dteIssuerConfigFindFirstSpy.mockResolvedValue(null);

    const fd = new FormData();
    fd.set("issuer_config_id", "11111111-1111-1111-1111-111111111111");

    const result = await upsertDteCredentialAction(undefined, fd);

    expect(dteIssuerConfigFindFirstSpy).toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.stringContaining("no pertenece") });
  });
});
