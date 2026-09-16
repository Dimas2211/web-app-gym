// ─────────────────────────────────────────────────────────────────
// trainers — actions.test.ts
//
// FASE VI-D7: migrado a requireOperationalContext({ module: "gym.trainers",
// write: true }) — certifica MODULE_DISABLED (gym.trainers) y READ_ONLY
// (Support Session) ANTES de tocar trainer.update, y que el acceso a
// datos pasa por context.client (runtime-aware) filtrado por tenant efectivo.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  getSessionOrRedirect: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageTrainer: vi.fn(() => true),
}));

const {
  trainerUpdateSpy,
  trainerFindFirstSpy,
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
    trainerUpdateSpy: vi.fn(),
    trainerFindFirstSpy: vi.fn(async () => ({ id: "trainer-1", status: "active", branch_id: "loc-1", gym_id: "tenant-1" })),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { toggleTrainerStatusAction } from "./actions";

function fakeHandle(overrides: Partial<{ role: string; tenantId: string }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: overrides.role ?? "super_admin", location_id: "loc-1" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: "loc-1",
      client: { trainer: { findFirst: trainerFindFirstSpy, update: trainerUpdateSpy } },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  trainerUpdateSpy.mockReset();
  trainerFindFirstSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("toggleTrainerStatusAction — módulo GYM (gym.trainers) deshabilitado bloquea el write", () => {
  it("gym.trainers deshabilitado (MODULE_DISABLED) -> bloquea, trainer.update NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 402),
    );

    await toggleTrainerStatusAction(fd({ id: "trainer-1" }));

    expect(trainerFindFirstSpy).not.toHaveBeenCalled();
    expect(trainerUpdateSpy).not.toHaveBeenCalled();
  });
});

describe('toggleTrainerStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY) -> bloquea ANTES de tocar trainer.findFirst/update", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await toggleTrainerStatusAction(fd({ id: "trainer-1" }));

    expect(trainerFindFirstSpy).not.toHaveBeenCalled();
    expect(trainerUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> el write procede, filtrado por tenant efectivo", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await toggleTrainerStatusAction(fd({ id: "trainer-1" }));

    expect(trainerFindFirstSpy).toHaveBeenCalledWith({
      where: { id: "trainer-1", tenant_id: "tenant-1" },
    });
    expect(trainerUpdateSpy).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
