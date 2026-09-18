// ─────────────────────────────────────────────────────────────────
// api/dte — dte-api-context.test.ts
//
// FASE VI-E2A: certifica el mismo hallazgo crítico ya cerrado en
// purchases/sales (VI-D6) para el boundary de LECTURA DTE —
// getDteApiContext() ahora SIEMPRE pasa `user` como segundo argumento
// a resolveEffectiveApiContext(). Antes se omitía, y una identidad
// RUNTIME_CLIENT caía silenciosamente al branch PLATFORM_NATIVE
// (Prisma global + tenant_id de JWT sin revalidar) en vez de fallar
// cerrado vía requireRuntimeOrganizationContext.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth/auth", () => ({ auth: () => authMock() }));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

vi.mock("@/core/modules/locations/queries", () => ({
  getLocationById: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: vi.fn().mockResolvedValue({}),
  assertOrganizationModule: vi.fn(),
  CommercialEnforcementError: class extends Error {},
}));

const resolveEffectiveApiContextMock = vi.fn();
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveApiContext: (...args: unknown[]) => resolveEffectiveApiContextMock(...args),
}));

import { getDteApiContext } from "./dte-api-context";

function fakeRequest(): never {
  return {
    cookies: { get: () => undefined },
    headers: { get: () => "" },
  } as never;
}

