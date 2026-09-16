// ─────────────────────────────────────────────────────────────────
// api/purchases — purchase-api-context.test.ts
//
// FASE VI-D6: certifica el hallazgo crítico del audit transversal —
// getPurchaseApiContext() ahora SIEMPRE pasa `user` como segundo
// argumento a resolveEffectiveApiContext(). Antes se omitía, y una
// identidad RUNTIME_CLIENT caía silenciosamente al branch
// PLATFORM_NATIVO (Prisma global + tenant_id de JWT sin revalidar) en
// vez de fallar cerrado vía requireRuntimeOrganizationContext.
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

import { getPurchaseApiContext } from "./purchase-api-context";

function fakeRequest(): never {
  return {
    cookies: { get: () => undefined },
    headers: { get: () => "" },
  } as never;
}

describe("getPurchaseApiContext — propagación de `user` a resolveEffectiveApiContext", () => {
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

    const result = await getPurchaseApiContext(fakeRequest());

    expect(resolveEffectiveApiContextMock).toHaveBeenCalledTimes(1);
    const [, passedUser] = resolveEffectiveApiContextMock.mock.calls[0];
    expect(passedUser).toBeDefined();
    expect(passedUser).toMatchObject({ auth_scope: "RUNTIME_CLIENT", organization_id: "org-1" });
    expect(result.ok).toBe(true);
  });

  it("deniega si el ROL LIVE (context.effectiveRole) ya no califica, aunque el JWT tuviera un rol habilitado", async () => {
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

    const result = await getPurchaseApiContext(fakeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});
