// ─────────────────────────────────────────────────────────────────
// weekly-plans — actions.test.ts
//
// PASO 6C: sesión runtime "Operar como cliente" activa (siempre solo
// lectura) debe bloquear cualquier write de weekly-plans.
//
// FASE VI-D7: migrado a requireOperationalContext({ module: "gym.weekly_plans",
// write: true }) — certifica READ_ONLY y MODULE_DISABLED ANTES de tocar
// weeklyPlanTemplate.update, con todo el acceso a datos vía context.client
// y canManageTemplate evaluado sobre el ROL/location LIVE (context.effectiveUser).
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

// getLinkedTrainerId se importa desde ./queries dentro de actions.ts —
// no participa en este flujo (role super_admin), pero se mockea para
// evitar tocar prisma real si algún día cambia el guard de scope.
vi.mock("./queries", () => ({
  getLinkedTrainerId: vi.fn(async () => null),
}));

const {
  templateUpdateSpy,
  templateFindFirstSpy,
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
    templateUpdateSpy: vi.fn(),
    templateFindFirstSpy: vi.fn(async () => ({ id: "template-1", status: "active", branch_id: null, tenant_id: "tenant-1" })),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { toggleTemplateStatusAction } from "./actions";

function fakeHandle(overrides: Partial<{ role: string; tenantId: string }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: overrides.role ?? "super_admin", location_id: "loc-1", tenant_id: overrides.tenantId ?? "tenant-1" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: "loc-1",
      client: { weeklyPlanTemplate: { findFirst: templateFindFirstSpy, update: templateUpdateSpy } },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  templateUpdateSpy.mockReset();
  templateFindFirstSpy.mockClear();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('toggleTemplateStatusAction — sesión runtime "Operar como cliente" activa bloquea el write', () => {
  it("requireOperationalContext rechaza (READ_ONLY) -> bloquea ANTES de tocar weeklyPlanTemplate.findFirst/update", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo \"Operar como cliente\" activo (solo lectura).", 403),
    );

    await toggleTemplateStatusAction(fd({ id: "template-1" }));

    expect(templateFindFirstSpy).not.toHaveBeenCalled();
    expect(templateUpdateSpy).not.toHaveBeenCalled();
  });

  it("requireOperationalContext rechaza (MODULE_DISABLED, gym.weekly_plans no habilitado) -> bloquea el write", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("MODULE_DISABLED", "Módulo no habilitado.", 402),
    );

    await toggleTemplateStatusAction(fd({ id: "template-1" }));

    expect(templateUpdateSpy).not.toHaveBeenCalled();
  });

  it("modo normal (sin sesión runtime) -> el write procede normalmente, filtrado por tenant efectivo", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    await toggleTemplateStatusAction(fd({ id: "template-1" }));

    expect(templateFindFirstSpy).toHaveBeenCalledWith({
      where: { id: "template-1", tenant_id: "tenant-1" },
    });
    expect(templateUpdateSpy).toHaveBeenCalledTimes(1);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
