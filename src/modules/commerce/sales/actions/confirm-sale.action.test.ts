// ─────────────────────────────────────────────────────────────────
// commerce/sales — confirm-sale.action.test.ts
//
// Bloque B (pasada de cobertura completa) — boundary secundario
// (no create): confirmSaleAction con commerce.sales deshabilitado
// debe bloquear ANTES de invocar confirmSale (el service/write real
// nunca se ejecuta).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: vi.fn(async () => "loc-1"),
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: vi.fn(async () => false),
  RUNTIME_READONLY_MESSAGE: "solo lectura",
}));

const { confirmSaleSpy, resolveCommercialEnforcementContextMock } = vi.hoisted(() => ({
  confirmSaleSpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("../services/sale.service", () => ({
  confirmSale: confirmSaleSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return {
    ...actual,
    resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock,
  };
});

import { confirmSaleAction } from "./confirm-sale.action";

beforeEach(() => {
  confirmSaleSpy.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
});

describe("confirmSaleAction — module guard en boundary secundario (no create)", () => {
  it("commerce.sales deshabilitado -> bloquea, confirmSale (write) NUNCA se invoca", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map(), // commerce.sales no configurado -> disabled
      effectiveEntitlements: new Map(),
    });

    const result = await confirmSaleAction("sale-1");

    expect(result.ok).toBe(false);
    expect(confirmSaleSpy).not.toHaveBeenCalled();
  });

  it("commerce.sales habilitado -> permite continuar hasta el service", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map([["commerce.sales", { module_id: "m1", code: "commerce.sales", name: "Ventas", category: "COMMERCE", is_core: false, enabled: true, source: "PLAN" }]]),
      effectiveEntitlements: new Map(),
    });
    confirmSaleSpy.mockResolvedValue({ ok: true });

    const result = await confirmSaleAction("sale-1");

    expect(confirmSaleSpy).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});
