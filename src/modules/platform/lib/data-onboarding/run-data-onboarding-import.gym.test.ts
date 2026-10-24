// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — run-data-onboarding-import.gym.test.ts
//
// GYM-ONBOARDING — gate server-side del pipeline para gym_clients y
// gym_trainers. Resolver organizationId → tenant y Runtime Router REALES
// contra el Control Plane sintético (Shared PRODUCTION A/B + Dedicated D).
// Parser/analizador/cliente runtime son stubs: se prueba la DECISIÓN
// (vertical GYM, gym.trainers, PRODUCTION, truncado) y el tenant que
// llega al runner — nunca se conecta a una base real.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/security/encryption", () => ({
  assertEncryptionAvailable: vi.fn(),
  decryptText: vi.fn().mockReturnValue("fake-password"),
}));

const logCreateMock = vi.fn();
vi.mock("@/lib/db/prisma", async () => {
  const { buildFakeControlPlane } = await import("../../runtime/organization-runtime-test-fixtures");
  return {
    prisma: {
      ...buildFakeControlPlane(),
      platformDeploymentLog: { create: (...a: unknown[]) => logCreateMock(...a) },
    },
  };
});

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn(async () => ({ id: "super-1", role: "super_admin", email: "root@zolvi.test" })),
}));

const withTemporaryPrismaClientMock = vi.fn();
vi.mock("../client-prisma", () => ({
  withTemporaryPrismaClient: (...a: unknown[]) => withTemporaryPrismaClientMock(...a),
}));

// ONBOARDING-5K: el parser ya no trunca — sobre el máximo lanza
// DataOnboardingRowLimitError. Stub coherente: 1 fila parseada = 1 analizada.
let overRowLimit = false;
vi.mock("./excel-preview-parser", () => ({
  parseDataOnboardingWorkbook: () => {
    if (overRowLimit) {
      throw new Error("El archivo contiene 5,001 registros no vacíos y el máximo por importación es 5,000.");
    }
    return {
      datasetKey: "x", status: "VALID", columns: [],
      rows: [{ rowNumber: 2, status: "VALID", data: {}, errors: [], warnings: [] }],
      summary: { totalRows: 1, validRows: 1, invalidRows: 0, warningRows: 0, emptyRowsIgnored: 0 },
    };
  },
}));

const analyzerMock = vi.fn();
vi.mock("./db-aware-preview-analyzer", () => ({
  analyzeDataOnboardingPreviewAgainstDatabase: (...a: unknown[]) => analyzerMock(...a),
}));

let enabledModules: string[] = [];
vi.mock("../../runtime/commercial-enforcement", () => {
  class CommercialEnforcementError extends Error {
    userMessage: string;
    constructor(msg: string) { super(msg); this.userMessage = msg; }
  }
  return {
    CommercialEnforcementError,
    resolveCommercialEnforcementContext: vi.fn(async (tenantId: string) => ({
      mode: "MANAGED", tenantId, enabled: [...enabledModules],
    })),
    hasOrganizationModule: (ctx: { enabled: string[] }, code: string) => ctx.enabled.includes(code),
  };
});

// Vertical efectiva por tenant (Control Plane): A y D operan GYM; B es Commerce-only.
let verticalByTenant: Record<string, string | null> = {};
vi.mock("../../runtime/effective-vertical", () => ({
  resolveEffectiveVerticalCode: async (ctx: { tenantId: string }) => verticalByTenant[ctx.tenantId] ?? null,
  hasEffectiveVertical: (_ctx: unknown, code: string | null, required: string) => code === required,
}));

import { runDataOnboardingImport, type DataOnboardingImportConfig } from "./run-data-onboarding-import";
import { ORG_A, ORG_B, ORG_D, DEDICATED_PROFILE_ID } from "../../runtime/organization-runtime-test-fixtures";

type Dry = { wouldCreate: number; blocked: number };
type Imp = { created: number };

const runMock = vi.fn();

