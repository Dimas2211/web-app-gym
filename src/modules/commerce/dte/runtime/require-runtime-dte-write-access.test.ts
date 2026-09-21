// ─────────────────────────────────────────────────────────────────
// commerce/dte/runtime — require-runtime-dte-write-access.test.ts
//
// FASE VI-E7 — certifica que el guard sigue siendo el ÚNICO punto de
// escape del read-only global de Support Session, SIN ampliarse, y que
// ahora también resuelve organizationId server-side para el resolver de
// destino externo (STEP 4/5 de VI-E7):
//   - Allowlist sigue siendo exactamente ["DELIVER_EXTERNAL"] — no se
//     agregó ninguna acción nueva.
//   - Modo normal: requiere requireAdmin(), resuelve organizationId por
//     tenant_id contra el Control Plane (null si no hay
//     PlatformOrganization), allowLegacyEnvFallback=true.
//   - Modo runtime: requiere requireSuperAdmin() + confirmed:true,
//     organizationId = profile.organizationId (siempre presente, nunca
//     null), allowLegacyEnvFallback=false SIEMPRE — no widening.
//   - Acción fuera de la allowlist -> rechazada antes de tocar sesión.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireAdminMock,
  requireSuperAdminMock,
  getEffectiveLocationIdMock,
  getRuntimeSessionMock,
  resolveRuntimeDatabaseProfileByIdMock,
  createRuntimePrismaClientMock,
  resolveRuntimeFirstLocationIdMock,
  platformOrganizationFindUniqueMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  requireSuperAdminMock: vi.fn(),
  getEffectiveLocationIdMock: vi.fn(),
  getRuntimeSessionMock: vi.fn(),
  resolveRuntimeDatabaseProfileByIdMock: vi.fn(),
  createRuntimePrismaClientMock: vi.fn(),
  resolveRuntimeFirstLocationIdMock: vi.fn(),
  platformOrganizationFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { __marker: "GLOBAL_PRISMA" } }));
vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: requireAdminMock,
  requireSuperAdmin: requireSuperAdminMock,
}));
vi.mock("@/lib/location/active-location", () => ({ getEffectiveLocationId: getEffectiveLocationIdMock }));
vi.mock("@/modules/platform/runtime/runtime-session", () => ({ getRuntimeSession: getRuntimeSessionMock }));
vi.mock("@/modules/platform/runtime/runtime-database-router", () => ({
  resolveRuntimeDatabaseProfileById: resolveRuntimeDatabaseProfileByIdMock,
  createRuntimePrismaClient: createRuntimePrismaClientMock,
  RuntimeDatabaseRouterError: class RuntimeDatabaseRouterError extends Error {},
}));
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveRuntimeFirstLocationId: resolveRuntimeFirstLocationIdMock,
}));
vi.mock("@/modules/platform/runtime/control-plane-prisma", () => ({
  controlPlanePrisma: {
    platformOrganization: { findUnique: platformOrganizationFindUniqueMock },
    platformDeploymentLog: { create: vi.fn() },
  },
}));

import { requireRuntimeDteWriteAccess, RUNTIME_DTE_WRITE_ALLOWLIST } from "./require-runtime-dte-write-access";

beforeEach(() => {
  requireAdminMock.mockReset();
  requireSuperAdminMock.mockReset();
  getEffectiveLocationIdMock.mockReset();
  getRuntimeSessionMock.mockReset();
  resolveRuntimeDatabaseProfileByIdMock.mockReset();
  createRuntimePrismaClientMock.mockReset();
  resolveRuntimeFirstLocationIdMock.mockReset();
  platformOrganizationFindUniqueMock.mockReset();
});

