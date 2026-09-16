// ─────────────────────────────────────────────────────────────────
// api/products/units-lookup — route.test.ts
//
// FASE VI-D9: certifica el fix del blocker non-DTE detectado en VI-D8
// ("units-lookup llama getUnitsLookup() sin client, cae al Prisma
// global por default"). UnitOfMeasure se seed-ea por DB runtime con
// id = uuid (no fijo entre bases) — Product.unit_id referencia
// UnitOfMeasure.id de la MISMA DB física. Certifica que para
// auth_scope=RUNTIME_CLIENT:
//   - se pasa `user` (sesión) a resolveEffectiveApiContext (segundo
//     argumento) — nunca se omite;
//   - getUnitsLookup recibe context.client (el PrismaClient runtime),
//     nunca el Prisma global importado por el módulo;
//   - nunca cae a PLATFORM_NATIVE por omisión de `user`.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth/auth", () => ({ auth: () => authMock() }));

const resolveEffectiveApiContextMock = vi.fn();
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveApiContext: (...args: unknown[]) => resolveEffectiveApiContextMock(...args),
}));

const RUNTIME_CLIENT_PRISMA_MARKER = Symbol("runtime-client-prisma");
const getUnitsLookupMock = vi.fn(async (..._args: unknown[]) => [
  { id: "unit-1", name: "Kilogramo", symbol: "kg" },
]);
vi.mock("@/modules/commerce/products/queries/lookups/get-units-lookup", () => ({
  getUnitsLookup: (...args: unknown[]) => getUnitsLookupMock(...args),
}));

import { GET } from "./route";

const SESSION_USER = {
  id: "user-1",
  role: "branch_admin",
  tenant_id: "tenant-JWT-RAW",
  location_id: "location-A1",
  auth_scope: "RUNTIME_CLIENT",
  organization_id: "org-1",
};

beforeEach(() => {
  authMock.mockReset();
  resolveEffectiveApiContextMock.mockReset();
  getUnitsLookupMock.mockClear();
});

describe("GET /api/products/units-lookup — RUNTIME_CLIENT usa contexto efectivo", () => {
  it("pasa `user` a resolveEffectiveApiContext y getUnitsLookup recibe el client runtime, nunca Prisma global", async () => {
    authMock.mockResolvedValue({ user: SESSION_USER });

    const disposeMock = vi.fn();
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: {
        tenantId: "tenant-RUNTIME-EFFECTIVE",
        locationId: "location-A1",
        client: { __marker: RUNTIME_CLIENT_PRISMA_MARKER },
        runtime: {},
        runtimeMode: "RUNTIME_CLIENT",
        readOnly: false,
        effectiveRole: "branch_admin",
      },
      dispose: disposeMock,
    });

    const res = await GET();

    expect(res.status).toBe(200);

    // Nunca omite `user` — segundo argumento presente y con auth_scope RUNTIME_CLIENT.
    expect(resolveEffectiveApiContextMock).toHaveBeenCalledTimes(1);
    const [baseArg, passedUser] = resolveEffectiveApiContextMock.mock.calls[0];
    expect(passedUser).toBeDefined();
    expect(passedUser).toMatchObject({ auth_scope: "RUNTIME_CLIENT", organization_id: "org-1" });
    expect(baseArg).toMatchObject({ tenantId: SESSION_USER.tenant_id });

    // getUnitsLookup recibe EXACTAMENTE el PrismaClient runtime (context.client),
    // nunca el Prisma global importado por el módulo.
    expect(getUnitsLookupMock).toHaveBeenCalledTimes(1);
    const [clientArg] = getUnitsLookupMock.mock.calls[0];
    expect(clientArg).toMatchObject({ __marker: RUNTIME_CLIENT_PRISMA_MARKER });

    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("deniega 403 si el rol no está en ALLOWED_ROLES, sin resolver contexto ni tocar la DB", async () => {
    authMock.mockResolvedValue({ user: { ...SESSION_USER, role: "trainer" } });

    const res = await GET();

    expect(res.status).toBe(403);
    expect(resolveEffectiveApiContextMock).not.toHaveBeenCalled();
    expect(getUnitsLookupMock).not.toHaveBeenCalled();
  });

  it("deniega 401 si no hay sesión, sin resolver contexto ni tocar la DB", async () => {
    authMock.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(resolveEffectiveApiContextMock).not.toHaveBeenCalled();
    expect(getUnitsLookupMock).not.toHaveBeenCalled();
  });
});
