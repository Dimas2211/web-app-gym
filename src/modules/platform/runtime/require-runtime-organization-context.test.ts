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
  "id" | "auth_scope" | "organization_id" | "tenant_id" | "location_id"
> {
  return {
    id: "u1",
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

  function fakeRuntimeUser(row: { status: string; tenant_id: string; role?: string } | null) {
    return { user: { findUnique: vi.fn().mockResolvedValue(row) } };
  }

  /** Mock de runtimeDb.branch.findFirst — por defecto resuelve una branch activa válida. */
  function fakeRuntimeBranch(row: { id: string } | null = { id: "branch-1" }) {
    return { branch: { findFirst: vi.fn().mockResolvedValue(row) } };
  }

  it("caso exitoso: retorna contexto con dispose(), tenantId, locationId y role LIVE de sesión", async () => {
    const client = fakeControlPlane(ORG_OK);
    resolveRuntimeDatabaseProfileForOrganizationMock.mockResolvedValue({ id: "profile-1" });
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const runtimeUser = fakeRuntimeUser({ status: "active", tenant_id: "tenant-1", role: "reception" });
    const runtimeBranch = fakeRuntimeBranch();
    createRuntimePrismaClientMock.mockReturnValue({
      client: { fake: "runtime-prisma", ...runtimeUser, ...runtimeBranch },
      disconnect,
    });

    const handle = await requireRuntimeOrganizationContext(baseUser(), client);

    expect(handle.context.tenantId).toBe("tenant-1");
    expect(handle.context.locationId).toBe("branch-1");
    expect(handle.context.authScope).toBe("RUNTIME_CLIENT");
    expect(handle.context.organization).toEqual({ id: "org-1", name: "Org 1", tenantId: "tenant-1" });
    expect(handle.context.role).toBe("reception");
    expect(runtimeUser.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { status: true, tenant_id: true, role: true },
    });
    expect(runtimeBranch.branch.findFirst).toHaveBeenCalledWith({
      where: { id: "branch-1", tenant_id: "tenant-1", status: "active" },
      select: { id: true },
    });

    await handle.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("FASE VI-D2 — role LIVE de runtimeDb difiere del role del JWT (baseUser no lo trae): siempre gana la DB", async () => {
    const client = fakeControlPlane(ORG_OK);
    resolveRuntimeDatabaseProfileForOrganizationMock.mockResolvedValue({ id: "profile-1" });
    const disconnect = vi.fn().mockResolvedValue(undefined);
    createRuntimePrismaClientMock.mockReturnValue({
      client: {
        fake: "runtime-prisma",
        ...fakeRuntimeUser({ status: "active", tenant_id: "tenant-1", role: "branch_admin" }),
        ...fakeRuntimeBranch(),
      },
      disconnect,
    });

    const handle = await requireRuntimeOrganizationContext(baseUser(), client);
    expect(handle.context.role).toBe("branch_admin");
  });

  describe("FASE VI-D3 — ETAPA E: revalidación live de location", () => {
    it("location_id null (identidad tenant-wide) -> NO consulta branch, permite sin location", async () => {
      const client = fakeControlPlane(ORG_OK);
      resolveRuntimeDatabaseProfileForOrganizationMock.mockResolvedValue({ id: "profile-1" });
      const disconnect = vi.fn().mockResolvedValue(undefined);
      const runtimeBranch = fakeRuntimeBranch();
      createRuntimePrismaClientMock.mockReturnValue({
        client: {
          fake: "runtime-prisma",
          ...fakeRuntimeUser({ status: "active", tenant_id: "tenant-1", role: "super_admin" }),
          ...runtimeBranch,
        },
        disconnect,
      });

      const handle = await requireRuntimeOrganizationContext(baseUser({ location_id: null }), client);
      expect(handle.context.locationId).toBeNull();
      expect(runtimeBranch.branch.findFirst).not.toHaveBeenCalled();
    });

    it("6. branch inactiva/inexistente/de otro tenant -> RUNTIME_LOCATION_INVALID, y desconecta", async () => {
      const client = fakeControlPlane(ORG_OK);
      resolveRuntimeDatabaseProfileForOrganizationMock.mockResolvedValue({ id: "profile-1" });
      const disconnect = vi.fn().mockResolvedValue(undefined);
      createRuntimePrismaClientMock.mockReturnValue({
        client: {
          fake: "runtime-prisma",
          ...fakeRuntimeUser({ status: "active", tenant_id: "tenant-1", role: "branch_admin" }),
          ...fakeRuntimeBranch(null), // no existe / inactiva / otro tenant — mismo resultado desde el findFirst
        },
        disconnect,
      });

      await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toMatchObject({
        code: "RUNTIME_LOCATION_INVALID",
      });
      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it("1. tenant A + branch propia de A -> permitido (locationId resuelto)", async () => {
      const client = fakeControlPlane(ORG_OK);
      resolveRuntimeDatabaseProfileForOrganizationMock.mockResolvedValue({ id: "profile-1" });
      const disconnect = vi.fn().mockResolvedValue(undefined);
      createRuntimePrismaClientMock.mockReturnValue({
        client: {
          fake: "runtime-prisma",
          ...fakeRuntimeUser({ status: "active", tenant_id: "tenant-1", role: "branch_admin" }),
          ...fakeRuntimeBranch({ id: "branch-1" }),
        },
        disconnect,
      });

      const handle = await requireRuntimeOrganizationContext(baseUser({ location_id: "branch-1" }), client);
      expect(handle.context.locationId).toBe("branch-1");
    });
  });

  it("errores lanzados son instancia de RuntimeIdentityError", async () => {
    const client = fakeControlPlane(null);
    await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toBeInstanceOf(
      RuntimeIdentityError,
    );
  });

  describe("ETAPA T — revalidación live del usuario runtime", () => {
    it("usuario runtime inexistente en la base cliente → RUNTIME_USER_NOT_FOUND, y desconecta", async () => {
      const client = fakeControlPlane(ORG_OK);
      resolveRuntimeDatabaseProfileForOrganizationMock.mockResolvedValue({ id: "profile-1" });
      const disconnect = vi.fn().mockResolvedValue(undefined);
      createRuntimePrismaClientMock.mockReturnValue({
        client: { fake: "runtime-prisma", ...fakeRuntimeUser(null) },
        disconnect,
      });

      await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toMatchObject({
        code: "RUNTIME_USER_NOT_FOUND",
      });
      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it("9. usuario runtime inactivo → RUNTIME_USER_INACTIVE (no espera a expiración del JWT), y desconecta", async () => {
      const client = fakeControlPlane(ORG_OK);
      resolveRuntimeDatabaseProfileForOrganizationMock.mockResolvedValue({ id: "profile-1" });
      const disconnect = vi.fn().mockResolvedValue(undefined);
      createRuntimePrismaClientMock.mockReturnValue({
        client: { fake: "runtime-prisma", ...fakeRuntimeUser({ status: "inactive", tenant_id: "tenant-1" }) },
        disconnect,
      });

      await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toMatchObject({
        code: "RUNTIME_USER_INACTIVE",
      });
      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it("usuario runtime con tenant_id de otro tenant → RUNTIME_USER_TENANT_MISMATCH, y desconecta", async () => {
      const client = fakeControlPlane(ORG_OK);
      resolveRuntimeDatabaseProfileForOrganizationMock.mockResolvedValue({ id: "profile-1" });
      const disconnect = vi.fn().mockResolvedValue(undefined);
      createRuntimePrismaClientMock.mockReturnValue({
        client: { fake: "runtime-prisma", ...fakeRuntimeUser({ status: "active", tenant_id: "tenant-OTHER" }) },
        disconnect,
      });

      await expect(requireRuntimeOrganizationContext(baseUser(), client)).rejects.toMatchObject({
        code: "RUNTIME_USER_TENANT_MISMATCH",
      });
      expect(disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
