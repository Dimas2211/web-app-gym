// ─────────────────────────────────────────────────────────────────
// branches — actions.test.ts
//
// PASO 6E — Microauditoría de superficies residuales: branches/actions.ts
// (create/update/toggle) no tenía guard de sesión runtime "Operar como
// cliente" — un super_admin en runtime podía crear/editar/desactivar
// sucursales del tenant real sin darse cuenta. Este test fija el bloqueo.
//
// FASE VI-D3 — migrado a requireOperationalContext(): el bloqueo de
// escritura bajo Support Session/readOnly ahora se certifica igual que
// en el resto de módulos migrados (Products/Customers/Suppliers), vía
// OperationalContextError con code "READ_ONLY".
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  requireSuperAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageBranch: vi.fn(() => true),
}));

const { toggleLocationStatusSpy, requireOperationalContextMock, disposeMock, FakeOperationalContextError } = vi.hoisted(() => {
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
    toggleLocationStatusSpy: vi.fn(async () => ({ success: true })),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/core/modules/locations/actions", () => ({
  createLocation: vi.fn(),
  updateLocation: vi.fn(),
  toggleLocationStatus: toggleLocationStatusSpy,
}));

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { toggleBranchStatusAction } from "./actions";

function fakeHandle(overrides: Partial<{ role: string; client: unknown; tenantId: string; commercialContext: unknown }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: overrides.role ?? "super_admin", location_id: "loc-1" },
      tenantId: overrides.tenantId ?? "tenant-1",
      client: overrides.client ?? { __marker: "RUNTIME_CLIENT_DB" },
      commercialContext: overrides.commercialContext ?? { organizationId: null },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  toggleLocationStatusSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleBranchStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY / Support Session) -> bloquea ANTES de tocar toggleLocationStatus", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await toggleBranchStatusAction(fd({ id: "branch-1" }));

    expect(toggleLocationStatusSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await toggleBranchStatusAction(fd({ id: "branch-1" }));

    expect(toggleLocationStatusSpy).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
