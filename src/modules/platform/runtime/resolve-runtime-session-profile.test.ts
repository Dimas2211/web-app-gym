// ─────────────────────────────────────────────────────────────────
// platform/runtime — resolve-runtime-session-profile.test.ts
//
// SHARED-OPS-PARITY-1. Sesión "Operar como cliente":
// - Dedicated (y sesiones previas sin runtimeKind) → por perfil (histórico).
// - Shared → re-resuelta por organizationId; tenant/target cambiado → fail closed.
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
  resolveRuntimeProfileForSession,
  RuntimeSessionTargetChangedError,
} from "./resolve-runtime-session-profile";
import { ProfileNotFoundError } from "./runtime-database-router";
import {
  ORG_A, ORG_D, SHARED_TARGET_ID, DEDICATED_PROFILE_ID,
} from "./organization-runtime-test-fixtures";

describe("resolveRuntimeProfileForSession", () => {
  it("sesión Shared → resuelve por organización (tenant A)", async () => {
    const profile = await resolveRuntimeProfileForSession({
      organizationId: ORG_A.id, profileId: SHARED_TARGET_ID, tenantId: "TENANT_A", runtimeKind: "SHARED",
    });
    expect(profile.id).toBe(SHARED_TARGET_ID);
    expect(profile.tenantId).toBe("TENANT_A");
  });

  it("sesión Shared con tenant distinto al de la organización → fail closed", async () => {
    await expect(
      resolveRuntimeProfileForSession({
        organizationId: ORG_A.id, profileId: SHARED_TARGET_ID, tenantId: "TENANT_B", runtimeKind: "SHARED",
      }),
    ).rejects.toBeInstanceOf(RuntimeSessionTargetChangedError);
  });

  it("sesión Shared cuyo target ya no es el de la organización → fail closed", async () => {
    await expect(
      resolveRuntimeProfileForSession({
        organizationId: ORG_A.id, profileId: "otro-target", tenantId: "TENANT_A", runtimeKind: "SHARED",
      }),
    ).rejects.toBeInstanceOf(RuntimeSessionTargetChangedError);
  });

  it("sesión Dedicated → por perfil (sin cambios)", async () => {
    const profile = await resolveRuntimeProfileForSession({
      organizationId: ORG_D.id, profileId: DEDICATED_PROFILE_ID, tenantId: "TENANT_D", runtimeKind: "DEDICATED",
    });
    expect(profile.tenantId).toBe("TENANT_D");
  });

  it("sesión previa sin runtimeKind → camino Dedicated histórico", async () => {
    const profile = await resolveRuntimeProfileForSession({
      organizationId: ORG_D.id, profileId: DEDICATED_PROFILE_ID, tenantId: "TENANT_D",
    });
    expect(profile.id).toBe(DEDICATED_PROFILE_ID);
    // y un target Shared nunca se resuelve como perfil por id
    await expect(
      resolveRuntimeProfileForSession({ organizationId: ORG_A.id, profileId: SHARED_TARGET_ID, tenantId: "TENANT_A" }),
    ).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});
