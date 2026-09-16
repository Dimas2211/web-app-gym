// ─────────────────────────────────────────────────────────────────
// classes — actions.test.ts
//
// PASO 6C: sesión runtime "Operar como cliente" activa (siempre solo
// lectura) debe bloquear cualquier write de classes.
//
// FASE VI-D7: migrado a requireOperationalContext({ module: "gym.classes",
// write: true }) — certifica READ_ONLY y MODULE_DISABLED ANTES de tocar
// classType.update, con todo el acceso a datos vía context.client.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  requireMembershipManager: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageClass: vi.fn(() => true),
}));

const {
  classTypeUpdateSpy,
  classTypeFindFirstSpy,
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
    classTypeUpdateSpy: vi.fn(),
    classTypeFindFirstSpy: vi.fn(async () => ({ id: "type-1", status: "active", tenant_id: "tenant-1" })),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { toggleClassTypeStatusAction } from "./actions";

function fakeHandle(overrides: Partial<{ role: string; tenantId: string }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: overrides.role ?? "super_admin", location_id: "loc-1" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: "loc-1",
      client: { classType: { findFirst: classTypeFindFirstSpy, update: classTypeUpdateSpy } },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  classTypeUpdateSpy.mockReset();
  classTypeFindFirstSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleClassTypeStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY) -> bloquea ANTES de tocar classType.findFirst/update", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await toggleClassTypeStatusAction(fd({ id: "type-1" }));

    expect(classTypeFindFirstSpy).not.toHaveBeenCalled();
    expect(classTypeUpdateSpy).not.toHaveBeenCalled();
  });

  it("requireOperationalContext rechaza (MODULE_DISABLED, gym.classes no habilitado) -> bloquea el write", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 402),
    );

    await toggleClassTypeStatusAction(fd({ id: "type-1" }));

    expect(classTypeUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente, filtrado por tenant efectivo", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await toggleClassTypeStatusAction(fd({ id: "type-1" }));

    expect(classTypeFindFirstSpy).toHaveBeenCalledWith({
      where: { id: "type-1", tenant_id: "tenant-1" },
    });
    expect(classTypeUpdateSpy).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
