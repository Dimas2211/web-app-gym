// ─────────────────────────────────────────────────────────────────
// api/products/categories-lookup — route.test.ts
//
// FASE VI-D8: cierra la cobertura de test faltante para el hallazgo de
// VI-D6/VI-D7 ("categories-lookup usa contexto efectivo" — certificado
// hasta ahora solo por inspección de código, nunca por test). Certifica
// que para auth_scope=RUNTIME_CLIENT:
//   - se pasa `user` (sesión) a resolveEffectiveApiContext (segundo
//     argumento) — nunca se omite;
//   - se resuelve RUNTIME_CLIENT (runtimeMode) y se usa ESE tenantId
//     efectivo (no el tenant_id crudo del JWT);
//   - getCategoriesLookup recibe context.client (el PrismaClient
//     runtime), nunca el Prisma global importado por el módulo;
//   - nunca cae a PLATFORM_NATIVE por omisión de `user` — si
//     resolveEffectiveApiContext no recibe user, no hay forma de
//     distinguir RUNTIME_CLIENT de PLATFORM, así que el test certifica
//     el WIRING (arg pasado), que es la única salvaguarda posible desde
//     este archivo.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth/auth", () => ({ auth: () => authMock() }));

const resolveEffectiveApiContextMock = vi.fn();
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveApiContext: (...args: unknown[]) => resolveEffectiveApiContextMock(...args),
}));

const RUNTIME_CLIENT_PRISMA_MARKER = Symbol("runtime-client-prisma");
const getCategoriesLookupMock = vi.fn(async (..._args: unknown[]) => [
  { id: "cat-1", code: "C1", name: "Categoria 1" },
]);
vi.mock("@/modules/commerce/products/queries/lookups/get-categories-lookup", () => ({
  getCategoriesLookup: (...args: unknown[]) => getCategoriesLookupMock(...args),
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
  getCategoriesLookupMock.mockClear();
});

describe("GET /api/products/categories-lookup — RUNTIME_CLIENT usa contexto efectivo", () => {
  it("pasa `user` a resolveEffectiveApiContext, resuelve RUNTIME_CLIENT y usa el tenant/client efectivos", async () => {
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

    // getCategoriesLookup recibe el tenantId EFECTIVO (de context, no el crudo del JWT)
    // y el PrismaClient runtime (context.client) — nunca el Prisma global.
    expect(getCategoriesLookupMock).toHaveBeenCalledTimes(1);
    const [tenantIdArg, clientArg] = getCategoriesLookupMock.mock.calls[0];
    expect(tenantIdArg).toBe("tenant-RUNTIME-EFFECTIVE");
    expect(clientArg).toMatchObject({ __marker: RUNTIME_CLIENT_PRISMA_MARKER });

    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("deniega 403 si el rol no está en ALLOWED_ROLES, sin resolver contexto ni tocar la DB", async () => {
    authMock.mockResolvedValue({ user: { ...SESSION_USER, role: "trainer" } });

    const res = await GET();

    expect(res.status).toBe(403);
    expect(resolveEffectiveApiContextMock).not.toHaveBeenCalled();
    expect(getCategoriesLookupMock).not.toHaveBeenCalled();
  });
});
