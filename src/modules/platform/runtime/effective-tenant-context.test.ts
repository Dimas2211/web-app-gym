// ─────────────────────────────────────────────────────────────────
// platform/runtime — effective-tenant-context.test.ts
//
// PASO 6C — Auditoría de aislamiento GYM: raíz del bug era que las
// páginas GYM (memberships/trainers/classes/weekly-plans) usaban
// `sessionUser.tenant_id` directamente como tenant efectivo, en vez de
// resolver el tenant/PrismaClient de la sesión runtime "Operar como
// cliente" cuando existe una activa. Estos tests fijan el contrato de
// `resolveEffectiveTenantContext` que ahora usan esas páginas.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getRuntimeSessionMock,
  clearRuntimeSessionMock,
  resolveRuntimeDatabaseProfileByIdMock,
  createRuntimePrismaClientMock,
  disconnectMock,
  requireRuntimeOrganizationContextMock,
} = vi.hoisted(() => ({
  getRuntimeSessionMock: vi.fn(),
  clearRuntimeSessionMock: vi.fn(),
  resolveRuntimeDatabaseProfileByIdMock: vi.fn(),
  createRuntimePrismaClientMock: vi.fn(),
  disconnectMock: vi.fn(),
  requireRuntimeOrganizationContextMock: vi.fn(),
}));

vi.mock("./runtime-session", () => ({
  getRuntimeSession: getRuntimeSessionMock,
  clearRuntimeSession: clearRuntimeSessionMock,
}));

vi.mock("./runtime-database-router", () => ({
  resolveRuntimeDatabaseProfileById: resolveRuntimeDatabaseProfileByIdMock,
  createRuntimePrismaClient: createRuntimePrismaClientMock,
}));

vi.mock("./require-runtime-organization-context", () => ({
  requireRuntimeOrganizationContext: requireRuntimeOrganizationContextMock,
  RuntimeIdentityError: class RuntimeIdentityError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { __marker: "NORMAL_SINGLETON" },
}));

import { resolveEffectiveTenantContext, resolveEffectiveApiContext, resolveRuntimeFirstLocationId } from "./effective-tenant-context";
import type { SessionUser } from "@/lib/permissions/guards";

const NORMAL_USER = {
  id: "u1",
  tenant_id: "tenant-superadmin-real",
  role: "super_admin",
} as unknown as SessionUser;

beforeEach(() => {
  getRuntimeSessionMock.mockReset();
  clearRuntimeSessionMock.mockReset();
  resolveRuntimeDatabaseProfileByIdMock.mockReset();
  createRuntimePrismaClientMock.mockReset();
  disconnectMock.mockReset();
  requireRuntimeOrganizationContextMock.mockReset();
});

