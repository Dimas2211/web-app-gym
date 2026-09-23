// ─────────────────────────────────────────────────────────────────
// platform/runtime — authenticate-runtime-user.test.ts
//
// FASE VI-C — ETAPA V. Mocks de withOrganizationRuntimePrisma — sin
// remote DB, sin passwords reales (hash bcrypt sintético).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const withOrganizationRuntimePrismaMock = vi.fn();

vi.mock("./runtime-database-router", () => ({
  withOrganizationRuntimePrisma: (...args: unknown[]) =>
    withOrganizationRuntimePrismaMock(...args),
}));

import {
  authenticateRuntimeUser,
  RuntimeAuthError,
  type RuntimeUserQueryClient,
} from "./authenticate-runtime-user";
import {
  ActiveProfileNotFoundError,
  RuntimeDatabaseUnreachableError,
} from "./runtime-database-router.errors";

const ORG = { id: "org-1", tenantId: "tenant-a" };
const SYNTHETIC_PASSWORD = "correct-horse-battery-staple";
let SYNTHETIC_HASH: string;

function fakeRuntimeUser(overrides: Partial<{
  status: string;
  tenant_id: string;
  password_hash: string;
}> = {}) {
  return {
    id: "user-1",
    email: "same@example.com",
    first_name: "Ana",
    last_name: "Pérez",
    role: "branch_admin",
    status: "active",
    password_hash: SYNTHETIC_HASH,
    tenant_id: "tenant-a",
    branch_id: "branch-1",
    ...overrides,
  };
}

function fakeClient(user: ReturnType<typeof fakeRuntimeUser> | null): RuntimeUserQueryClient {
  return { user: { findUnique: vi.fn().mockResolvedValue(user) } };
}

beforeEach(async () => {
  vi.clearAllMocks();
  SYNTHETIC_HASH = await bcrypt.hash(SYNTHETIC_PASSWORD, 4);
});

