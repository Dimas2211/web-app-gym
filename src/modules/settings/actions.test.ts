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
// bloquearse igual que cualquier write operativo — "no es necesario
// volver tenant-scoped Sport/Goal, solo impedir mutaciones desde el
// modo cliente". Este test fija ese bloqueo (revierte la excepción
// documentada en el PASO 6E, ya superada por esta instrucción explícita).
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

describe('toggleSportStatusAction (catálogo global, superficie GYM) — sesión runtime bloquea el write', () => {
  it("isRuntimeReadOnlyActive() true -> bloquea ANTES de tocar prisma.sport.findUnique/update", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    await toggleSportStatusAction(fd({ id: "sport-1" }));

    expect(sportFindUniqueSpy).not.toHaveBeenCalled();
    expect(sportUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);

    await toggleSportStatusAction(fd({ id: "sport-1" }));

    expect(sportUpdateSpy).toHaveBeenCalledTimes(1);
  });
});
