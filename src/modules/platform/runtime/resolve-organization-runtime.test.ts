// ─────────────────────────────────────────────────────────────────
// platform/runtime — resolve-organization-runtime.test.ts
//
// SHARED-OPS-PARITY-1 — Router / operaciones organization-scoped
// (Runtime Router REAL + Control Plane sintético):
//   A. Org Shared → Shared Target → tenant correcto.
//   B. Org Dedicated → perfil Dedicated → tenant correcto.
//   C. Target con 2 orgs: misma conexión física, distinto tenantId.
//   E. targetId no sirve como identidad tenant.
//   + perfil Dedicated fijado: debe pertenecer a la org; nunca en Shared.
//   + header nunca contiene password/URL.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/security/encryption", () => ({
  assertEncryptionAvailable: vi.fn(),
  decryptText: vi.fn().mockReturnValue("fake-password"),
}));

vi.mock("@/lib/db/prisma", async () => {
  const { buildFakeControlPlane } = await import("./organization-runtime-test-fixtures");
  return { prisma: buildFakeControlPlane() };
});

import {
  resolveOrganizationRuntime,
  OrganizationRuntimeMismatchError,
} from "./resolve-organization-runtime";
import { getRuntimeDatabaseUrlFromProfile, OrganizationNotFoundError, OrganizationWithoutTenantError } from "./runtime-database-router";
import {
  ORG_A, ORG_B, ORG_D, ORG_NO_TENANT, SHARED_TARGET_ID, DEDICATED_PROFILE_ID,
} from "./organization-runtime-test-fixtures";

describe("resolveOrganizationRuntime", () => {
  it("A — organización Shared → Shared Target → tenant de la organización", async () => {
    const { header, profile } = await resolveOrganizationRuntime({ organizationId: ORG_A.id });
    expect(header.runtimeKind).toBe("SHARED");
    expect(header.runtimeTargetId).toBe(SHARED_TARGET_ID);
    expect(header.tenantId).toBe("TENANT_A");
    expect(header.organizationCode).toBe(ORG_A.code);
    expect(header.environment).toBe("PRODUCTION");
    expect(profile.tenantId).toBe("TENANT_A");
    expect(header.pinnedProfileId).toBeNull();
  });

  it("B — organización Dedicated → perfil Dedicated → tenant de la organización", async () => {
    const { header, profile } = await resolveOrganizationRuntime({ organizationId: ORG_D.id });
    expect(header.runtimeKind).toBe("DEDICATED");
    expect(header.runtimeTargetId).toBe(DEDICATED_PROFILE_ID);
    expect(header.tenantId).toBe("TENANT_D");
    expect(profile.id).toBe(DEDICATED_PROFILE_ID);
  });

  it("C — mismo Shared Target: A y B resuelven la MISMA conexión física con distinto tenantId", async () => {
    const a = await resolveOrganizationRuntime({ organizationId: ORG_A.id });
    const b = await resolveOrganizationRuntime({ organizationId: ORG_B.id });

    expect(a.header.runtimeTargetId).toBe(b.header.runtimeTargetId);
    expect(getRuntimeDatabaseUrlFromProfile(a.profile)).toBe(getRuntimeDatabaseUrlFromProfile(b.profile));
    expect(a.header.tenantId).toBe("TENANT_A");
    expect(b.header.tenantId).toBe("TENANT_B");
  });

  it("E — un Shared Target id NO identifica un tenant (no es organizationId ni profileId válido)", async () => {
    await expect(
      resolveOrganizationRuntime({ organizationId: SHARED_TARGET_ID }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
    await expect(
      resolveOrganizationRuntime({ profileId: SHARED_TARGET_ID }),
    ).rejects.toThrow();
  });

  it("organización sin tenant_id → fail closed", async () => {
    await expect(
      resolveOrganizationRuntime({ organizationId: ORG_NO_TENANT.id }),
    ).rejects.toBeInstanceOf(OrganizationWithoutTenantError);
  });

  it("link histórico Dedicated: perfil fijado resuelve su organización y tenant", async () => {
    const { header } = await resolveOrganizationRuntime({ profileId: DEDICATED_PROFILE_ID });
    expect(header.organizationId).toBe(ORG_D.id);
    expect(header.tenantId).toBe("TENANT_D");
    expect(header.pinnedProfileId).toBe(DEDICATED_PROFILE_ID);
  });

  it("perfil Dedicated de OTRA organización → mismatch, no resuelve", async () => {
    await expect(
      resolveOrganizationRuntime({ organizationId: ORG_A.id, profileId: DEDICATED_PROFILE_ID }),
    ).rejects.toBeInstanceOf(OrganizationRuntimeMismatchError);
  });

  it("sin organizationId ni profileId → error", async () => {
    await expect(resolveOrganizationRuntime({})).rejects.toBeInstanceOf(OrganizationRuntimeMismatchError);
  });

  it("el header es metadata segura: sin password ni DATABASE_URL", async () => {
    const { header } = await resolveOrganizationRuntime({ organizationId: ORG_A.id });
    const serialized = JSON.stringify(header);
    expect(serialized).not.toContain("enc-shared");
    expect(serialized).not.toContain("fake-password");
    expect(serialized).not.toContain("postgresql://");
    expect(Object.keys(header)).not.toContain("encrypted_password");
  });
});
