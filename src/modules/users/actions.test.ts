// ─────────────────────────────────────────────────────────────────
// users — actions.test.ts
//
// PASO 6E — Microauditoría de superficies residuales: users/actions.ts
// (create/update/delete/toggle) es tenant-scoped (User.gym_id/tenant_id)
// y NO tenía guard de sesión runtime "Operar como cliente" — un
// super_admin en runtime podía crear/editar/desactivar/eliminar cuentas
// de staff del tenant real sin darse cuenta. Este test fija el bloqueo.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  getSessionOrRedirect: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageUser: vi.fn(() => true),
}));

const { userFindUniqueSpy, toggleCoreUserStatusSpy } = vi.hoisted(() => ({
  userFindUniqueSpy: vi.fn(async () => ({ id: "user-1", status: "active", tenant_id: "tenant-1" })),
  toggleCoreUserStatusSpy: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: userFindUniqueSpy } },
}));

vi.mock("@/core/modules/users/actions", () => ({
  createCoreUser: vi.fn(),
  updateCoreUser: vi.fn(),
  toggleCoreUserStatus: toggleCoreUserStatusSpy,
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

import { toggleUserStatusAction } from "./actions";

beforeEach(() => {
  userFindUniqueSpy.mockClear();
  toggleCoreUserStatusSpy.mockClear();
  isRuntimeReadOnlyActiveMock.mockReset();
  isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleUserStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("isRuntimeReadOnlyActive() true -> bloquea ANTES de tocar prisma.user.findUnique/toggleCoreUserStatus", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    await toggleUserStatusAction(fd({ id: "user-1" }));

    expect(userFindUniqueSpy).not.toHaveBeenCalled();
    expect(toggleCoreUserStatusSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);

    await toggleUserStatusAction(fd({ id: "user-1" }));

    expect(toggleCoreUserStatusSpy).toHaveBeenCalledTimes(1);
  });
});
