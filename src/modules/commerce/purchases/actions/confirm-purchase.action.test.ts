// ─────────────────────────────────────────────────────────────────
// commerce/purchases — confirm-purchase.action.test.ts
//
// Bloque B (pasada de cobertura completa) — boundary secundario
// (no create): confirmPurchaseAction con commerce.purchases
// deshabilitado debe bloquear ANTES de invocar confirmPurchase.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: vi.fn(async () => "loc-1"),
}));

const { confirmPurchaseSpy, resolveCommercialEnforcementContextMock } = vi.hoisted(() => ({
  confirmPurchaseSpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("../services/purchase.service", () => ({
  confirmPurchase: confirmPurchaseSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

import { confirmPurchaseAction } from "./confirm-purchase.action";

beforeEach(() => {
  confirmPurchaseSpy.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("confirmPurchaseAction — module guard en boundary secundario (no create)", () => {
  it("commerce.purchases deshabilitado -> bloquea, confirmPurchase (write) NUNCA se invoca", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map(),
      effectiveEntitlements: new Map(),
    });

    const result = await confirmPurchaseAction(undefined, fd({ purchase_id: "p1" }));

    expect(result?.error).toBeTruthy();
    expect(confirmPurchaseSpy).not.toHaveBeenCalled();
  });
});
