// ─────────────────────────────────────────────────────────────────
// commerce/customers — update-customer.action.test.ts
//
// Bloque B (pasada de cobertura completa) — boundary secundario
// (update, no create): core.customers deshabilitado debe bloquear
// ANTES de invocar updateCustomer.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: vi.fn(async () => false),
  RUNTIME_READONLY_MESSAGE: "solo lectura",
}));

const { updateCustomerSpy, resolveCommercialEnforcementContextMock } = vi.hoisted(() => ({
  updateCustomerSpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("../services/customer.service", () => ({
  updateCustomer: updateCustomerSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

import { updateCustomerAction } from "./update-customer.action";

beforeEach(() => {
  updateCustomerSpy.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
});

describe("updateCustomerAction — module guard en boundary secundario (update, no create)", () => {
  it("core.customers deshabilitado -> bloquea, updateCustomer (write) NUNCA se invoca", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map(),
      effectiveEntitlements: new Map(),
    });

    const result = await updateCustomerAction("cust-1", { name: "Nuevo nombre" } as never);

    expect(result.ok).toBe(false);
    expect(updateCustomerSpy).not.toHaveBeenCalled();
  });
});
