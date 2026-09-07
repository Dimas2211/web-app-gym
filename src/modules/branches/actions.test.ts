// ─────────────────────────────────────────────────────────────────
// branches — actions.test.ts
//
// PASO 6E — Microauditoría de superficies residuales: branches/actions.ts
// (create/update/toggle) no tenía guard de sesión runtime "Operar como
// cliente" — un super_admin en runtime podía crear/editar/desactivar
// sucursales del tenant real sin darse cuenta. Este test fija el bloqueo.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  requireSuperAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageBranch: vi.fn(() => true),
}));

const { toggleLocationStatusSpy } = vi.hoisted(() => ({
  toggleLocationStatusSpy: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/core/modules/locations/actions", () => ({
  createLocation: vi.fn(),
  updateLocation: vi.fn(),
  toggleLocationStatus: toggleLocationStatusSpy,
}));

const { isRuntimeReadOnlyActiveMock, resolveCommercialEnforcementContextMock } = vi.hoisted(() => ({
  isRuntimeReadOnlyActiveMock: vi.fn(async () => false),
  resolveCommercialEnforcementContextMock: vi.fn(async () => ({
    mode: "LEGACY_UNMANAGED",
    tenantId: "tenant-1",
    organizationId: null,
    planId: null,
    verticalId: null,
    effectiveModules: new Map(),
    effectiveEntitlements: new Map(),
  })),
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: isRuntimeReadOnlyActiveMock,
  RUNTIME_READONLY_MESSAGE: "Modo \"Operar como cliente\" activo (solo lectura).",
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

import { toggleBranchStatusAction } from "./actions";

beforeEach(() => {
  toggleLocationStatusSpy.mockClear();
  isRuntimeReadOnlyActiveMock.mockReset();
  isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleBranchStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("isRuntimeReadOnlyActive() true -> bloquea ANTES de tocar toggleLocationStatus", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    await toggleBranchStatusAction(fd({ id: "branch-1" }));

    expect(toggleLocationStatusSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);

    await toggleBranchStatusAction(fd({ id: "branch-1" }));

    expect(toggleLocationStatusSpy).toHaveBeenCalledTimes(1);
  });
});