describe("requireRuntimeDteWriteAccess — FASE VI-E7 (organizationId + allowLegacyEnvFallback)", () => {
  it("allowlist sigue siendo exactamente [\"DELIVER_EXTERNAL\"] — no se amplió", () => {
    expect(RUNTIME_DTE_WRITE_ALLOWLIST).toEqual(["DELIVER_EXTERNAL"]);
  });

  it("acción fuera de la allowlist -> rechazada antes de resolver sesión", async () => {
    // @ts-expect-error — acción deliberadamente inválida para probar el guard.
    const result = await requireRuntimeDteWriteAccess({ action: "TRANSMIT", confirmed: true });

    expect(result.ok).toBe(false);
    expect(getRuntimeSessionMock).not.toHaveBeenCalled();
  });

  it("modo normal: organizationId resuelto por tenant_id contra Control Plane, allowLegacyEnvFallback=true", async () => {
    getRuntimeSessionMock.mockResolvedValue(null);
    requireAdminMock.mockResolvedValue({ id: "u1", tenant_id: "tenant-1", role: "admin" });
    getEffectiveLocationIdMock.mockResolvedValue("loc-1");
    platformOrganizationFindUniqueMock.mockResolvedValue({ id: "org-1" });

    const result = await requireRuntimeDteWriteAccess({ action: "DELIVER_EXTERNAL", confirmed: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.isRuntimeWrite).toBe(false);
      expect(result.context.organizationId).toBe("org-1");
      expect(result.context.allowLegacyEnvFallback).toBe(true);
      expect(result.context.client).toEqual({ __marker: "GLOBAL_PRISMA" });
    }
    expect(platformOrganizationFindUniqueMock).toHaveBeenCalledWith({
      where:  { tenant_id: "tenant-1" },
      select: { id: true },
    });
  });

  it("modo normal sin PlatformOrganization mapeada -> organizationId null (standalone), allowLegacyEnvFallback sigue true", async () => {
    getRuntimeSessionMock.mockResolvedValue(null);
    requireAdminMock.mockResolvedValue({ id: "u1", tenant_id: "tenant-standalone", role: "admin" });
    getEffectiveLocationIdMock.mockResolvedValue("loc-1");
    platformOrganizationFindUniqueMock.mockResolvedValue(null);

    const result = await requireRuntimeDteWriteAccess({ action: "DELIVER_EXTERNAL", confirmed: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.organizationId).toBeNull();
      expect(result.context.allowLegacyEnvFallback).toBe(true);
    }
  });

  it("modo runtime: requiere confirmed:true, organizationId = profile.organizationId (nunca null), allowLegacyEnvFallback SIEMPRE false", async () => {
    getRuntimeSessionMock.mockResolvedValue({ profileId: "profile-1" });
    requireSuperAdminMock.mockResolvedValue({ id: "u-super", role: "super_admin" });
    resolveRuntimeDatabaseProfileByIdMock.mockResolvedValue({
      tenantId: "tenant-runtime", organizationId: "org-runtime", organizationName: "Cliente Runtime", label: "PROD",
    });
    const runtimeClientMarker = { __marker: "RUNTIME_CLIENT_DB" };
    const disconnectMock = vi.fn().mockResolvedValue(undefined);
    createRuntimePrismaClientMock.mockReturnValue({ client: runtimeClientMarker, disconnect: disconnectMock });
    resolveRuntimeFirstLocationIdMock.mockResolvedValue("loc-runtime");

    const result = await requireRuntimeDteWriteAccess({ action: "DELIVER_EXTERNAL", confirmed: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.isRuntimeWrite).toBe(true);
      expect(result.context.organizationId).toBe("org-runtime");
      expect(result.context.allowLegacyEnvFallback).toBe(false);
      expect(result.context.client).toBe(runtimeClientMarker);
    }
    // El resolver de organización por tenant_id NUNCA se llama en modo runtime
    // — la organización ya viene resuelta por el perfil runtime.
    expect(platformOrganizationFindUniqueMock).not.toHaveBeenCalled();
  });

  it("modo runtime sin confirmed:true -> rechazado, nunca resuelve perfil runtime ni organización", async () => {
    getRuntimeSessionMock.mockResolvedValue({ profileId: "profile-1" });
    requireSuperAdminMock.mockResolvedValue({ id: "u-super", role: "super_admin" });

    const result = await requireRuntimeDteWriteAccess({ action: "DELIVER_EXTERNAL", confirmed: false });

    expect(result.ok).toBe(false);
    expect(resolveRuntimeDatabaseProfileByIdMock).not.toHaveBeenCalled();
  });
});
