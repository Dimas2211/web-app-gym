// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — run-data-onboarding-import.test.ts
//
// SHARED-OPS-PARITY-1 — pipeline de import organization-scoped y
// política de PRODUCTION. Usa el resolver y el Runtime Router REALES
// contra un Control Plane sintético (Shared PRODUCTION con orgs A y B +
// Dedicated SANDBOX). Parser/analizador/cliente runtime son stubs: aquí
// se prueba la decisión y el tenantId que llega al runner, nunca se
// conecta a una base real.
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
  requireSuperAdmin: vi.fn(async () => ({ id: "super-1", role: "super_admin" })),
}));

const withTemporaryPrismaClientMock = vi.fn();
vi.mock("../client-prisma", () => ({
  withTemporaryPrismaClient: (...a: unknown[]) => withTemporaryPrismaClientMock(...a),
}));

vi.mock("./excel-preview-parser", () => ({
  parseDataOnboardingWorkbook: () => ({
    datasetKey: "x", status: "VALID", columns: [], rows: [],
    summary: { totalRows: 1, validRows: 1, invalidRows: 0, warningRows: 0, emptyRowsIgnored: 0 },
  }),
}));

let analysisRows: Array<{ resolution: string }> = [];
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

import { runDataOnboardingImport, type DataOnboardingImportConfig } from "./run-data-onboarding-import";
import {
  ORG_A, ORG_B, ORG_D, DEDICATED_PROFILE_ID, SHARED_TARGET_ID,
} from "../../runtime/organization-runtime-test-fixtures";

type Dry = { wouldCreate: number; blocked: number };
type Imp = { created: number };

const runMock = vi.fn();

function config(datasetKey: DataOnboardingImportConfig<Dry, Imp>["datasetKey"] = "categories"): DataOnboardingImportConfig<Dry, Imp> {
  return {
    datasetKey,
    phase:                  "E1C-X",
    datasetLabel:           "test",
    baseConfirmationText:   datasetKey === "products" ? "IMPORT PRODUCTS" : "IMPORT CATEGORIES",
    analysisErrorMessage:   (n) => `analysis-errors:${n}`,
    nonCreateMessage:       (n) => `non-create:${n}`,
    unexpectedErrorMessage: "unexpected",
    run:                    (args) => runMock(args),
    buildLogMetadata:       (imp) => ({ created: imp.created }),
    created:                (imp) => imp.created,
  };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  fd.set("datasetKey", "categories");
  fd.set("importPolicy", "CREATE_ONLY");
  fd.set("file", new File([new Uint8Array([1, 2, 3])], "datos.xlsx"));
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  analysisRows = [{ resolution: "CREATE" }, { resolution: "CREATE" }];
  enabledModules = ["commerce.products", "commerce.suppliers", "commerce.inventory", "core.customers"];
  withTemporaryPrismaClientMock.mockImplementation((_url: string, cb: (c: unknown) => unknown) => cb({ fake: "client" }));
  analyzerMock.mockImplementation(async () => ({ status: "READY", rows: analysisRows, summary: {} }));
  runMock.mockImplementation(async ({ isDryRun }: { isDryRun: boolean }) =>
    isDryRun ? { wouldCreate: 2, blocked: 0 } : { created: 2 });
});

