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
import { cookies } from "next/headers";
import { getLocationById } from "@/core/modules/locations/queries";

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

// ─────────────────────────────────────────────────────────────────
// DTE-OUTGOING-DEDICATED-RUNTIME-DETAIL-FIX — identidad RUNTIME_CLIENT
// tenant-wide (location_id null): el detalle DTE (GET, opt-in
// `resolveRuntimeActiveLocation`) resuelve la location activa del
// selector validada contra la DB RUNTIME, igual que la página del
// listado. Sin la opción (handlers de escritura) el guard no cambia.
// ─────────────────────────────────────────────────────────────────

describe("getDteApiContext — location activa en Dedicated Runtime (detalle DTE)", () => {
  const runtimeClient = { __runtimeFakeClient: true };
  const tenantWideRuntimeUser = {
    id: "user-1",
    role: "super_admin",
    tenant_id: "tenant-RT",
    location_id: null,
    auth_scope: "RUNTIME_CLIENT",
    organization_id: "org-1",
  };

  function runtimeContextWithoutLocation() {
    return {
      context: {
        tenantId: "tenant-RT",
        locationId: null,
        client: runtimeClient,
        runtime: null,
        runtimeMode: "RUNTIME_CLIENT",
        readOnly: false,
        effectiveRole: "super_admin",
      },
      dispose: vi.fn(),
    };
  }

  beforeEach(() => {
    resolveEffectiveApiContextMock.mockReset();
    authMock.mockReset();
    vi.mocked(cookies).mockResolvedValue({
      get: (name: string) => (name === "active_location_id" ? { value: "loc-central" } : undefined),
    } as never);
    // Solo la DB runtime conoce la location — Control Plane (Prisma global,
    // llamada sin `db`) devuelve null, como ocurre en producción.
    vi.mocked(getLocationById).mockImplementation((async (id: string, tenantId: string, db?: unknown) =>
      db === runtimeClient && id === "loc-central" && tenantId === "tenant-RT"
        ? { id: "loc-central", tenant_id: "tenant-RT" }
        : null) as never);
  });

  it("con location activa válida en runtime → ok y location_id resuelta", async () => {
    authMock.mockResolvedValue({ user: tenantWideRuntimeUser });
    resolveEffectiveApiContextMock.mockResolvedValue(runtimeContextWithoutLocation());

    const result = await getDteApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.location_id).toBe("loc-central");
      expect(result.tenant_id).toBe("tenant-RT");
      expect(result.client).toBe(runtimeClient);
    }
  });

  it("valida la cookie contra la DB runtime del tenant efectivo, no contra Control Plane", async () => {
    authMock.mockResolvedValue({ user: tenantWideRuntimeUser });
    resolveEffectiveApiContextMock.mockResolvedValue(runtimeContextWithoutLocation());

    await getDteApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

    expect(vi.mocked(getLocationById)).toHaveBeenCalledWith("loc-central", "tenant-RT", runtimeClient);
  });

  it("sin cookie de location activa → mantiene el guard 409", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
    authMock.mockResolvedValue({ user: tenantWideRuntimeUser });
    resolveEffectiveApiContextMock.mockResolvedValue(runtimeContextWithoutLocation());

    const result = await getDteApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toBe("Selecciona una location activa para operar con documentos DTE.");
    }
  });

  it("cookie con location inexistente en la DB runtime → mantiene el guard 409", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: () => ({ value: "loc-otro-tenant" }),
    } as never);
    authMock.mockResolvedValue({ user: tenantWideRuntimeUser });
    resolveEffectiveApiContextMock.mockResolvedValue(runtimeContextWithoutLocation());

    const result = await getDteApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("sin la opción (handlers de escritura: pending, issuer-config) → comportamiento previo intacto, 409", async () => {
    authMock.mockResolvedValue({ user: tenantWideRuntimeUser });
    const handle = runtimeContextWithoutLocation();
    resolveEffectiveApiContextMock.mockResolvedValue(handle);

    const result = await getDteApiContext(fakeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(handle.dispose).toHaveBeenCalled();
  });

  it("PLATFORM_NATIVE con la opción → no aplica fallback runtime (sin cambios)", async () => {
    authMock.mockResolvedValue({ user: { ...tenantWideRuntimeUser, auth_scope: "PLATFORM" } });
    resolveEffectiveApiContextMock.mockResolvedValue({
      ...runtimeContextWithoutLocation(),
      context: { ...runtimeContextWithoutLocation().context, runtimeMode: "PLATFORM_NATIVE" },
    });

    const result = await getDteApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });
});
