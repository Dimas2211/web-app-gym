// ─────────────────────────────────────────────────────────────────
// trainers — actions.test.ts
//
// Bloque B (pasada de cobertura completa) — módulo GYM: gym.trainers
// deshabilitado debe bloquear toggleTrainerStatusAction ANTES del
// write real de prisma.trainer.update.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  getSessionOrRedirect: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageTrainer: vi.fn(() => true),
}));

const { trainerUpdateSpy, trainerFindUniqueSpy, resolveCommercialEnforcementContextMock } = vi.hoisted(() => ({
  trainerUpdateSpy: vi.fn(),
  trainerFindUniqueSpy: vi.fn(async () => ({ id: "trainer-1", status: "active", branch_id: "loc-1", gym_id: "tenant-1" })),
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    trainer: { findUnique: trainerFindUniqueSpy, update: trainerUpdateSpy },
  },
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

const { isRuntimeReadOnlyActiveMock } = vi.hoisted(() => ({
  isRuntimeReadOnlyActiveMock: vi.fn(async () => false),
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: isRuntimeReadOnlyActiveMock,
  RUNTIME_READONLY_MESSAGE: "Modo \"Operar como cliente\" activo (solo lectura).",
}));

import { toggleTrainerStatusAction } from "./actions";

beforeEach(() => {
  trainerUpdateSpy.mockReset();
  trainerFindUniqueSpy.mockClear();
  resolveCommercialEnforcementContextMock.mockReset();
  isRuntimeReadOnlyActiveMock.mockReset();
  isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("toggleTrainerStatusAction — módulo GYM (gym.trainers) deshabilitado bloquea el write", () => {
  it("gym.trainers deshabilitado -> bloquea, prisma.trainer.update NUNCA se invoca", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map(),
      effectiveEntitlements: new Map(),
    });

    await toggleTrainerStatusAction(fd({ id: "trainer-1" }));

    expect(trainerUpdateSpy).not.toHaveBeenCalled();
  });
});

describe('toggleTrainerStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("isRuntimeReadOnlyActive() true -> bloquea ANTES de tocar prisma.trainer.findUnique/update", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    await toggleTrainerStatusAction(fd({ id: "trainer-1" }));

    expect(trainerFindUniqueSpy).not.toHaveBeenCalled();
    expect(trainerUpdateSpy).not.toHaveBeenCalled();
  });
});
