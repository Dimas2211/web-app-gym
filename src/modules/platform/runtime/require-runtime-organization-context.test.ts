// ─────────────────────────────────────────────────────────────────
// platform/runtime — require-runtime-organization-context.test.ts
//
// FASE VI-C — ETAPA Q. Certifica fail-closed: ninguna condición
// inválida retorna un contexto "normal"/global como sustituto.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

const resolveRuntimeDatabaseProfileForOrganizationMock = vi.fn();
const createRuntimePrismaClientMock = vi.fn();

vi.mock("./runtime-database-router", () => ({
  resolveRuntimeDatabaseProfileForOrganization: (...args: unknown[]) =>
    resolveRuntimeDatabaseProfileForOrganizationMock(...args),
  createRuntimePrismaClient: (...args: unknown[]) => createRuntimePrismaClientMock(...args),
}));

import {
  requireRuntimeOrganizationContext,
  RuntimeIdentityError,
  type OrganizationContextLookupClient,
} from "./require-runtime-organization-context";
import { ActiveProfileNotFoundError } from "./runtime-database-router.errors";
import type { CoreSessionUser } from "@/core/auth/types";

function baseUser(overrides: Partial<CoreSessionUser> = {}): Pick<
  CoreSessionUser,
  "auth_scope" | "organization_id" | "tenant_id" | "location_id"
> {
  return {
    auth_scope: "RUNTIME_CLIENT",
    organization_id: "org-1",
    tenant_id: "tenant-1",
    location_id: "branch-1",
    ...overrides,
  };
}

function fakeControlPlane(
  org: { id: string; name: string; tenant_id: string | null; status: string } | null,
): OrganizationContextLookupClient {
  return {
    platformOrganization: {
      findUnique: vi.fn().mockResolvedValue(org),
    },
  } as unknown as OrganizationContextLookupClient;
}

const ORG_OK = { id: "org-1", name: "Org 1", tenant_id: "tenant-1", status: "ACTIVE" };

describe("requireRuntimeOrganizationContext — fail closed", () => {
  it("17/18. auth_scope PLATFORM nunca puede usar este helper como cliente", async () => {
    const client = fakeControlPlane(ORG_OK);
    await expect(
      requireRuntimeOrganizationContext(baseUser({ auth_scope: "PLATFORM" }), client),
    ).rejects.toMatchObject({ code: "NOT_RUNTIME_SCOPE" });
    expect(client.platformOrganization.findUnique).not.toHaveBeenCalled();
  });

  it("RUNTIME_CLIENT sin organization_id → MISSING_ORGANIZATION_ID (identidad inválida)", async () => {
    const client = fakeControlPlane(ORG_OK);
    await expect(
      requireRuntimeOrganizationContext(baseUser({ organization_id: undefined }), client),
    ).rejects.toMatchObject({ code: "MISSING_ORGANIZATION_ID" });
    expect(client.platformOrganization.findUnique).not.toHaveBeenCalled();
  });

  it("organización no encontrada en Control Plane → ORGANIZATION_NOT_FOUND", async () => {
    const client = fakeControlPlane(null);
    await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toMatchObject({
      code: "ORGANIZATION_NOT_FOUND",
    });
  });

  it("organización sin tenant_id → ORGANIZATION_WITHOUT_TENANT", async () => {
    const client = fakeControlPlane({ ...ORG_OK, tenant_id: null });
    await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toMatchObject({
      code: "ORGANIZATION_WITHOUT_TENANT",
    });
  });

  it("organización SUSPENDED → ORGANIZATION_NOT_ELIGIBLE", async () => {
    const client = fakeControlPlane({ ...ORG_OK, status: "SUSPENDED" });
    await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toMatchObject({
      code: "ORGANIZATION_NOT_ELIGIBLE",
    });
  });

  it("14. tenant_id de sesión no coincide con organization.tenant_id → TENANT_MISMATCH", async () => {
    const client = fakeControlPlane({ ...ORG_OK, tenant_id: "tenant-OTHER" });
    await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toMatchObject({
      code: "TENANT_MISMATCH",
    });
  });

  it("10/18. sin perfil runtime activo → RUNTIME_PROFILE_UNAVAILABLE (nunca fallback global)", async () => {
    const client = fakeControlPlane(ORG_OK);
    resolveRuntimeDatabaseProfileForOrganizationMock.mockRejectedValue(
      new ActiveProfileNotFoundError("org-1"),
    );

    await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toMatchObject({
      code: "RUNTIME_PROFILE_UNAVAILABLE",
    });
  });

  it("caso exitoso: retorna contexto con dispose(), tenantId y locationId de sesión", async () => {
    const client = fakeControlPlane(ORG_OK);
    resolveRuntimeDatabaseProfileForOrganizationMock.mockResolvedValue({ id: "profile-1" });
    const disconnect = vi.fn().mockResolvedValue(undefined);
    createRuntimePrismaClientMock.mockReturnValue({ client: { fake: "runtime-prisma" }, disconnect });

    const handle = await requireRuntimeOrganizationContext(baseUser(), client);

    expect(handle.context.tenantId).toBe("tenant-1");
    expect(handle.context.locationId).toBe("branch-1");
    expect(handle.context.authScope).toBe("RUNTIME_CLIENT");
    expect(handle.context.organization).toEqual({ id: "org-1", name: "Org 1", tenantId: "tenant-1" });

    await handle.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("errores lanzados son instancia de RuntimeIdentityError", async () => {
    const client = fakeControlPlane(null);
    await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toBeInstanceOf(
      RuntimeIdentityError,
    );
  });
});