function config(datasetKey: "gym_clients" | "gym_trainers" | "categories"): DataOnboardingImportConfig<Dry, Imp> {
  return {
    datasetKey,
    phase:                  "GYM-ONBOARDING",
    datasetLabel:           "test",
    baseConfirmationText:   datasetKey === "gym_clients" ? "IMPORT GYM CLIENTS" : datasetKey === "gym_trainers" ? "IMPORT GYM TRAINERS" : "IMPORT CATEGORIES",
    analysisErrorMessage:   (n) => `analysis-errors:${n}`,
    nonCreateMessage:       (n) => `non-create:${n}`,
    unexpectedErrorMessage: "unexpected",
    run:                    (args) => runMock(args),
    buildLogMetadata:       (imp) => ({ created: imp.created }),
    created:                (imp) => imp.created,
  };
}

function form(datasetKey: string, fields: Record<string, string>) {
  const fd = new FormData();
  fd.set("datasetKey", datasetKey);
  fd.set("importPolicy", "CREATE_ONLY");
  fd.set("file", new File([new Uint8Array([1, 2, 3])], "datos.xlsx"));
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  overRowLimit = false;
  enabledModules = ["gym.trainers", "gym.classes", "commerce.products"];
  verticalByTenant = { TENANT_A: "GYM", TENANT_B: null, TENANT_D: "GYM" };
  withTemporaryPrismaClientMock.mockImplementation((_url: string, cb: (c: unknown) => unknown) => cb({ fake: "client" }));
  analyzerMock.mockImplementation(async () => ({ status: "READY", rows: [{ rowNumber: 2, resolution: "CREATE" }], summary: {} }));
  runMock.mockImplementation(async ({ isDryRun }: { isDryRun: boolean }) => (isDryRun ? { wouldCreate: 1, blocked: 0 } : { created: 1 }));
});

