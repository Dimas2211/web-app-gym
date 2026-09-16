// ─────────────────────────────────────────────────────────────────
// clients — actions.test.ts
//
// PASO 6D: sesión runtime "Operar como cliente" activa (siempre solo
// lectura) debe bloquear cualquier write de clients.
//
// FASE VI-D7: migrado a requireOperationalContext() — el bloqueo de
// escritura bajo Support Session/readOnly ahora se certifica igual que
// en el resto de módulos migrados (Products/Customers/Suppliers/
// Branches), vía OperationalContextError con code "READ_ONLY", y todo
// el acceso a datos pasa por context.client (runtime-aware) en vez del
// Prisma global.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hash") } }));

vi.mock("@/lib/permissions/guards", () => ({
  requireClientManager: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  getSessionOrRedirect: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageClient: vi.fn(() => true),
}));

const {
  clientUpdateSpy,
  clientFindFirstSpy,
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
    clientUpdateSpy: vi.fn(),
    clientFindFirstSpy: vi.fn(async () => ({ id: "client-1", status: "active", tenant_id: "tenant-1", branch_id: "loc-1" })),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { toggleClientStatusAction } from "./actions";

function fakeHandle(overrides: Partial<{ role: string; tenantId: string }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: overrides.role ?? "super_admin", location_id: "loc-1" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: "loc-1",
      client: { client: { findFirst: clientFindFirstSpy, update: clientUpdateSpy } },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  clientUpdateSpy.mockReset();
  clientFindFirstSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleClientStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY / Support Session) -> bloquea ANTES de tocar client.findFirst/update", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await toggleClientStatusAction(fd({ id: "client-1" }));

    expect(clientFindFirstSpy).not.toHaveBeenCalled();
    expect(clientUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente, filtrado por tenant efectivo", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await toggleClientStatusAction(fd({ id: "client-1" }));

    expect(clientFindFirstSpy).toHaveBeenCalledWith({
      where: { id: "client-1", tenant_id: "tenant-1" },
    });
    expect(clientUpdateSpy).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
