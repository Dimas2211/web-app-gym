// ─────────────────────────────────────────────────────────────────
// memberships — actions.test.ts
//
// PASO 6C — Auditoría de aislamiento GYM: sesión runtime "Operar como
// cliente" activa (siempre solo lectura) debe bloquear cualquier
// write de memberships ANTES de tocar prisma — sin importar el rol
// del super_admin autenticado ni el estado de gym.memberships.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  requireMembershipManager: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  getSessionOrRedirect: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManagePlan: vi.fn(() => true),
  canManageMembership: vi.fn(() => true),
}));

const { planUpdateSpy, planFindUniqueSpy } = vi.hoisted(() => ({
  planUpdateSpy: vi.fn(),
  planFindUniqueSpy: vi.fn(async () => ({ id: "plan-1", status: "active" })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    membershipPlan: { findUnique: planFindUniqueSpy, update: planUpdateSpy },
  },
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

import { togglePlanStatusAction } from "./actions";

beforeEach(() => {
  planUpdateSpy.mockReset();
  planFindUniqueSpy.mockClear();
  isRuntimeReadOnlyActiveMock.mockReset();
  isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('togglePlanStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("isRuntimeReadOnlyActive() true -> bloquea ANTES de tocar prisma.membershipPlan.findUnique/update", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    await togglePlanStatusAction(fd({ id: "plan-1" }));

    expect(planFindUniqueSpy).not.toHaveBeenCalled();
    expect(planUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);

    await togglePlanStatusAction(fd({ id: "plan-1" }));

    expect(planUpdateSpy).toHaveBeenCalledTimes(1);
  });
});
