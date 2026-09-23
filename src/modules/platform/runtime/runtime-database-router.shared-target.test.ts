// ─────────────────────────────────────────────────────────────────
// platform/runtime — runtime-database-router.shared-target.test.ts
//
// SHARED-PILOT-4A / Gap B. Cubre:
// - Dedicated regression: organización sin shared_runtime_target_id
//   sigue resolviendo por PlatformDatabaseProfile (comportamiento
//   histórico sin cambios).
// - Shared: organización con shared_runtime_target_id resuelve por
//   PlatformSharedRuntimeTarget, ignorando PlatformDatabaseProfile.
// - Shared target inactivo/inexistente → fail closed.
// - withRuntimePrismaForProvisioning converge en el mismo mecanismo
//   (Dedicated y Shared).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/security/encryption", () => ({
  assertEncryptionAvailable: vi.fn(),
  decryptText: vi.fn().mockReturnValue("fake-password"),
}));

const orgFindUniqueMock = vi.fn();
const profileFindManyMock = vi.fn();
const sharedTargetFindUniqueMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    platformOrganization:       { findUnique: (...a: unknown[]) => orgFindUniqueMock(...a) },
    platformDatabaseProfile:    { findMany:   (...a: unknown[]) => profileFindManyMock(...a) },
    platformSharedRuntimeTarget: { findUnique: (...a: unknown[]) => sharedTargetFindUniqueMock(...a) },
  },
}));

const withTemporaryPrismaClientMock = vi.fn();
vi.mock("../lib/client-prisma", () => ({
  withTemporaryPrismaClient: (...args: unknown[]) => withTemporaryPrismaClientMock(...args),
}));

import {
  resolveRuntimeDatabaseProfileForOrganization,
  withRuntimePrismaForProvisioning,
  ActiveProfileNotFoundError,
  SharedRuntimeTargetNotFoundError,
  SharedRuntimeTargetInactiveError,
} from "./runtime-database-router";

const DEDICATED_PROFILE_ROW = {
  id: "profile-1", label: "Dedicated Prod", environment: "PRODUCTION", provider: "POSTGRESQL",
  db_host: "dedicated-host", db_port: 5432, db_name: "db1", db_user: "u1",
  encrypted_password: "enc1", ssl_mode: "REQUIRE", is_active: true, updated_at: new Date(),
};

const SHARED_TARGET_ROW = {
  id: "target-1", label: "Zolvi Shared 01", environment: "PRODUCTION", provider: "SUPABASE",
  db_host: "shared-host", db_port: 5432, db_name: "shared-db", db_user: "shared-user",
  encrypted_password: "enc-shared", ssl_mode: "REQUIRE", is_active: true, updated_at: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  withTemporaryPrismaClientMock.mockImplementation((_url: string, cb: (c: unknown) => unknown) => cb({}));
});

describe("resolveRuntimeDatabaseProfileForOrganization — Dedicated regression", () => {
  it("organización SIN shared_runtime_target_id resuelve por PlatformDatabaseProfile (sin cambios)", async () => {
    orgFindUniqueMock.mockResolvedValue({
      id: "org-1", name: "Cliente Dedicated", tenant_id: "tenant-1", shared_runtime_target_id: null,
    });
    profileFindManyMock.mockResolvedValue([DEDICATED_PROFILE_ROW]);

    const profile = await resolveRuntimeDatabaseProfileForOrganization("org-1");

    expect(profile.id).toBe("profile-1");
    expect(sharedTargetFindUniqueMock).not.toHaveBeenCalled();
  });

  it("sin shared_runtime_target_id y sin perfil activo → ActiveProfileNotFoundError", async () => {
    orgFindUniqueMock.mockResolvedValue({
      id: "org-1", name: "Cliente Dedicated", tenant_id: "tenant-1", shared_runtime_target_id: null,
    });
    profileFindManyMock.mockResolvedValue([]);

    await expect(resolveRuntimeDatabaseProfileForOrganization("org-1")).rejects.toThrow(
      ActiveProfileNotFoundError,
    );
  });
});

describe("resolveRuntimeDatabaseProfileForOrganization — Shared Runtime", () => {
  it("organización CON shared_runtime_target_id resuelve por PlatformSharedRuntimeTarget, ignorando PlatformDatabaseProfile", async () => {
    orgFindUniqueMock.mockResolvedValue({
      id: "org-2", name: "Cliente Shared", tenant_id: "tenant-2", shared_runtime_target_id: "target-1",
    });
    sharedTargetFindUniqueMock.mockResolvedValue(SHARED_TARGET_ROW);

    const profile = await resolveRuntimeDatabaseProfileForOrganization("org-2");

    expect(profile.id).toBe("target-1");
    expect(profile.tenantId).toBe("tenant-2");
    expect(profileFindManyMock).not.toHaveBeenCalled(); // nunca consulta Dedicated si hay Shared
  });

  it("target inexistente → SharedRuntimeTargetNotFoundError", async () => {
    orgFindUniqueMock.mockResolvedValue({
      id: "org-2", name: "Cliente Shared", tenant_id: "tenant-2", shared_runtime_target_id: "target-ghost",
    });
    sharedTargetFindUniqueMock.mockResolvedValue(null);

    await expect(resolveRuntimeDatabaseProfileForOrganization("org-2")).rejects.toThrow(
      SharedRuntimeTargetNotFoundError,
    );
  });

  it("target inactivo → SharedRuntimeTargetInactiveError (fail closed, aunque la org ya esté vinculada)", async () => {
    orgFindUniqueMock.mockResolvedValue({
      id: "org-2", name: "Cliente Shared", tenant_id: "tenant-2", shared_runtime_target_id: "target-1",
    });
    sharedTargetFindUniqueMock.mockResolvedValue({ ...SHARED_TARGET_ROW, is_active: false });

    await expect(resolveRuntimeDatabaseProfileForOrganization("org-2")).rejects.toThrow(
      SharedRuntimeTargetInactiveError,
    );
  });
});

describe("withRuntimePrismaForProvisioning — converge Dedicated y Shared en el mismo mecanismo", () => {
  it("organización con shared_runtime_target_id usa el target incluso SIN tenant_id (pre-binding)", async () => {
    orgFindUniqueMock.mockResolvedValue({ id: "org-3", shared_runtime_target_id: "target-1" });
    sharedTargetFindUniqueMock.mockResolvedValue(SHARED_TARGET_ROW);

    await withRuntimePrismaForProvisioning("org-3", async (_client, profileId) => {
      expect(profileId).toBe("target-1");
      return null;
    });

    expect(withTemporaryPrismaClientMock).toHaveBeenCalledTimes(1);
    expect(profileFindManyMock).not.toHaveBeenCalled();
  });

  it("organización sin shared_runtime_target_id cae al camino Dedicated (PlatformDatabaseProfile), también pre-binding", async () => {
    orgFindUniqueMock.mockResolvedValue({ id: "org-4", shared_runtime_target_id: null });
    profileFindManyMock.mockResolvedValue([DEDICATED_PROFILE_ROW]);

    await withRuntimePrismaForProvisioning("org-4", async (_client, profileId) => {
      expect(profileId).toBe("profile-1");
      return null;
    });

    expect(sharedTargetFindUniqueMock).not.toHaveBeenCalled();
  });
});