describe("authenticateRuntimeUser", () => {
  it("credenciales válidas → retorna identidad runtime con tenantId/locationId", async () => {
    const client = fakeClient(fakeRuntimeUser());
    withOrganizationRuntimePrismaMock.mockImplementation((_orgId, cb) => cb(client));

    const result = await authenticateRuntimeUser({
      organization: ORG,
      email: "same@example.com",
      password: SYNTHETIC_PASSWORD,
    });

    expect(result).toEqual({
      id: "user-1",
      email: "same@example.com",
      name: "Ana Pérez",
      role: "branch_admin",
      tenantId: "tenant-a",
      locationId: "branch-1",
    });
  });

  it("usuario inexistente → RUNTIME_USER_NOT_FOUND", async () => {
    const client = fakeClient(null);
    withOrganizationRuntimePrismaMock.mockImplementation((_orgId, cb) => cb(client));

    await expect(
      authenticateRuntimeUser({ organization: ORG, email: "nope@example.com", password: "x" }),
    ).rejects.toMatchObject({ code: "RUNTIME_USER_NOT_FOUND" });
  });

  it("usuario inactivo → RUNTIME_USER_INACTIVE", async () => {
    const client = fakeClient(fakeRuntimeUser({ status: "inactive" }));
    withOrganizationRuntimePrismaMock.mockImplementation((_orgId, cb) => cb(client));

    await expect(
      authenticateRuntimeUser({ organization: ORG, email: "same@example.com", password: SYNTHETIC_PASSWORD }),
    ).rejects.toMatchObject({ code: "RUNTIME_USER_INACTIVE" });
  });

  it("password incorrecta → RUNTIME_PASSWORD_INVALID", async () => {
    const client = fakeClient(fakeRuntimeUser());
    withOrganizationRuntimePrismaMock.mockImplementation((_orgId, cb) => cb(client));

    await expect(
      authenticateRuntimeUser({ organization: ORG, email: "same@example.com", password: "wrong-password" }),
    ).rejects.toMatchObject({ code: "RUNTIME_PASSWORD_INVALID" });
  });

  it("tenant del usuario runtime no coincide con organization.tenantId → RUNTIME_TENANT_MISMATCH", async () => {
    const client = fakeClient(fakeRuntimeUser({ tenant_id: "tenant-OTHER" }));
    withOrganizationRuntimePrismaMock.mockImplementation((_orgId, cb) => cb(client));

    await expect(
      authenticateRuntimeUser({ organization: ORG, email: "same@example.com", password: SYNTHETIC_PASSWORD }),
    ).rejects.toMatchObject({ code: "RUNTIME_TENANT_MISMATCH" });
  });

  it("perfil runtime inexistente/inactivo → RUNTIME_PROFILE_MISSING (nunca fallback global)", async () => {
    withOrganizationRuntimePrismaMock.mockRejectedValue(new ActiveProfileNotFoundError(ORG.id));

    await expect(
      authenticateRuntimeUser({ organization: ORG, email: "same@example.com", password: SYNTHETIC_PASSWORD }),
    ).rejects.toMatchObject({ code: "RUNTIME_PROFILE_MISSING" });
  });

  it("base runtime inalcanzable → RUNTIME_DB_UNAVAILABLE (nunca fallback global)", async () => {
    withOrganizationRuntimePrismaMock.mockRejectedValue(
      new RuntimeDatabaseUnreachableError("profile-1", "connection refused"),
    );

    await expect(
      authenticateRuntimeUser({ organization: ORG, email: "same@example.com", password: SYNTHETIC_PASSWORD }),
    ).rejects.toMatchObject({ code: "RUNTIME_DB_UNAVAILABLE" });
  });

  it("errores lanzados son instancia de RuntimeAuthError", async () => {
    const client = fakeClient(null);
    withOrganizationRuntimePrismaMock.mockImplementation((_orgId, cb) => cb(client));

    await expect(
      authenticateRuntimeUser({ organization: ORG, email: "nope@example.com", password: "x" }),
    ).rejects.toBeInstanceOf(RuntimeAuthError);
  });

  it("same-email isolation: mismo email en dos organizaciones distintas se busca solo en la base de la organización objetivo", async () => {
    const clientA = fakeClient(fakeRuntimeUser({ tenant_id: "tenant-a" }));
    const clientB = fakeClient(fakeRuntimeUser({ tenant_id: "tenant-b", password_hash: await bcrypt.hash("password-b", 4) }));

    withOrganizationRuntimePrismaMock.mockImplementation((orgId: string, cb: (c: RuntimeUserQueryClient) => unknown) =>
      cb(orgId === "org-a" ? clientA : clientB),
    );

    const resultA = await authenticateRuntimeUser({
      organization: { id: "org-a", tenantId: "tenant-a" },
      email: "same@example.com",
      password: SYNTHETIC_PASSWORD,
    });
    expect(resultA.tenantId).toBe("tenant-a");

    // La password de A no autentica en B.
    await expect(
      authenticateRuntimeUser({
        organization: { id: "org-b", tenantId: "tenant-b" },
        email: "same@example.com",
        password: SYNTHETIC_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "RUNTIME_PASSWORD_INVALID" });

    // La password correcta de B sí autentica en B.
    const resultB = await authenticateRuntimeUser({
      organization: { id: "org-b", tenantId: "tenant-b" },
      email: "same@example.com",
      password: "password-b",
    });
    expect(resultB.tenantId).toBe("tenant-b");
  });

  it("SHARED-PILOT-4A / Gap G: la query usa el compound key tenant_id_email, no email global", async () => {
    const client = fakeClient(fakeRuntimeUser());
    withOrganizationRuntimePrismaMock.mockImplementation((_orgId, cb) => cb(client));

    await authenticateRuntimeUser({ organization: ORG, email: "same@example.com", password: SYNTHETIC_PASSWORD });

    expect(client.user.findUnique).toHaveBeenCalledWith({
      where: { tenant_id_email: { tenant_id: ORG.tenantId, email: "same@example.com" } },
    });
  });
});
