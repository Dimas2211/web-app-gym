// ─────────────────────────────────────────────────────────────────
// api/sales — sale-api-context.test.ts
//
// FASE VI-D6: certifica el hallazgo crítico del audit transversal —
// getSaleApiContext() ahora SIEMPRE pasa `user` como segundo argumento
// a resolveEffectiveApiContext(). Antes se omitía, y una identidad
// RUNTIME_CLIENT caía silenciosamente al branch PLATFORM_NATIVO
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

import { getSaleApiContext } from "./sale-api-context";
import { cookies } from "next/headers";
import { getLocationById } from "@/core/modules/locations/queries";

function fakeRequest(): never {
  return {
    cookies: { get: () => undefined },
    headers: { get: () => "" },
  } as never;
}

describe("getSaleApiContext — propagación de `user` a resolveEffectiveApiContext", () => {
  beforeEach(() => {
    resolveEffectiveApiContextMock.mockReset();
    authMock.mockReset();
  });

  it("pasa `user` (con auth_scope/organization_id) como segundo argumento — nunca lo omite", async () => {
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
        client: {},
        runtime: null,
        runtimeMode: "RUNTIME_CLIENT",
        readOnly: false,
        effectiveRole: "super_admin",
      },
      dispose: vi.fn(),
    });

    const result = await getSaleApiContext(fakeRequest());

    expect(resolveEffectiveApiContextMock).toHaveBeenCalledTimes(1);
    const [, passedUser] = resolveEffectiveApiContextMock.mock.calls[0];
    expect(passedUser).toBeDefined();
    expect(passedUser).toMatchObject({ auth_scope: "RUNTIME_CLIENT", organization_id: "org-1" });
    expect(result.ok).toBe(true);
  });

  it("deniega si el ROL LIVE (context.effectiveRole) ya no califica, aunque el JWT tuviera un rol habilitado", async () => {
    // Escenario: el JWT (hasta 8h de antigüedad) todavía dice "branch_admin",
    // pero el rol LIVE resuelto por requireRuntimeOrganizationContext ya
    // bajó a un rol sin canManageStaff (ej. degradado por el tenant).
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

    const result = await getSaleApiContext(fakeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────
// DEDICATED-RUNTIME-UI-CLOSURE — identidad RUNTIME_CLIENT tenant-wide
// (location_id null): los GET de lectura (opt-in
// `resolveRuntimeActiveLocation`) resuelven la location activa del
// selector validada contra la DB RUNTIME. Sin la opción (escrituras)
// el guard no cambia. Mismo patrón que dte-api-context.
// ─────────────────────────────────────────────────────────────────

describe("getSaleApiContext — location activa en Dedicated Runtime (lectura de venta)", () => {
  const runtimeClient = { __runtimeFakeClient: true };
  const tenantWideRuntimeUser = {
    id: "user-1",
    role: "super_admin",
    tenant_id: "tenant-RT",
    location_id: null,
    auth_scope: "RUNTIME_CLIENT",
    organization_id: "org-1",
  };

  function runtimeContextWithoutLocation(runtimeMode = "RUNTIME_CLIENT") {
    return {
      context: {
        tenantId: "tenant-RT",
        locationId: null,
        client: runtimeClient,
        runtime: null,
        runtimeMode,
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

  it("cookie válida en runtime → ok con location_id resuelta y client runtime", async () => {
    authMock.mockResolvedValue({ user: tenantWideRuntimeUser });
    resolveEffectiveApiContextMock.mockResolvedValue(runtimeContextWithoutLocation());

    const result = await getSaleApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

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

    await getSaleApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

    expect(vi.mocked(getLocationById)).toHaveBeenCalledWith("loc-central", "tenant-RT", runtimeClient);
  });

  it("sin cookie → mantiene el guard 409", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
    authMock.mockResolvedValue({ user: tenantWideRuntimeUser });
    resolveEffectiveApiContextMock.mockResolvedValue(runtimeContextWithoutLocation());

    const result = await getSaleApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toBe("Selecciona una location activa para operar con ventas.");
    }
  });

  it("cookie con location inexistente en la DB runtime → mantiene el guard 409", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: "loc-otro-tenant" }) } as never);
    authMock.mockResolvedValue({ user: tenantWideRuntimeUser });
    resolveEffectiveApiContextMock.mockResolvedValue(runtimeContextWithoutLocation());

    const result = await getSaleApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("sin la opción (handlers de escritura) → comportamiento previo intacto, 409", async () => {
    authMock.mockResolvedValue({ user: tenantWideRuntimeUser });
    const handle = runtimeContextWithoutLocation();
    resolveEffectiveApiContextMock.mockResolvedValue(handle);

    const result = await getSaleApiContext(fakeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(handle.dispose).toHaveBeenCalled();
  });

  it("PLATFORM_NATIVE con la opción → no aplica fallback runtime (sin cambios)", async () => {
    authMock.mockResolvedValue({ user: { ...tenantWideRuntimeUser, auth_scope: "PLATFORM" } });
    resolveEffectiveApiContextMock.mockResolvedValue(runtimeContextWithoutLocation("PLATFORM_NATIVE"));

    const result = await getSaleApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("PLATFORM_NATIVE con location en JWT → sin regresión", async () => {
    authMock.mockResolvedValue({ user: { ...tenantWideRuntimeUser, auth_scope: "PLATFORM", location_id: "loc-jwt" } });
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: { ...runtimeContextWithoutLocation("PLATFORM_NATIVE").context, locationId: "loc-jwt" },
      dispose: vi.fn(),
    });

    const result = await getSaleApiContext(fakeRequest(), { resolveRuntimeActiveLocation: true });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.location_id).toBe("loc-jwt");
  });
});