describe("resolveEffectiveTenantContext", () => {
  it("modo normal (sin sesión runtime) -> usa tenant_id y prisma singleton del propio usuario", async () => {
    getRuntimeSessionMock.mockResolvedValue(null);

    const { context, dispose } = await resolveEffectiveTenantContext(NORMAL_USER);

    expect(context.tenantId).toBe("tenant-superadmin-real");
    expect(context.runtime).toBeNull();
    expect(context.client).toBeUndefined();
    await dispose(); // no-op, no debe lanzar
    expect(resolveRuntimeDatabaseProfileByIdMock).not.toHaveBeenCalled();
  });

  it('sesión runtime activa ("Operar como cliente") -> tenantId y client son los del perfil runtime, NUNCA los del super_admin autenticado', async () => {
    const runtimeSession = {
      organizationId: "org-trustme",
      profileId: "profile-trustme",
      tenantId: "tenant-trustme",
      organizationName: "TrustMe",
      profileLabel: "TrustMe prod",
      readOnly: true as const,
      startedByUserId: "u1",
      startedAt: new Date().toISOString(),
    };
    getRuntimeSessionMock.mockResolvedValue(runtimeSession);
    resolveRuntimeDatabaseProfileByIdMock.mockResolvedValue({
      tenantId: "tenant-trustme",
      organizationId: "org-trustme",
      organizationName: "TrustMe",
      label: "TrustMe prod",
    });
    const runtimeClientMarker = { __marker: "RUNTIME_TRUSTME_CLIENT" };
    createRuntimePrismaClientMock.mockReturnValue({ client: runtimeClientMarker, disconnect: disconnectMock });

    const { context, dispose } = await resolveEffectiveTenantContext(NORMAL_USER);

    // El bug reportado era exactamente esto: código viejo seguía usando
    // NORMAL_USER.tenant_id ("tenant-superadmin-real"). El contrato correcto
    // exige que sea el tenant EFECTIVO del perfil runtime.
    expect(context.tenantId).toBe("tenant-trustme");
    expect(context.tenantId).not.toBe(NORMAL_USER.tenant_id);
    expect(context.client).toBe(runtimeClientMarker);
    expect(context.runtime).toEqual(runtimeSession);

    await dispose();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it("perfil runtime inválido/desactivado -> degrada a modo normal y limpia la cookie (nunca rompe la página)", async () => {
    getRuntimeSessionMock.mockResolvedValue({
      organizationId: "org-x",
      profileId: "profile-x",
      tenantId: "tenant-x",
      organizationName: "X",
      profileLabel: "X",
      readOnly: true as const,
      startedByUserId: "u1",
      startedAt: new Date().toISOString(),
    });
    resolveRuntimeDatabaseProfileByIdMock.mockRejectedValue(new Error("perfil inactivo"));

    const { context } = await resolveEffectiveTenantContext(NORMAL_USER);

    expect(context.tenantId).toBe("tenant-superadmin-real");
    expect(context.runtime).toBeNull();
    expect(clearRuntimeSessionMock).toHaveBeenCalledTimes(1);
  });

  const RUNTIME_CLIENT_USER = {
    id: "u-runtime",
    tenant_id: "tenant-trustme-real",
    location_id: "branch-trustme-1",
    role: "branch_admin",
    auth_scope: "RUNTIME_CLIENT",
    organization_id: "org-trustme",
  } as unknown as SessionUser;

  it("FASE VI-D — auth_scope=RUNTIME_CLIENT delega en requireRuntimeOrganizationContext y NUNCA lee la cookie de Support Session", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    const disposeMock = vi.fn().mockResolvedValue(undefined);
    requireRuntimeOrganizationContextMock.mockResolvedValue({
      context: {
        organization: { id: "org-trustme", name: "TrustMe", tenantId: "tenant-trustme-real" },
        tenantId: "tenant-trustme-real",
        locationId: "branch-trustme-1",
        runtimeDb: runtimeDbMarker,
        authScope: "RUNTIME_CLIENT",
      },
      dispose: disposeMock,
    });

    const { context, dispose } = await resolveEffectiveTenantContext(RUNTIME_CLIENT_USER);

    expect(context.tenantId).toBe("tenant-trustme-real");
    expect(context.locationId).toBe("branch-trustme-1");
    expect(context.client).toBe(runtimeDbMarker);
    expect(context.runtime).toBeNull();
    expect(context.runtimeMode).toBe("RUNTIME_CLIENT");
    expect(context.readOnly).toBe(false);
    expect(requireRuntimeOrganizationContextMock).toHaveBeenCalledWith(RUNTIME_CLIENT_USER);
    expect(getRuntimeSessionMock).not.toHaveBeenCalled();

    await dispose();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("FASE VI-D — RUNTIME_CLIENT inválido (organización/perfil/tenant) → fail closed, nunca degrada a contexto normal", async () => {
    class RuntimeIdentityError extends Error {
      code = "ORGANIZATION_NOT_FOUND";
    }
    requireRuntimeOrganizationContextMock.mockRejectedValue(new RuntimeIdentityError("org no existe"));

    await expect(resolveEffectiveTenantContext(RUNTIME_CLIENT_USER)).rejects.toThrow();
    expect(getRuntimeSessionMock).not.toHaveBeenCalled();
  });
});

describe("resolveEffectiveApiContext", () => {
  const RUNTIME_CLIENT_USER = {
    id: "u-runtime",
    tenant_id: "tenant-trustme-real",
    location_id: "branch-trustme-1",
    auth_scope: "RUNTIME_CLIENT",
    organization_id: "org-trustme",
  } as unknown as SessionUser;

  it("sin `user` (callers no migrados) -> comportamiento PLATFORM_NATIVE idéntico al de siempre", async () => {
    getRuntimeSessionMock.mockResolvedValue(null);

    const { context, dispose } = await resolveEffectiveApiContext({ tenantId: "tenant-x", locationId: "loc-1" });

    expect(context.tenantId).toBe("tenant-x");
    expect(context.locationId).toBe("loc-1");
    expect(context.client).toEqual({ __marker: "NORMAL_SINGLETON" });
    expect(context.runtimeMode).toBe("PLATFORM_NATIVE");
    expect(context.readOnly).toBe(false);
    expect(requireRuntimeOrganizationContextMock).not.toHaveBeenCalled();
    await dispose();
  });

  it("`user` con auth_scope RUNTIME_CLIENT -> ignora `base` por completo y usa runtimeDb propio", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    const disposeMock = vi.fn().mockResolvedValue(undefined);
    requireRuntimeOrganizationContextMock.mockResolvedValue({
      context: {
        organization: { id: "org-trustme", name: "TrustMe", tenantId: "tenant-trustme-real" },
        tenantId: "tenant-trustme-real",
        locationId: "branch-trustme-1",
        runtimeDb: runtimeDbMarker,
        authScope: "RUNTIME_CLIENT",
      },
      dispose: disposeMock,
    });

    // `base` deliberadamente distinto/incorrecto: nunca debe usarse para RUNTIME_CLIENT.
    const { context, dispose } = await resolveEffectiveApiContext(
      { tenantId: "tenant-SPOOFED", locationId: "loc-SPOOFED" },
      RUNTIME_CLIENT_USER,
    );

    expect(context.tenantId).toBe("tenant-trustme-real");
    expect(context.locationId).toBe("branch-trustme-1");
    expect(context.client).toBe(runtimeDbMarker);
    expect(context.runtimeMode).toBe("RUNTIME_CLIENT");
    expect(context.readOnly).toBe(false);
    expect(getRuntimeSessionMock).not.toHaveBeenCalled();

    await dispose();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("`user` RUNTIME_CLIENT inválido -> fail closed (nunca retorna contexto normal/global)", async () => {
    class RuntimeIdentityError extends Error {
      code = "RUNTIME_PROFILE_UNAVAILABLE";
    }
    requireRuntimeOrganizationContextMock.mockRejectedValue(new RuntimeIdentityError("perfil no disponible"));

    await expect(
      resolveEffectiveApiContext({ tenantId: "tenant-SPOOFED" }, RUNTIME_CLIENT_USER),
    ).rejects.toThrow();
    expect(getRuntimeSessionMock).not.toHaveBeenCalled();
  });

  it("`user` con auth_scope PLATFORM -> comportamiento idéntico a no pasar `user`", async () => {
    getRuntimeSessionMock.mockResolvedValue(null);
    const platformUser = { ...RUNTIME_CLIENT_USER, auth_scope: "PLATFORM", organization_id: undefined };

    const { context } = await resolveEffectiveApiContext({ tenantId: "tenant-x" }, platformUser as never);

    expect(context.runtimeMode).toBe("PLATFORM_NATIVE");
    expect(requireRuntimeOrganizationContextMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// resolveRuntimeFirstLocationId — bug residual post FASE IV-A: las
// páginas DTE (settings/correlatives) resuelven la location runtime
// con esta función en vez de getEffectiveLocationId(sessionUser) — esa
// cookie pertenece al tenant real del super_admin, no al tenant
// runtime. Caso de certificación: TrustMe con exactamente 1 Branch
// activa debe resolver esa Branch, nunca una del tenant GYM.
// ─────────────────────────────────────────────────────────────────
describe("resolveRuntimeFirstLocationId", () => {
  it("sin context.client (modo normal) -> null, nunca consulta la DB", async () => {
    const result = await resolveRuntimeFirstLocationId({ tenantId: "tenant-gym", runtime: null });
    expect(result).toBeNull();
  });

  it("tenant runtime con exactamente 1 Branch activa -> resuelve esa Branch (TrustMe), nunca una de otro tenant", async () => {
    const findFirstSpy = vi.fn().mockResolvedValue({ id: "branch-trustme-unica" });
    const runtimeClient = { branch: { findFirst: findFirstSpy } } as never;

    const result = await resolveRuntimeFirstLocationId({
      tenantId: "tenant-trustme",
      client: runtimeClient,
      runtime: { readOnly: true } as never,
    });

    expect(result).toBe("branch-trustme-unica");
    expect(findFirstSpy).toHaveBeenCalledWith({
      where: { tenant_id: "tenant-trustme", status: "active" },
      select: { id: true },
      orderBy: { name: "asc" },
    });
  });

  it("tenant runtime sin Branch activa -> null (nunca inventa/hereda la del tenant real)", async () => {
    const findFirstSpy = vi.fn().mockResolvedValue(null);
    const runtimeClient = { branch: { findFirst: findFirstSpy } } as never;

    const result = await resolveRuntimeFirstLocationId({
      tenantId: "tenant-trustme",
      client: runtimeClient,
      runtime: { readOnly: true } as never,
    });

    expect(result).toBeNull();
  });
});
