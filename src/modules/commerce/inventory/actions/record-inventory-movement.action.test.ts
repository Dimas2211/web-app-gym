// ─────────────────────────────────────────────────────────────────
// commerce/inventory — record-inventory-movement.action.test.ts
//
// Bloque B (pasada de cobertura completa) — boundary de movement:
// commerce.inventory deshabilitado debe bloquear ANTES de invocar
// recordInventoryMovement (write real de stock).
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

const { recordInventoryMovementSpy, resolveCommercialEnforcementContextMock } = vi.hoisted(() => ({
  recordInventoryMovementSpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("../services/inventory-movement.service", () => ({
  recordInventoryMovement: recordInventoryMovementSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

import { recordInventoryMovementAction } from "./record-inventory-movement.action";

beforeEach(() => {
  recordInventoryMovementSpy.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("recordInventoryMovementAction — module guard en boundary de movement", () => {
  it("commerce.inventory deshabilitado -> bloquea, recordInventoryMovement (write) NUNCA se invoca", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map(),
      effectiveEntitlements: new Map(),
    });

    const result = await recordInventoryMovementAction(
      undefined,
      fd({ product_location_id: "pl1", movement_type: "MANUAL_IN", quantity: "5" }),
    );

    expect(result?.error).toBeTruthy();
    expect(recordInventoryMovementSpy).not.toHaveBeenCalled();
  });
});
