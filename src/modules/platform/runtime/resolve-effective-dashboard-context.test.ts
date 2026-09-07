// ─────────────────────────────────────────────────────────────────
// platform/runtime — resolve-effective-dashboard-context.test.ts
//
// PASO 6F — Navegación runtime-aware + aislamiento de superficie por
// vertical. Fija los escenarios centrales del ticket:
//   1. NORMAL GYM        (Carlos, tenant real, vertical GYM, 15 módulos)
//   2. RUNTIME TRUSTME    ("Operar como TrustMe": tenant efectivo
//                         TrustMe, vertical null, Commerce-only)
//   3. RUNTIME GYM        (organización runtime CON vertical GYM)
//   4. LEGACY_UNMANAGED   (bypass, sin fila PlatformOrganization)
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveEffectiveTenantContextMock } = vi.hoisted(() => ({
  resolveEffectiveTenantContextMock: vi.fn(),
}));

vi.mock("./effective-tenant-context", () => ({
  resolveEffectiveTenantContext: resolveEffectiveTenantContextMock,
}));

const { resolveCommercialEnforcementContextMock } = vi.hoisted(() => ({
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("./commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock,
}));

const { resolveEffectiveVerticalCodeMock } = vi.hoisted(() => ({
  resolveEffectiveVerticalCodeMock: vi.fn(),
}));

vi.mock("./effective-vertical", () => ({
  resolveEffectiveVerticalCode: resolveEffectiveVerticalCodeMock,
}));

const { platformOrganizationFindUniqueSpy } = vi.hoisted(() => ({
  platformOrganizationFindUniqueSpy: vi.fn(),
}));

vi.mock("./control-plane-prisma", () => ({
  controlPlanePrisma: {
    platformOrganization: { findUnique: platformOrganizationFindUniqueSpy },
  },
}));

import { resolveEffectiveDashboardContext } from "./resolve-effective-dashboard-context";
import type { SessionUser } from "@/lib/permissions/guards";

const NORMAL_USER = {
  id: "u1",
  tenant_id: "gym-0001",
  role: "super_admin",
} as unknown as SessionUser;
const ALL_CODES = [
  "gym.memberships",
  "gym.trainers",
  "gym.classes",
  "gym.weekly_plans",
  "commerce.products",
  "commerce.inventory",
  "commerce.suppliers",
  "core.customers",
  "commerce.purchases",
  "commerce.sales",
  "commerce.cash",
  "fiscal.dte",
  "core.users",
  "core.locations",
];

const noopDispose = vi.fn(async () => {});

beforeEach(() => {
  resolveEffectiveTenantContextMock.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
  resolveEffectiveVerticalCodeMock.mockReset();
  platformOrganizationFindUniqueSpy.mockReset();
  noopDispose.mockClear();
});

describe("resolveEffectiveDashboardContext", () => {
  it("1. NORMAL GYM — tenant real, vertical GYM, todos los módulos habilitados", async () => {
    resolveEffectiveTenantContextMock.mockResolvedValue({
      context: { tenantId: "gym-0001", client: undefined, runtime: null },
      dispose: noopDispose,
    });
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "gym-0001",
      organizationId: "org-gym",
      planId: "plan-1",
      verticalId: "vertical-gym-id",
      effectiveModules: new Map(ALL_CODES.map((c) => [c, { code: c, enabled: true }])),
      effectiveEntitlements: new Map(),
    });
    resolveEffectiveVerticalCodeMock.mockResolvedValue("GYM");
    platformOrganizationFindUniqueSpy.mockResolvedValue({ name: "GYM EL SALVADOR" });

    const { context, dispose } = await resolveEffectiveDashboardContext(NORMAL_USER, ALL_CODES);

    expect(context.tenantId).toBe("gym-0001");
    expect(context.isRuntime).toBe(false);
    expect(context.readOnly).toBe(false);
    expect(context.verticalCode).toBe("GYM");
    expect(context.isLegacyUnmanaged).toBe(false);
    expect(context.organizationName).toBe("GYM EL SALVADOR");
    expect([...context.enabledModuleCodes].sort()).toEqual([...ALL_CODES].sort());

    await dispose();
    expect(noopDispose).toHaveBeenCalledTimes(1);
  });

  it("2. RUNTIME TRUSTME — tenant efectivo TrustMe, vertical null, Commerce-only", async () => {
    const runtimePayload = {
      organizationId: "org-trustme",
      profileId: "profile-trustme",
      tenantId: "trustme-0001",
      organizationName: "TrustMe",
      profileLabel: "TrustMe prod",
      readOnly: true as const,
      startedByUserId: "u1",
      startedAt: new Date().toISOString(),
    };
    resolveEffectiveTenantContextMock.mockResolvedValue({
      context: { tenantId: "trustme-0001", client: {} as never, runtime: runtimePayload },
      dispose: noopDispose,
    });
    const trustmeEnabled = ["commerce.products", "commerce.sales", "core.customers", "core.users", "core.locations", "fiscal.dte"];
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "trustme-0001",
      organizationId: "org-trustme",
      planId: "plan-2",
      verticalId: null,
      effectiveModules: new Map(trustmeEnabled.map((c) => [c, { code: c, enabled: true }])),
      effectiveEntitlements: new Map(),
    });
    resolveEffectiveVerticalCodeMock.mockResolvedValue(null);

    const { context } = await resolveEffectiveDashboardContext(NORMAL_USER, ALL_CODES);

    // El tenant efectivo es TrustMe, NUNCA el del super_admin autenticado.
    expect(context.tenantId).toBe("trustme-0001");
    expect(context.tenantId).not.toBe(NORMAL_USER.tenant_id);
    expect(context.isRuntime).toBe(true);
    expect(context.readOnly).toBe(true);
    expect(context.verticalCode).toBeNull();
    expect(context.organizationName).toBe("TrustMe");
    // organizationName vino del payload runtime — no se consultó el Control Plane de nuevo.
    expect(platformOrganizationFindUniqueSpy).not.toHaveBeenCalled();
    // Ningún módulo GYM queda habilitado para TrustMe.
    expect(context.enabledModuleCodes.has("gym.memberships")).toBe(false);
    expect(context.enabledModuleCodes.has("gym.trainers")).toBe(false);
    expect(context.enabledModuleCodes.has("gym.classes")).toBe(false);
    expect(context.enabledModuleCodes.has("gym.weekly_plans")).toBe(false);
    expect(context.enabledModuleCodes.has("commerce.sales")).toBe(true);
  });

  it("3. RUNTIME GYM — organización runtime con vertical GYM sigue readOnly", async () => {
    resolveEffectiveTenantContextMock.mockResolvedValue({
      context: {
        tenantId: "gym-runtime-0002",
        client: {} as never,
        runtime: {
          organizationId: "org-gym-2",
          profileId: "profile-gym-2",
          tenantId: "gym-runtime-0002",
          organizationName: "Otro Gym",
          profileLabel: "Otro Gym prod",
          readOnly: true as const,
          startedByUserId: "u1",
          startedAt: new Date().toISOString(),
        },
      },
      dispose: noopDispose,
    });
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "gym-runtime-0002",
      organizationId: "org-gym-2",
      planId: "plan-3",
      verticalId: "vertical-gym-id",
      effectiveModules: new Map([["gym.memberships", { code: "gym.memberships", enabled: true }]]),
      effectiveEntitlements: new Map(),
    });
    resolveEffectiveVerticalCodeMock.mockResolvedValue("GYM");

    const { context } = await resolveEffectiveDashboardContext(NORMAL_USER, ALL_CODES);

    expect(context.verticalCode).toBe("GYM");
    expect(context.isRuntime).toBe(true);
    expect(context.readOnly).toBe(true);
    expect(context.enabledModuleCodes.has("gym.memberships")).toBe(true);
  });

  it("4. LEGACY_UNMANAGED — bypass, isLegacyUnmanaged true y todos los codes pasan", async () => {
    resolveEffectiveTenantContextMock.mockResolvedValue({
      context: { tenantId: "tenant-legacy", client: undefined, runtime: null },
      dispose: noopDispose,
    });
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "LEGACY_UNMANAGED",
      tenantId: "tenant-legacy",
      organizationId: null,
      planId: null,
      verticalId: null,
      effectiveModules: new Map(),
      effectiveEntitlements: new Map(),
    });
    resolveEffectiveVerticalCodeMock.mockResolvedValue(null);

    const { context } = await resolveEffectiveDashboardContext(NORMAL_USER, ALL_CODES);

    expect(context.isLegacyUnmanaged).toBe(true);
    expect(context.organizationName).toBeNull();
    expect([...context.enabledModuleCodes].sort()).toEqual([...ALL_CODES].sort());
    expect(platformOrganizationFindUniqueSpy).not.toHaveBeenCalled();
  });
});
