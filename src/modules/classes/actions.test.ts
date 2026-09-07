// ─────────────────────────────────────────────────────────────────
// classes — actions.test.ts
//
// PASO 6C — Auditoría de aislamiento GYM: sesión runtime "Operar como
// cliente" activa (siempre solo lectura) debe bloquear cualquier
// write de classes ANTES de tocar prisma — sin importar el rol del
// super_admin autenticado ni el estado de gym.classes.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  requireMembershipManager: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
  canManageClass: vi.fn(() => true),
}));

const { classTypeUpdateSpy, classTypeFindFirstSpy } = vi.hoisted(() => ({
  classTypeUpdateSpy: vi.fn(),
  classTypeFindFirstSpy: vi.fn(async () => ({ id: "type-1", status: "active", tenant_id: "tenant-1" })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    classType: { findFirst: classTypeFindFirstSpy, update: classTypeUpdateSpy },
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

import { toggleClassTypeStatusAction } from "./actions";

beforeEach(() => {
  classTypeUpdateSpy.mockReset();
  classTypeFindFirstSpy.mockClear();
  isRuntimeReadOnlyActiveMock.mockReset();
  isRuntimeReadOnlyActiveMock.mockResolvedValue(false);
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleClassTypeStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("isRuntimeReadOnlyActive() true -> bloquea ANTES de tocar prisma.classType.findFirst/update", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(true);

    await toggleClassTypeStatusAction(fd({ id: "type-1" }));

    expect(classTypeFindFirstSpy).not.toHaveBeenCalled();
    expect(classTypeUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente", async () => {
    isRuntimeReadOnlyActiveMock.mockResolvedValue(false);

    await toggleClassTypeStatusAction(fd({ id: "type-1" }));

    expect(classTypeUpdateSpy).toHaveBeenCalledTimes(1);
  });
});