describe("getDteApiContext — boundary runtime de lectura DTE", () => {
  beforeEach(() => {
    resolveEffectiveApiContextMock.mockReset();
    authMock.mockReset();
  });

  it("RUNTIME_CLIENT: pasa `user` (con auth_scope/organization_id) como segundo argumento — nunca lo omite", async () => {
    const sessionUser = {
      id: "user-1",
      role: "super_admin",
      tenant_id: "tenant-A",
      location_id: "location-A1",
      auth_scope: "RUNTIME_CLIENT",
      organization_id: "org-1",
    };
    authMock.mockResolvedValue({ user: sessionUser });
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: {
        tenantId: "tenant-A",
        locationId: "location-A1",
        client: { __runtimeFakeClient: true },
        runtime: null,
        runtimeMode: "RUNTIME_CLIENT",
        readOnly: false,
        effectiveRole: "super_admin",
      },
      dispose: vi.fn(),
    });

    const result = await getDteApiContext(fakeRequest());

    expect(resolveEffectiveApiContextMock).toHaveBeenCalledTimes(1);
    const [, passedUser] = resolveEffectiveApiContextMock.mock.calls[0];
    expect(passedUser).toBeDefined();
    expect(passedUser).toMatchObject({ auth_scope: "RUNTIME_CLIENT", organization_id: "org-1" });
    expect(result.ok).toBe(true);
  });

  it("RUNTIME_CLIENT: context.client es el runtime fake client, no Prisma global", async () => {
    const sessionUser = {
      id: "user-1",
      role: "super_admin",
      tenant_id: "tenant-A",
      location_id: "location-A1",
      auth_scope: "RUNTIME_CLIENT",
      organization_id: "org-1",
    };
    const runtimeClient = { __runtimeFakeClient: true };
    authMock.mockResolvedValue({ user: sessionUser });
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: {
        tenantId: "tenant-A",
        locationId: "location-A1",
        client: runtimeClient,
        runtime: null,
        runtimeMode: "RUNTIME_CLIENT",
        readOnly: false,
        effectiveRole: "super_admin",
      },
      dispose: vi.fn(),
    });

    const result = await getDteApiContext(fakeRequest());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.client).toBe(runtimeClient);
  });

  it("RUNTIME_CLIENT: el tenant efectivo no proviene del JWT crudo si runtime context devuelve otro valor válido", async () => {
    const sessionUser = {
      id: "user-1",
      role: "super_admin",
      tenant_id: "tenant-FROM-JWT",
      location_id: "location-A1",
      auth_scope: "RUNTIME_CLIENT",
      organization_id: "org-1",
    };
    authMock.mockResolvedValue({ user: sessionUser });
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: {
        tenantId: "tenant-FROM-RUNTIME-DB",
        locationId: "location-A1",
        client: {},
        runtime: null,
        runtimeMode: "RUNTIME_CLIENT",
        readOnly: false,
        effectiveRole: "super_admin",
      },
      dispose: vi.fn(),
    });

    const result = await getDteApiContext(fakeRequest());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tenant_id).toBe("tenant-FROM-RUNTIME-DB");
  });

  it("RUNTIME_CLIENT: deniega si el ROL LIVE (context.effectiveRole) ya no califica, aunque el JWT tuviera un rol habilitado", async () => {
    const sessionUser = {
      id: "user-1",
      role: "branch_admin",
      tenant_id: "tenant-A",
      location_id: "location-A1",
      auth_scope: "RUNTIME_CLIENT",
      organization_id: "org-1",
    };
    authMock.mockResolvedValue({ user: sessionUser });
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: {
        tenantId: "tenant-A",
        locationId: "location-A1",
        client: {},
        runtime: null,
        runtimeMode: "RUNTIME_CLIENT",
        readOnly: false,
        effectiveRole: "client", // rol LIVE degradado, sin canManageStaff
      },
      dispose: vi.fn(),
    });

    const result = await getDteApiContext(fakeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("PLATFORM_NATIVE: comportamiento preservado — usa tenant/location de JWT y Prisma normal", async () => {
    const sessionUser = {
      id: "user-1",
      role: "super_admin",
      tenant_id: "tenant-A",
      location_id: "location-A1",
      auth_scope: "PLATFORM",
      organization_id: undefined,
    };
    authMock.mockResolvedValue({ user: sessionUser });
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: {
        tenantId: "tenant-A",
        locationId: "location-A1",
        client: { __globalPrisma: true },
        runtime: null,
        runtimeMode: "PLATFORM_NATIVE",
        readOnly: false,
        effectiveRole: "super_admin",
      },
      dispose: vi.fn(),
    });

    const result = await getDteApiContext(fakeRequest());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenant_id).toBe("tenant-A");
      expect(result.location_id).toBe("location-A1");
    }
  });

  it("SUPPORT_RUNTIME: usa el runtime client seleccionado y readOnly=true", async () => {
    const sessionUser = {
      id: "user-1",
      role: "super_admin",
      tenant_id: "tenant-PLATFORM",
      location_id: null,
      auth_scope: "PLATFORM",
      organization_id: undefined,
    };
    const supportRuntimeClient = { __supportRuntimeClient: true };
    authMock.mockResolvedValue({ user: sessionUser });
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: {
        tenantId: "tenant-B",
        locationId: "location-B1",
        client: supportRuntimeClient,
        runtime: { profileId: "profile-1", readOnly: true },
        runtimeMode: "SUPPORT_RUNTIME",
        readOnly: true,
        effectiveRole: "super_admin",
      },
      dispose: vi.fn(),
    });

    const result = await getDteApiContext(fakeRequest());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.client).toBe(supportRuntimeClient);
      expect(result.runtime?.readOnly).toBe(true);
    }
  });

  it("runtime context ausente/inválido (sin location resuelta): falla cerrado, sin fallback a Prisma global", async () => {
    const sessionUser = {
      id: "user-1",
      role: "super_admin",
      tenant_id: "tenant-A",
      location_id: null,
      auth_scope: "RUNTIME_CLIENT",
      organization_id: "org-1",
    };
    authMock.mockResolvedValue({ user: sessionUser });
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: {
        tenantId: "tenant-A",
        locationId: null,
        client: {},
        runtime: null,
        runtimeMode: "RUNTIME_CLIENT",
        readOnly: false,
        effectiveRole: "super_admin",
      },
      dispose: vi.fn(),
    });

    const result = await getDteApiContext(fakeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});
