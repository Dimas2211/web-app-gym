// ─────────────────────────────────────────────────────────────────
// users — actions.test.ts
//
// PASO 6E — Microauditoría de superficies residuales: users/actions.ts
// (create/update/delete/toggle) es tenant-scoped (User.gym_id/tenant_id)
// y NO tenía guard de sesión runtime "Operar como cliente" — un
// super_admin en runtime podía crear/editar/desactivar/eliminar cuentas
// de staff del tenant real sin darse cuenta. Este test fija el bloqueo.
//
// FASE VI-D4 — migrado a requireOperationalContext(): certifica además
// que la mutación usa context.client (runtime efectivo) y que el rol
// LIVE decide la autorización, no el rol del JWT.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  getSessionOrRedirect: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageUser: vi.fn(() => true),
}));

const {
  userFindFirstSpy,
  toggleCoreUserStatusSpy,
  requireOperationalContextMock,
  disposeMock,
  FakeOperationalContextError,
} = vi.hoisted(() => {
  class FakeOperationalContextError extends Error {
    code: string;
    httpStatus: number;
    userMessage: string;
    constructor(code: string, userMessage: string, httpStatus: number) {
      super(userMessage);
      this.code = code;
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    userFindFirstSpy: vi.fn(async () => ({ id: "user-1", status: "active", tenant_id: "tenant-1", gym_id: "tenant-1" })),
    toggleCoreUserStatusSpy: vi.fn(async () => ({ success: true })),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/core/modules/users/actions", () => ({
  createCoreUser: vi.fn(),
  updateCoreUser: vi.fn(),
  toggleCoreUserStatus: toggleCoreUserStatusSpy,
}));

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  CommercialEnforcementError: class CommercialEnforcementError extends Error {},
}));

import { toggleUserStatusAction } from "./actions";

function fakeHandle(overrides: Partial<{ role: string; client: unknown; tenantId: string }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: overrides.role ?? "super_admin", tenant_id: overrides.tenantId ?? "tenant-1", location_id: "loc-1" },
      tenantId: overrides.tenantId ?? "tenant-1",
      client: overrides.client ?? { __marker: "RUNTIME_CLIENT_DB", user: { findFirst: userFindFirstSpy } },
      commercialContext: { organizationId: null },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  userFindFirstSpy.mockClear();
  toggleCoreUserStatusSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleUserStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY / Support Session) -> bloquea ANTES de tocar prisma.user/toggleCoreUserStatus", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await toggleUserStatusAction(fd({ id: "user-1" }));

    expect(userFindFirstSpy).not.toHaveBeenCalled();
    expect(toggleCoreUserStatusSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente, usa context.client", async () => {
    const runtimeDbMarker = { user: { findFirst: userFindFirstSpy } };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));

    await toggleUserStatusAction(fd({ id: "user-1" }));

    expect(toggleCoreUserStatusSpy).toHaveBeenCalledTimes(1);
    expect(toggleCoreUserStatusSpy).toHaveBeenCalledWith("user-1", "u1", "tenant-1", { organizationId: null }, runtimeDbMarker);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
