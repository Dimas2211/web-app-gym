// ─────────────────────────────────────────────────────────────────
// settings — actions.test.ts
//
// PASO 6E — Microauditoría de superficies residuales:
// - updateGymSettingsAction es tenant-scoped (GymSettings.gym_id) y NO
//   tenía guard de sesión runtime "Operar como cliente" — corregido.
// - toggleSportStatusAction opera sobre Sport, catálogo GLOBAL sin
//   gym_id/tenant_id (no depende de tenant) — se clasifica
//   SAFE_SHARED_NON_TENANT y deliberadamente NO se bloquea en runtime;
//   este test fija esa distinción explícitamente.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { gymSettingsUpsertSpy, sportFindUniqueSpy, sportUpdateSpy } = vi.hoisted(() => ({
  gymSettingsUpsertSpy: vi.fn(),
  sportFindUniqueSpy: vi.fn(async () => ({ id: "sport-1", status: "active" })),
  sportUpdateSpy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    gymSettings: { upsert: gymSettingsUpsertSpy },
    sport: { findUnique: sportFindUniqueSpy, update: sportUpdateSpy },
  },
}));

const { isRuntimeReadOnlyActiveMock } = vi.hoisted(() => ({
  isRuntimeReadOnlyActiveMock: vi.fn(async () => false),
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: isRuntimeReadOnlyActiveMock,
  RUNTIME_READONLY_MESSAGE: "Modo \"Operar como cliente\" activo (solo lectura).",
}));

import { updateGymSettingsAction, toggleSportStatusAction } from "./actions";

beforeEach(() => {
  gymSettingsUpsertSpy.mockClear();
  sportFindUniqueSpy.mockClear();
  sportUpdateSpy.mockClear();
  isRuntimeReadOnlyActiveMock.mockReset();
  isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('updateGymSettingsAction (tenant-scoped) — sesión runtime "Operar como cliente" bloquea el write', () => {
  it("isRuntimeReadOnlyActive() true -> bloquea ANTES de tocar prisma.gymSettings.upsert", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

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
});

describe("toggleSportStatusAction (catálogo global, SAFE_SHARED_NON_TENANT) — no se bloquea en runtime", () => {
  it("procede aunque isRuntimeReadOnlyActive() sea true — Sport no tiene tenant_id/gym_id", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    await toggleSportStatusAction(fd({ id: "sport-1" }));

    expect(sportUpdateSpy).toHaveBeenCalledTimes(1);
  });
});
