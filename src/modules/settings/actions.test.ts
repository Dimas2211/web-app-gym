// ─────────────────────────────────────────────────────────────────
// settings — actions.test.ts
//
// PASO 6E — updateGymSettingsAction es tenant-scoped (GymSettings.gym_id)
// y NO tenía guard de sesión runtime "Operar como cliente" — corregido.
//
// PASO 6F — Sport/Goal son catálogo GLOBAL de almacenamiento (sin
// gym_id/tenant_id), pero esta superficie es funcionalidad GYM: aunque
// el dato no dependa del tenant, mientras exista una sesión runtime
// "Operar como cliente" (siempre solo lectura) las mutaciones deben
// bloquearse igual que cualquier write operativo.
//
// FASE VI-D7 — migrado a requireOperationalContext({ write: true }): el
// bloqueo de escritura bajo Support Session/readOnly ahora se certifica
// vía OperationalContextError igual que el resto de módulos migrados, y
// todo acceso a datos pasa por context.client (runtime-aware).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const {
  gymSettingsUpsertSpy,
  sportFindUniqueSpy,
  sportUpdateSpy,
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
    gymSettingsUpsertSpy: vi.fn(),
    sportFindUniqueSpy: vi.fn(async () => ({ id: "sport-1", status: "active" })),
    sportUpdateSpy: vi.fn(),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { updateGymSettingsAction, toggleSportStatusAction } from "./actions";

function fakeHandle() {
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin", location_id: "loc-1" },
      tenantId: "tenant-1",
      locationId: "loc-1",
      client: {
        gymSettings: { upsert: gymSettingsUpsertSpy },
        sport: { findUnique: sportFindUniqueSpy, update: sportUpdateSpy },
      },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  gymSettingsUpsertSpy.mockClear();
  sportFindUniqueSpy.mockClear();
  sportUpdateSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('updateGymSettingsAction (tenant-scoped) — sesión runtime "Operar como cliente" bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY) -> bloquea ANTES de tocar gymSettings.upsert", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await updateGymSettingsAction(undefined, fd({
      staff_code_prefix: "A",
      staff_code_digits: "4",
      staff_code_start: "1010",
      client_code_prefix: "C",
      client_code_digits: "4",
      client_code_start: "1010",
    }));

    expect(gymSettingsUpsertSpy).not.toHaveBeenCalled();
  });

  it("modo normal -> upsert filtrado por tenant efectivo", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await updateGymSettingsAction(undefined, fd({
      staff_code_prefix: "A",
      staff_code_digits: "4",
      staff_code_start: "1010",
      client_code_prefix: "C",
      client_code_digits: "4",
      client_code_start: "1010",
    }));

    expect(gymSettingsUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gym_id: "tenant-1" } }),
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});

describe('toggleSportStatusAction (catálogo global, superficie GYM) — sesión runtime bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY) -> bloquea ANTES de tocar sport.findUnique/update", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await toggleSportStatusAction(fd({ id: "sport-1" }));

    expect(sportFindUniqueSpy).not.toHaveBeenCalled();
    expect(sportUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await toggleSportStatusAction(fd({ id: "sport-1" }));

    expect(sportUpdateSpy).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
