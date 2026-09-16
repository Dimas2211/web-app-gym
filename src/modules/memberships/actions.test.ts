// ─────────────────────────────────────────────────────────────────
// memberships — actions.test.ts
//
// PASO 6C: sesión runtime "Operar como cliente" activa (siempre solo
// lectura) debe bloquear cualquier write de memberships.
//
// FASE VI-D7: migrado a requireOperationalContext({ module: "gym.memberships",
// write: true }) — un único gate certifica READ_ONLY (Support Session) y
// MODULE_DISABLED (gym.memberships no habilitado) sobre el tenant EFECTIVO,
// y todo acceso a datos pasa por context.client.
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

const {
  planUpdateSpy,
  planFindFirstSpy,
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
    planUpdateSpy: vi.fn(),
    planFindFirstSpy: vi.fn(async () => ({ id: "plan-1", status: "active", branch_id: "loc-1" })),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { togglePlanStatusAction } from "./actions";

function fakeHandle(overrides: Partial<{ role: string; tenantId: string }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: overrides.role ?? "super_admin", location_id: "loc-1" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: "loc-1",
      client: { membershipPlan: { findFirst: planFindFirstSpy, update: planUpdateSpy } },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  planUpdateSpy.mockReset();
  planFindFirstSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('togglePlanStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY / Support Session) -> bloquea ANTES de tocar membershipPlan.findFirst/update", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await togglePlanStatusAction(fd({ id: "plan-1" }));

    expect(planFindFirstSpy).not.toHaveBeenCalled();
    expect(planUpdateSpy).not.toHaveBeenCalled();
  });

  it("requireOperationalContext rechaza (MODULE_DISABLED, gym.memberships no habilitado) -> bloquea el write", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 402),
    );

    await togglePlanStatusAction(fd({ id: "plan-1" }));

    expect(planFindFirstSpy).not.toHaveBeenCalled();
    expect(planUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente, filtrado por tenant efectivo", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await togglePlanStatusAction(fd({ id: "plan-1" }));

    expect(planFindFirstSpy).toHaveBeenCalledWith({
      where: { id: "plan-1", tenant_id: "tenant-1" },
    });
    expect(planUpdateSpy).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
