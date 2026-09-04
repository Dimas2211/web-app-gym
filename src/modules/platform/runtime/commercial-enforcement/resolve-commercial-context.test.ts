// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — resolve-commercial-context.test.ts
//
// Bloque B — MANAGED vs LEGACY_UNMANAGED. controlPlanePrisma y los
// wrappers del Bloque A se mockean; no toca DB real.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueMock = vi.fn();
vi.mock("../control-plane-prisma", () => ({
  controlPlanePrisma: { platformOrganization: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

const getEffectiveOrganizationModulesMock = vi.fn();
const getEffectiveOrganizationEntitlementsMock = vi.fn();
vi.mock("../../lib/entitlements-resolver", () => ({
  getEffectiveOrganizationModules: (...args: unknown[]) => getEffectiveOrganizationModulesMock(...args),
  getEffectiveOrganizationEntitlements: (...args: unknown[]) => getEffectiveOrganizationEntitlementsMock(...args),
}));

// resolveCommercialEnforcementContext usa React cache() — importar una vez
// por test file es suficiente porque cada test usa un tenantId distinto
// (la key de cache() incluye el argumento).
import { resolveCommercialEnforcementContext } from "./resolve-commercial-context";

beforeEach(() => {
  findUniqueMock.mockReset();
  getEffectiveOrganizationModulesMock.mockReset();
  getEffectiveOrganizationEntitlementsMock.mockReset();
});

describe("resolveCommercialEnforcementContext", () => {
  it("sin fila PlatformOrganization -> LEGACY_UNMANAGED, maps vacíos, nunca PLAN/unlimited", async () => {
    findUniqueMock.mockResolvedValue(null);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const ctx = await resolveCommercialEnforcementContext("tenant-legacy-1");

    expect(ctx.mode).toBe("LEGACY_UNMANAGED");
    expect(ctx.organizationId).toBeNull();
    expect(ctx.effectiveModules.size).toBe(0);
    expect(ctx.effectiveEntitlements.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      "[commercial-enforcement] LEGACY_UNMANAGED_BYPASS",
      expect.objectContaining({ tenantId: "tenant-legacy-1" }),
    );
    warnSpy.mockRestore();
  });

  it("con fila + plan -> MANAGED, maps poblados desde los wrappers del Bloque A", async () => {
    findUniqueMock.mockResolvedValue({ id: "org-1", plan_id: "plan-1", vertical_id: "vert-gym" });
    getEffectiveOrganizationModulesMock.mockResolvedValue([
      { module_id: "m1", code: "commerce.products", name: "Productos", category: "COMMERCE", is_core: false, enabled: true, source: "PLAN" },
    ]);
    getEffectiveOrganizationEntitlementsMock.mockResolvedValue([
      { entitlement_definition_id: "e1", code: "commerce.products.max", name: "Productos", category: "commerce", value_type: "COUNT", period_type: "NONE", numeric_value: 500, is_unlimited: false, source: "PLAN" },
    ]);

    const ctx = await resolveCommercialEnforcementContext("tenant-managed-1");

    expect(ctx.mode).toBe("MANAGED");
    expect(ctx.organizationId).toBe("org-1");
    expect(ctx.planId).toBe("plan-1");
    expect(ctx.effectiveModules.get("commerce.products")).toMatchObject({ enabled: true, source: "PLAN" });
    expect(ctx.effectiveEntitlements.get("commerce.products.max")).toMatchObject({ numeric_value: 500, source: "PLAN" });
  });

  it("con fila sin plan (plan_id null) -> MANAGED, wrappers devuelven todo UNCONFIGURED (fail-closed natural)", async () => {
    findUniqueMock.mockResolvedValue({ id: "org-2", plan_id: null, vertical_id: null });
    getEffectiveOrganizationModulesMock.mockResolvedValue([
      { module_id: "m1", code: "commerce.products", name: "Productos", category: "COMMERCE", is_core: false, enabled: false, source: "UNCONFIGURED" },
    ]);
    getEffectiveOrganizationEntitlementsMock.mockResolvedValue([
      { entitlement_definition_id: "e1", code: "commerce.products.max", name: "Productos", category: "commerce", value_type: "COUNT", period_type: "NONE", numeric_value: null, is_unlimited: false, source: "UNCONFIGURED" },
    ]);

    const ctx = await resolveCommercialEnforcementContext("tenant-noplan-1");

    expect(ctx.mode).toBe("MANAGED");
    expect(ctx.effectiveModules.get("commerce.products")?.source).toBe("UNCONFIGURED");
    expect(ctx.effectiveEntitlements.get("commerce.products.max")?.source).toBe("UNCONFIGURED");
  });

  it("excepción de Prisma al resolver -> COMMERCIAL_CONTEXT_ERROR, NUNCA degrada a LEGACY_UNMANAGED", async () => {
    findUniqueMock.mockRejectedValue(new Error("connection refused"));

    await expect(resolveCommercialEnforcementContext("tenant-error-1")).rejects.toMatchObject({
      code: "COMMERCIAL_CONTEXT_ERROR",
    });
  });
});
