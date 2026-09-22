// ─────────────────────────────────────────────────────────────────
// platform/actions — detect-database-profile-tenant.action.test.ts
//
// SHARED-PILOT-1 — GAP 2. Una organización ya vinculada a un tenant
// (Shared DB con múltiples tenants físicos) debe resolver ALREADY_BOUND
// aunque la base física tenga más de un tenant. Fail closed si el
// tenant vinculado no existe físicamente — nunca auto-seleccionar otro.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn().mockResolvedValue({ id: "admin-1", role: "super_admin" }),
}));

vi.mock("@/lib/security/encryption", () => ({
  assertEncryptionAvailable: vi.fn(),
}));

const findUniqueProfileMock = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    platformDatabaseProfile: {
      findUnique: (...args: unknown[]) => findUniqueProfileMock(...args),
    },
  },
}));

vi.mock("../lib/database-profile-url", () => ({
  buildDatabaseUrlFromProfile: vi.fn().mockReturnValue("postgresql://fake"),
  sanitizeDatabaseError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const withTemporaryPrismaClientMock = vi.fn();
vi.mock("../lib/client-prisma", () => ({
  withTemporaryPrismaClient: (...args: unknown[]) => withTemporaryPrismaClientMock(...args),
}));

const detectTenantsFromClientDatabaseMock = vi.fn();
vi.mock("../lib/tenant-binding/tenant-discovery", () => ({
  detectTenantsFromClientDatabase: (...args: unknown[]) =>
    detectTenantsFromClientDatabaseMock(...args),
}));

import { detectDatabaseProfileTenantAction } from "./detect-database-profile-tenant.action";

const TENANT_A = { id: "tenant-a", name: "Cliente 3", slug: "cliente-3", status: "active" };
const TENANT_B = { id: "tenant-b", name: "Sentinel", slug: "sentinel", status: "active" };

function mockProfile(organizationTenantId: string | null) {
  findUniqueProfileMock.mockResolvedValue({
    id: "profile-1",
    label: "Perfil Shared",
    db_host: "host", db_port: 5432, db_name: "db", db_user: "user",
    encrypted_password: "enc", ssl_mode: "REQUIRE",
    organization: { id: "org-1", name: "Cliente 3", tenant_id: organizationTenantId },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  withTemporaryPrismaClientMock.mockImplementation((_url: string, cb: (c: unknown) => unknown) => cb({}));
});

describe("detectDatabaseProfileTenantAction — Shared DB tenant detection", () => {
  it("A y B existen, organization.tenant_id = A → ALREADY_BOUND con recommendedTenantId = A", async () => {
    mockProfile(TENANT_A.id);
    detectTenantsFromClientDatabaseMock.mockResolvedValue([TENANT_A, TENANT_B]);

    const result = await detectDatabaseProfileTenantAction("profile-1");

    expect(result.success).toBe(true);
    expect(result.status).toBe("ALREADY_BOUND");
    expect(result.recommendedTenantId).toBe(TENANT_A.id);
  });

  it("A y B existen, organization.tenant_id = null → MULTIPLE_TENANTS_DETECTED sin recomendación automática", async () => {
    mockProfile(null);
    detectTenantsFromClientDatabaseMock.mockResolvedValue([TENANT_A, TENANT_B]);

    const result = await detectDatabaseProfileTenantAction("profile-1");

    expect(result.status).toBe("MULTIPLE_TENANTS_DETECTED");
    expect(result.recommendedTenantId).toBeNull();
  });

  it("DB contiene A/B pero organization.tenant_id = C (no existe físicamente) → fail closed, nunca autoselecciona A/B", async () => {
    mockProfile("tenant-c");
    detectTenantsFromClientDatabaseMock.mockResolvedValue([TENANT_A, TENANT_B]);

    const result = await detectDatabaseProfileTenantAction("profile-1");

    expect(result.status).not.toBe("ALREADY_BOUND");
    expect(result.recommendedTenantId).toBeNull();
    expect(result.warnings.some((w) => w.includes("tenant-c"))).toBe(true);
  });

  it("único tenant activo detectado, sin binding previo → SINGLE_TENANT_DETECTED (comportamiento preexistente)", async () => {
    mockProfile(null);
    detectTenantsFromClientDatabaseMock.mockResolvedValue([TENANT_A]);

    const result = await detectDatabaseProfileTenantAction("profile-1");

    expect(result.status).toBe("SINGLE_TENANT_DETECTED");
    expect(result.recommendedTenantId).toBe(TENANT_A.id);
  });

  it("sin tenants detectados → NO_TENANTS_FOUND", async () => {
    mockProfile(null);
    detectTenantsFromClientDatabaseMock.mockResolvedValue([]);

    const result = await detectDatabaseProfileTenantAction("profile-1");

    expect(result.status).toBe("NO_TENANTS_FOUND");
    expect(result.recommendedTenantId).toBeNull();
  });
});