describe("PRODUCTION — Shared (Zolvi Shared 01)", () => {
  it("DRY_RUN permitido bajo guardas; runner recibe tenant A server-side", async () => {
    const result = await runDataOnboardingImport(form({ organizationId: ORG_A.id, mode: "DRY_RUN" }), config());

    expect(result.success).toBe(true);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][0]).toMatchObject({ tenantId: "TENANT_A", isDryRun: true });
    expect(analyzerMock.mock.calls[0][0]).toMatchObject({ tenantId: "TENANT_A" });
    expect(logCreateMock).not.toHaveBeenCalled();
  });

  it("EXECUTE sin confirmación → bloqueado, runner no se ejecuta", async () => {
    const result = await runDataOnboardingImport(form({ organizationId: ORG_A.id, mode: "EXECUTE" }), config());
    expect(result).toMatchObject({ success: false, blocked: true });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("EXECUTE con el texto histórico (sin código de organización) → bloqueado", async () => {
    const result = await runDataOnboardingImport(
      form({ organizationId: ORG_A.id, mode: "EXECUTE", confirmationText: "IMPORT CATEGORIES" }),
      config(),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain(`IMPORT CATEGORIES ${ORG_A.code}`);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("EXECUTE con organización incorrecta en la confirmación → bloqueado", async () => {
    const result = await runDataOnboardingImport(
      form({ organizationId: ORG_A.id, mode: "EXECUTE", confirmationText: `IMPORT CATEGORIES ${ORG_B.code}` }),
      config(),
    );
    expect(result).toMatchObject({ success: false, blocked: true });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("EXECUTE con errores de análisis → bloqueado", async () => {
    analysisRows = [{ resolution: "CREATE" }, { resolution: "ERROR" }];
    const result = await runDataOnboardingImport(
      form({ organizationId: ORG_A.id, mode: "EXECUTE", confirmationText: `IMPORT CATEGORIES ${ORG_A.code}` }),
      config(),
    );
    expect(result).toMatchObject({ success: false, error: "analysis-errors:1" });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("EXECUTE con filas no-CREATE (ya existentes) → bloqueado", async () => {
    analysisRows = [{ resolution: "CREATE" }, { resolution: "SKIP" }];
    const result = await runDataOnboardingImport(
      form({ organizationId: ORG_A.id, mode: "EXECUTE", confirmationText: `IMPORT CATEGORIES ${ORG_A.code}` }),
      config(),
    );
    expect(result).toMatchObject({ success: false, error: "non-create:1" });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("EXECUTE con módulo no habilitado → bloqueado", async () => {
    enabledModules = ["commerce.suppliers"];
    const result = await runDataOnboardingImport(
      form({ organizationId: ORG_A.id, mode: "EXECUTE", confirmationText: `IMPORT CATEGORIES ${ORG_A.code}` }),
      config(),
    );
    expect(result).toMatchObject({ success: false, blocked: true });
    if (!result.success) expect(result.error).toContain("módulo");
    expect(runMock).not.toHaveBeenCalled();
  });

  it("importPolicy distinta de CREATE_ONLY → bloqueado antes de conectar", async () => {
    const fd = form({ organizationId: ORG_A.id, mode: "EXECUTE", confirmationText: `IMPORT CATEGORIES ${ORG_A.code}` });
    fd.set("importPolicy", "UPSERT");
    const result = await runDataOnboardingImport(fd, config());
    expect(result.success).toBe(false);
    expect(analyzerMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("EXECUTE correcto → runner con tenant A, log en la organización A", async () => {
    const result = await runDataOnboardingImport(
      form({ organizationId: ORG_A.id, mode: "EXECUTE", confirmationText: `IMPORT CATEGORIES ${ORG_A.code}` }),
      config(),
    );

    expect(result).toMatchObject({ success: true, mode: "EXECUTE", profileLabel: "Zolvi Shared 01" });
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][0]).toMatchObject({ tenantId: "TENANT_A", isDryRun: false });
    expect(logCreateMock).toHaveBeenCalledTimes(1);
    const log = logCreateMock.mock.calls[0][0].data;
    expect(log.organization_id).toBe(ORG_A.id);
    expect(log.metadata).toMatchObject({
      tenantId: "TENANT_A", runtimeKind: "SHARED", runtimeTargetId: SHARED_TARGET_ID, environment: "PRODUCTION",
    });
    expect(JSON.stringify(log)).not.toContain("fake-password");
  });

  it("tenantId/sharedRuntimeTargetId enviados por el navegador se ignoran", async () => {
    const result = await runDataOnboardingImport(
      form({
        organizationId: ORG_A.id,
        mode: "DRY_RUN",
        tenantId: "TENANT_B",
        sharedRuntimeTargetId: "otro",
        host: "evil-host",
      }),
      config(),
    );
    expect(result.success).toBe(true);
    expect(runMock.mock.calls[0][0].tenantId).toBe("TENANT_A");
  });

  it("organizationId de B → runner con tenant B (nunca A)", async () => {
    await runDataOnboardingImport(form({ organizationId: ORG_B.id, mode: "DRY_RUN" }), config());
    expect(runMock.mock.calls[0][0].tenantId).toBe("TENANT_B");
  });

  it("perfil Dedicated fijado sobre una organización Shared → rechazado", async () => {
    const result = await runDataOnboardingImport(
      form({ organizationId: ORG_A.id, profileId: DEDICATED_PROFILE_ID, mode: "DRY_RUN" }),
      config(),
    );
    expect(result.success).toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("sin organizationId → error", async () => {
    const result = await runDataOnboardingImport(form({ mode: "DRY_RUN" }), config());
    expect(result).toMatchObject({ success: false, error: "organizationId requerido." });
  });
});

describe("Dedicated — regresión (SANDBOX, link histórico por perfil)", () => {
  it("profileId histórico + confirmación histórica → EXECUTE con tenant D", async () => {
    const result = await runDataOnboardingImport(
      form({ organizationId: ORG_D.id, profileId: DEDICATED_PROFILE_ID, mode: "EXECUTE", confirmationText: "IMPORT CATEGORIES" }),
      config(),
    );
    expect(result).toMatchObject({ success: true, mode: "EXECUTE", profileLabel: "TRUST ME" });
    expect(runMock.mock.calls[0][0]).toMatchObject({ tenantId: "TENANT_D", isDryRun: false });
  });

  it("solo profileId (cliente anterior) sigue resolviendo la organización dueña", async () => {
    const result = await runDataOnboardingImport(
      form({ profileId: DEDICATED_PROFILE_ID, mode: "DRY_RUN" }),
      config(),
    );
    expect(result.success).toBe(true);
    expect(runMock.mock.calls[0][0].tenantId).toBe("TENANT_D");
  });

  it("confirmación incorrecta → bloqueado (Safety Gate D0 sin cambios)", async () => {
    const result = await runDataOnboardingImport(
      form({ organizationId: ORG_D.id, mode: "EXECUTE", confirmationText: "IMPORT" }),
      config(),
    );
    expect(result.success).toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("productos sin commerce.products → bloqueado en cualquier ambiente (contrato E1C-D)", async () => {
    enabledModules = [];
    const fd = form({ organizationId: ORG_D.id, mode: "DRY_RUN" });
    fd.set("datasetKey", "products");
    const result = await runDataOnboardingImport(fd, config("products"));
    expect(result.success).toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });
});
