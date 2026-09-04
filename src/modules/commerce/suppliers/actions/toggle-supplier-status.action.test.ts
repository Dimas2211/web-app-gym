// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — toggle-supplier-status.action.test.ts
//
// Bloque B (pasada de cobertura completa) — boundary secundario
// (update/toggle, no create): commerce.suppliers deshabilitado debe
// bloquear ANTES de invocar toggleSupplierStatus.
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

const { toggleSupplierStatusSpy, resolveCommercialEnforcementContextMock } = vi.hoisted(() => ({
  toggleSupplierStatusSpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("../services/supplier.service", () => ({
  toggleSupplierStatus: toggleSupplierStatusSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

import { toggleSupplierStatusAction } from "./toggle-supplier-status.action";

beforeEach(() => {
  toggleSupplierStatusSpy.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("toggleSupplierStatusAction — module guard en boundary secundario (update/toggle, no create)", () => {
  it("commerce.suppliers deshabilitado -> bloquea, toggleSupplierStatus (write) NUNCA se invoca", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map(),
      effectiveEntitlements: new Map(),
    });

    const result = await toggleSupplierStatusAction(undefined, fd({ id: "s1", status: "inactive" }));

    expect(result?.error).toBeTruthy();
    expect(toggleSupplierStatusSpy).not.toHaveBeenCalled();
  });
});