describe("gate de vertical GYM", () => {
  it("organización Commerce-only (sin vertical GYM) → bloqueada antes de analizar o escribir", async () => {
    for (const key of ["gym_clients", "gym_trainers"] as const) {
      const result = await runDataOnboardingImport(form(key, { organizationId: ORG_B.id, mode: "DRY_RUN" }), config(key));
      expect(result).toMatchObject({ success: false, blocked: true });
      if (!result.success) expect(result.error).toContain("vertical GYM");
    }
    expect(analyzerMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("gym_trainers sin gym.trainers → bloqueado en cualquier ambiente", async () => {
    enabledModules = ["gym.classes"];
    const shared = await runDataOnboardingImport(form("gym_trainers", { organizationId: ORG_A.id, mode: "DRY_RUN" }), config("gym_trainers"));
    const dedicated = await runDataOnboardingImport(
      form("gym_trainers", { organizationId: ORG_D.id, profileId: DEDICATED_PROFILE_ID, mode: "DRY_RUN" }),
      config("gym_trainers"),
    );
    for (const r of [shared, dedicated]) {
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error).toContain("gym.trainers");
    }
    expect(runMock).not.toHaveBeenCalled();
  });

  it("gym_clients no exige un module code ficticio: con vertical GYM y sin módulos GYM → permitido", async () => {
    enabledModules = [];
    const result = await runDataOnboardingImport(form("gym_clients", { organizationId: ORG_A.id, mode: "DRY_RUN" }), config("gym_clients"));
    expect(result.success).toBe(true);
    expect(analyzerMock.mock.calls[0][0]).toMatchObject({ gymOptions: { classesModuleEnabled: false } });
  });

  it("analizador recibe gymOptions con gym.classes resuelto server-side", async () => {
    await runDataOnboardingImport(form("gym_clients", { organizationId: ORG_A.id, mode: "DRY_RUN" }), config("gym_clients"));
    expect(analyzerMock.mock.calls[0][0]).toMatchObject({ tenantId: "TENANT_A", gymOptions: { classesModuleEnabled: true } });
  });

  it("archivo que excede el máximo (5,000) → rechazado sin analizar (sin import parcial)", async () => {
    overRowLimit = true;
    const result = await runDataOnboardingImport(form("gym_clients", { organizationId: ORG_A.id, mode: "DRY_RUN" }), config("gym_clients"));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("5,000");
    expect(analyzerMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });
});

describe("Shared PRODUCTION (organización GYM A)", () => {
  it("DRY_RUN permitido; runner con tenant A aunque el navegador envíe otro tenant", async () => {
    const result = await runDataOnboardingImport(
      form("gym_clients", { organizationId: ORG_A.id, mode: "DRY_RUN", tenantId: "TENANT_B" }),
      config("gym_clients"),
    );
    expect(result.success).toBe(true);
    expect(runMock.mock.calls[0][0]).toMatchObject({ tenantId: "TENANT_A", isDryRun: true });
    expect(logCreateMock).not.toHaveBeenCalled();
  });

  it("EXECUTE con el texto base (sin organization.code) → bloqueado", async () => {
    const result = await runDataOnboardingImport(
      form("gym_clients", { organizationId: ORG_A.id, mode: "EXECUTE", confirmationText: "IMPORT GYM CLIENTS" }),
      config("gym_clients"),
    );
    expect(result).toMatchObject({ success: false, blocked: true });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("EXECUTE con filas no-CREATE → bloqueado", async () => {
    analyzerMock.mockImplementation(async () => ({ status: "BLOCKED", rows: [{ rowNumber: 2, resolution: "ERROR" }], summary: {} }));
    const result = await runDataOnboardingImport(
      form("gym_trainers", { organizationId: ORG_A.id, mode: "EXECUTE", confirmationText: `IMPORT GYM TRAINERS ${ORG_A.code}` }),
      config("gym_trainers"),
    );
    expect(result).toMatchObject({ success: false, error: "analysis-errors:1" });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("EXECUTE correcto → runner tenant A + auditoría sin datos personales", async () => {
    const result = await runDataOnboardingImport(
      form("gym_clients", { organizationId: ORG_A.id, mode: "EXECUTE", confirmationText: `IMPORT GYM CLIENTS ${ORG_A.code}` }),
      config("gym_clients"),
    );
    expect(result).toMatchObject({ success: true, mode: "EXECUTE" });
    expect(runMock.mock.calls[0][0]).toMatchObject({ tenantId: "TENANT_A", isDryRun: false });
    const log = logCreateMock.mock.calls[0][0].data;
    expect(log.organization_id).toBe(ORG_A.id);
    expect(log.action).toBe("RUN_IMPORT");
    expect(log.metadata).toMatchObject({
      datasetKey: "gym_clients", tenantId: "TENANT_A", runtimeKind: "SHARED", environment: "PRODUCTION",
      importPolicy: "CREATE_ONLY", executedByUserId: "super-1", created: 1,
    });
    const serialized = JSON.stringify(log);
    expect(serialized).not.toContain("root@zolvi.test");
    expect(serialized).not.toContain("fake-password");
  });
});

describe("Dedicated (organización GYM D, SANDBOX)", () => {
  it("profileId fijado + confirmación base → EXECUTE con tenant D", async () => {
    const result = await runDataOnboardingImport(
      form("gym_trainers", { organizationId: ORG_D.id, profileId: DEDICATED_PROFILE_ID, mode: "EXECUTE", confirmationText: "IMPORT GYM TRAINERS" }),
      config("gym_trainers"),
    );
    expect(result).toMatchObject({ success: true, mode: "EXECUTE", profileLabel: "TRUST ME" });
    expect(runMock.mock.calls[0][0]).toMatchObject({ tenantId: "TENANT_D", isDryRun: false });
  });

  it("perfil Dedicado fijado sobre organización Shared → rechazado", async () => {
    const result = await runDataOnboardingImport(
      form("gym_clients", { organizationId: ORG_A.id, profileId: DEDICATED_PROFILE_ID, mode: "DRY_RUN" }),
      config("gym_clients"),
    );
    expect(result.success).toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });
});

describe("regresión Commerce", () => {
  it("una organización Commerce-only sigue importando categorías (el gate GYM no aplica)", async () => {
    const result = await runDataOnboardingImport(form("categories", { organizationId: ORG_B.id, mode: "DRY_RUN" }), config("categories"));
    expect(result.success).toBe(true);
    expect(analyzerMock.mock.calls[0][0]).not.toHaveProperty("gymOptions");
  });
});
