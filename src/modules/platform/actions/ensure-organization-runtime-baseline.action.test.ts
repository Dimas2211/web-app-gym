// ─────────────────────────────────────────────────────────────────
// platform — ensure-organization-runtime-baseline.action.test.ts
//
// SHARED-OPS-PARITY-1 — reparación de baseline de una organización YA
// provisionada (Zolvi Commerce Pilot): resuelve org → tenant → runtime
// server-side, crea solo para ESE tenant, idempotente, deja log, nunca
// toca otros tenants de la misma Shared.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRuntimeDb, type InMemoryDb } from "../lib/provisioning/provisioning-test-harness";

vi.mock("@/lib/security/encryption", () => ({
  assertEncryptionAvailable: vi.fn(),
  decryptText: vi.fn().mockReturnValue("fake-password"),
}));

const logCreateMock = vi.fn();
vi.mock("@/lib/db/prisma", async () => {
  const { buildFakeControlPlane } = await import("../runtime/organization-runtime-test-fixtures");
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let sharedDb: InMemoryDb;
vi.mock("../lib/client-prisma", () => ({
  withTemporaryPrismaClient: (_url: string, cb: (c: unknown) => unknown) => cb(sharedDb.client),
}));

import { ensureOrganizationRuntimeBaselineAction } from "./ensure-organization-runtime-baseline.action";
import { ORG_A, ORG_NO_TENANT, SHARED_TARGET_ID } from "../runtime/organization-runtime-test-fixtures";

beforeEach(() => {
  logCreateMock.mockReset();
  sharedDb = createRuntimeDb();
  sharedDb.seed("runtimeTenant", { id: "TENANT_A", name: "A", slug: "a", status: "active" });
  sharedDb.seed("runtimeTenant", { id: "TENANT_B", name: "B", slug: "b", status: "active" });
});

describe("ensureOrganizationRuntimeBaselineAction", () => {
  it("crea el baseline SOLO para el tenant de la organización y lo registra", async () => {
    const result = await ensureOrganizationRuntimeBaselineAction(ORG_A.id);

    expect(result).toMatchObject({ success: true, tenantId: "TENANT_A", runtimeKind: "SHARED" });
    if (result.success) expect(result.created).toHaveLength(3);
    expect(sharedDb.count("taxRate", { tenant_id: "TENANT_A" })).toBe(1);
    expect(sharedDb.count("productCategory", { tenant_id: "TENANT_A" })).toBe(1);
    expect(sharedDb.count("tenantFiscalConfig", { tenant_id: "TENANT_A" })).toBe(1);
    expect(sharedDb.count("taxRate", { tenant_id: "TENANT_B" })).toBe(0);
    expect(sharedDb.count("productCategory", { tenant_id: "TENANT_B" })).toBe(0);

    const log = logCreateMock.mock.calls[0][0].data;
    expect(log).toMatchObject({ organization_id: ORG_A.id, action: "ENSURE_COMMERCE_BASELINE", status: "SUCCESS" });
    expect(log.metadata).toMatchObject({ tenantId: "TENANT_A", runtimeTargetId: SHARED_TARGET_ID });
  });

  it("segunda ejecución → alreadyExisting, sin duplicar", async () => {
    await ensureOrganizationRuntimeBaselineAction(ORG_A.id);
    const second = await ensureOrganizationRuntimeBaselineAction(ORG_A.id);
    expect(second).toMatchObject({ success: true, created: [] });
    expect(sharedDb.count("taxRate")).toBe(1);
    expect(sharedDb.count("productCategory")).toBe(1);
  });

  it("organización sin tenant → error, sin escrituras", async () => {
    const result = await ensureOrganizationRuntimeBaselineAction(ORG_NO_TENANT.id);
    expect(result.success).toBe(false);
    expect(sharedDb.count("taxRate")).toBe(0);
  });

  it("el Shared Target id no sirve como organización", async () => {
    const result = await ensureOrganizationRuntimeBaselineAction(SHARED_TARGET_ID);
    expect(result.success).toBe(false);
    expect(sharedDb.count("taxRate")).toBe(0);
  });
});
