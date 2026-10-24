// ─────────────────────────────────────────────────────────────────
// platform/actions — preview-data-onboarding-excel.gym.test.ts
//
// GYM-ONBOARDING — el preview (validación + análisis DB-aware) de
// datasets GYM exige la vertical GYM efectiva de la organización destino
// server-side; los datasets Commerce no cambian.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/security/encryption", () => ({
  assertEncryptionAvailable: vi.fn(),
  decryptText: vi.fn().mockReturnValue("fake-password"),
}));

vi.mock("@/lib/db/prisma", async () => {
  const { buildFakeControlPlane } = await import("../runtime/organization-runtime-test-fixtures");
  return { prisma: buildFakeControlPlane() };
});

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn(async () => ({ id: "super-1", role: "super_admin" })),
}));

vi.mock("../lib/client-prisma", () => ({
  withTemporaryPrismaClient: (_url: string, cb: (c: unknown) => unknown) => cb({ fake: "client" }),
}));

vi.mock("../lib/data-onboarding/excel-preview-parser", () => ({
  parseDataOnboardingWorkbook: () => ({
    datasetKey: "x", status: "VALID", columns: [], rows: [],
    summary: { totalRows: 0, validRows: 0, invalidRows: 0, warningRows: 0, emptyRowsIgnored: 0 },
  }),
}));

const analyzerMock = vi.fn(async () => ({ status: "READY", rows: [], summary: {} }));
vi.mock("../lib/data-onboarding/db-aware-preview-analyzer", () => ({
  analyzeDataOnboardingPreviewAgainstDatabase: (...a: unknown[]) => analyzerMock(...(a as [])),
}));

let enabledModules: string[] = [];
vi.mock("../runtime/commercial-enforcement", () => {
  class CommercialEnforcementError extends Error {
    userMessage: string;
    constructor(msg: string) { super(msg); this.userMessage = msg; }
  }
  return {
    CommercialEnforcementError,
    resolveCommercialEnforcementContext: vi.fn(async (tenantId: string) => ({ mode: "MANAGED", tenantId, enabled: [...enabledModules] })),
    hasOrganizationModule: (ctx: { enabled: string[] }, code: string) => ctx.enabled.includes(code),
  };
});

const verticalByTenant: Record<string, string | null> = { TENANT_A: "GYM", TENANT_B: null };
vi.mock("../runtime/effective-vertical", () => ({
  resolveEffectiveVerticalCode: async (ctx: { tenantId: string }) => verticalByTenant[ctx.tenantId] ?? null,
  hasEffectiveVertical: (_ctx: unknown, code: string | null, required: string) => code === required,
}));

import { previewDataOnboardingExcelAction } from "./preview-data-onboarding-excel.action";
import { ORG_A, ORG_B } from "../runtime/organization-runtime-test-fixtures";

function form(datasetKey: string, organizationId: string) {
  const fd = new FormData();
  fd.set("organizationId", organizationId);
  fd.set("datasetKey", datasetKey);
  fd.set("file", new File([new Uint8Array([1, 2, 3])], "datos.xlsx"));
  return fd;
}

beforeEach(() => {
  analyzerMock.mockClear();
  enabledModules = ["gym.trainers"];
});

describe("preview de datasets GYM", () => {
  it("Commerce-only → error, sin análisis contra la base", async () => {
    const result = await previewDataOnboardingExcelAction(form("gym_clients", ORG_B.id));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("vertical GYM");
    expect(analyzerMock).not.toHaveBeenCalled();
  });

  it("GYM sin gym.trainers → entrenadores bloqueado", async () => {
    enabledModules = [];
    const result = await previewDataOnboardingExcelAction(form("gym_trainers", ORG_A.id));
    expect(result.success).toBe(false);
    expect(analyzerMock).not.toHaveBeenCalled();
  });

  it("organización GYM → análisis con tenant A y gymOptions", async () => {
    const result = await previewDataOnboardingExcelAction(form("gym_clients", ORG_A.id));
    expect(result.success).toBe(true);
    expect(analyzerMock.mock.calls[0]).toEqual([
      expect.objectContaining({ tenantId: "TENANT_A", datasetKey: "gym_clients", gymOptions: { classesModuleEnabled: false } }),
    ]);
  });

  it("regresión: dataset Commerce para organización sin GYM sigue analizándose", async () => {
    const result = await previewDataOnboardingExcelAction(form("customers", ORG_B.id));
    expect(result.success).toBe(true);
    expect(analyzerMock).toHaveBeenCalledTimes(1);
  });
});
