// ─────────────────────────────────────────────────────────────────
// weekly-plans — actions.test.ts
//
// PASO 6C — Auditoría de aislamiento GYM: sesión runtime "Operar como
// cliente" activa (siempre solo lectura) debe bloquear cualquier
// write de weekly-plans ANTES de tocar prisma — sin importar el rol
// del super_admin autenticado ni el estado de gym.weekly_plans.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  requireClassViewer: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  getSessionOrRedirect: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageBranch: vi.fn(() => true),
  canDeleteDirectly: vi.fn(() => true),
}));

const { templateUpdateSpy, templateFindFirstSpy } = vi.hoisted(() => ({
  templateUpdateSpy: vi.fn(),
  templateFindFirstSpy: vi.fn(async () => ({ id: "template-1", status: "active", branch_id: null, tenant_id: "tenant-1" })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    weeklyPlanTemplate: { findFirst: templateFindFirstSpy, update: templateUpdateSpy },
  },
}));

const { isRuntimeReadOnlyActiveMock, resolveCommercialEnforcementContextMock } = vi.hoisted(() => ({
  isRuntimeReadOnlyActiveMock: vi.fn(async () => false),
  resolveCommercialEnforcementContextMock: vi.fn(async () => ({
    mode: "LEGACY_UNMANAGED",
    tenantId: "tenant-1",
    organizationId: null,
    planId: null,
    verticalId: null,
    effectiveModules: new Map(),
    effectiveEntitlements: new Map(),
  })),
}));

vi.mock("@/modules/platform/runtime/runtime-session", () => ({
  isRuntimeReadOnlyActive: isRuntimeReadOnlyActiveMock,
  RUNTIME_READONLY_MESSAGE: "Modo \"Operar como cliente\" activo (solo lectura).",
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

// getLinkedTrainerId se importa desde ./queries dentro de actions.ts —
// no participa en este flujo (role super_admin), pero se mockea para
// evitar tocar prisma real si algún día cambia el guard de scope.
vi.mock("./queries", () => ({
  getLinkedTrainerId: vi.fn(async () => null),
}));

import { toggleTemplateStatusAction } from "./actions";

beforeEach(() => {
  templateUpdateSpy.mockReset();
  templateFindFirstSpy.mockClear();
  isRuntimeReadOnlyActiveMock.mockReset();
  isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleTemplateStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("isRuntimeReadOnlyActive() true -> bloquea ANTES de tocar prisma.weeklyPlanTemplate.findFirst/update", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    await toggleTemplateStatusAction(fd({ id: "template-1" }));

    expect(templateFindFirstSpy).not.toHaveBeenCalled();
    expect(templateUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);

    await toggleTemplateStatusAction(fd({ id: "template-1" }));

    expect(templateUpdateSpy).toHaveBeenCalledTimes(1);
  });
});
