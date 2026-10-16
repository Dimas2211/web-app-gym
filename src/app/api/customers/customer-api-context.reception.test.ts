// ─────────────────────────────────────────────────────────────────
// api/customers — customer-api-context.reception.test.ts
//
// El lookup de clientes del selector de Ventas (/api/customers/search)
// es opt-in para operadores de Commerce (reception) y exige además el
// módulo commerce.sales. El resto de rutas de customers sigue exigiendo
// core.customers + canManageStaff (sin ampliar privilegios).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  class FakeCommercialEnforcementError extends Error {
    httpStatus = 403;
    constructor(public code: string, public userMessage: string) {
      super(userMessage);
    }
  }
  return {
    FakeCommercialEnforcementError,
    RUNTIME: { __runtime: true } as Record<string, unknown>,
    assignedBranch: "loc-REC" as string | null,
    liveRole: "reception",
    locationId: "loc-REC" as string | null,
    enabledModules: new Set(["core.customers", "commerce.sales"]),
    dispose: vi.fn(async () => {}),
    search: vi.fn(async () => [{ id: "c1" }]),
  };
});

vi.mock("@/lib/auth/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "u1", role: "reception", tenant_id: "tenant-A", location_id: "loc-REC", auth_scope: "RUNTIME_CLIENT" },
  })),
}));
vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  CommercialEnforcementError: h.FakeCommercialEnforcementError,
  assertOrganizationModule: vi.fn((_ctx: unknown, module: string) => {
    if (!h.enabledModules.has(module)) {
      throw new h.FakeCommercialEnforcementError("MODULE_NOT_ENABLED", `Módulo ${module} no habilitado.`);
    }
  }),
}));
vi.mock("@/modules/platform/runtime/require-operational-context", () => {
  class OperationalContextError extends Error {
    constructor(public code: string, public userMessage: string, public httpStatus: number) {
      super(userMessage);
    }
  }
  return {
    OperationalContextError,
    requireOperationalContext: vi.fn(async (_u: unknown, opts: { module?: string }) => {
      // Mismo contrato que el real: el módulo pedido se exige aquí.
      if (opts.module && !h.enabledModules.has(opts.module)) {
        throw new OperationalContextError("MODULE_DISABLED", `Módulo ${opts.module} no habilitado.`, 403);
      }
      return {
        context: {
          tenantId: "tenant-A",
          locationId: h.locationId,
          client: h.RUNTIME,
          readOnly: false,
          effectiveUser: { id: "u1", role: h.liveRole },
          commercialContext: { mode: "MANAGED" },
        },
        dispose: h.dispose,
      };
    }),
  };
});
vi.mock("@/modules/commerce/customers/queries/search-customers-for-sale", () => ({
  searchCustomersForSale: h.search,
}));

import { getCustomerApiContext } from "./customer-api-context";
import { GET as searchGET } from "./search/route";
import { GET as listGET, POST as createPOST } from "./route";
import { GET as detailGET, PATCH as detailPATCH } from "./[id]/route";

// Tabla `users` sintética de la DB runtime: asignación actual (User.branch_id).
h.RUNTIME.user = {
  findFirst: vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) =>
    where.id === "u1" && where.tenant_id === "tenant-A" ? { branch_id: h.assignedBranch } : null,
  ),
};

function req(url = "http://x/api/customers/search?q=ana") {
  return { nextUrl: new URL(url), json: async () => ({}) } as never;
}
const params = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  h.liveRole = "reception";
  h.locationId = "loc-REC";
  h.assignedBranch = "loc-REC";
  h.enabledModules = new Set(["core.customers", "commerce.sales"]);
  h.dispose.mockClear();
  h.search.mockClear();
});

describe("getCustomerApiContext — modo lookup de Ventas (allowCommerceOperator)", () => {
  it("reception + commerce.sales habilitado → ok, tenant y DB runtime efectivos", async () => {
    const r = await getCustomerApiContext({ allowCommerceOperator: true });
    expect(r).toMatchObject({ ok: true, tenant_id: "tenant-A", client: h.RUNTIME });
  });

  it("reception + commerce.sales deshabilitado → 403 y libera la DB runtime", async () => {
    h.enabledModules.delete("commerce.sales");
    const r = await getCustomerApiContext({ allowCommerceOperator: true });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(h.dispose).toHaveBeenCalled();
  });

  it("core.customers deshabilitado → sigue bloqueado", async () => {
    h.enabledModules.delete("core.customers");
    const r = await getCustomerApiContext({ allowCommerceOperator: true });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("reception sin sucursal → 403", async () => {
    h.locationId = null;
    const r = await getCustomerApiContext({ allowCommerceOperator: true });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it.each(["trainer", "client"])("rol LIVE %s → 403", async (role) => {
    h.liveRole = role;
    const r = await getCustomerApiContext({ allowCommerceOperator: true });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it.each(["super_admin", "branch_admin"])("%s conserva el lookup", async (role) => {
    h.liveRole = role;
    expect((await getCustomerApiContext({ allowCommerceOperator: true })).ok).toBe(true);
  });
});

describe("getCustomerApiContext — modo normal sin cambios", () => {
  it("reception → 403", async () => {
    const r = await getCustomerApiContext();
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(h.dispose).toHaveBeenCalled();
  });

  it.each(["super_admin", "branch_admin"])("%s → ok", async (role) => {
    h.liveRole = role;
    expect((await getCustomerApiContext()).ok).toBe(true);
  });

  it("no exige commerce.sales (gestión de clientes no depende de Ventas)", async () => {
    h.liveRole = "branch_admin";
    h.enabledModules.delete("commerce.sales");
    expect((await getCustomerApiContext()).ok).toBe(true);
  });
});

describe("rutas reales de customers con reception", () => {
  it("GET /api/customers/search → 200 con resultados del tenant en DB runtime", async () => {
    const res = await searchGET(req());
    expect(res.status).toBe(200);
    expect(h.search).toHaveBeenCalledWith("tenant-A", "ana", 20, h.RUNTIME);
  });

  it("GET /api/customers/search con commerce.sales deshabilitado → 403", async () => {
    h.enabledModules.delete("commerce.sales");
    const res = await searchGET(req());
    expect(res.status).toBe(403);
    expect(h.search).not.toHaveBeenCalled();
  });

  it.each([
    ["GET /api/customers", () => listGET(req("http://x/api/customers"))],
    ["POST /api/customers", () => createPOST(req("http://x/api/customers"))],
    ["GET /api/customers/:id", () => detailGET(req("http://x/api/customers/c1"), params)],
    ["PATCH /api/customers/:id", () => detailPATCH(req("http://x/api/customers/c1"), params)],
  ])("%s (administrativa) → 403", async (_n, run) => {
    const res = await run();
    expect(res.status).toBe(403);
  });
});

describe("lookup de Ventas — sucursal fija vigente (User.branch_id)", () => {
  it("reception reasignada a otra sucursal → 403 y libera la DB runtime", async () => {
    h.assignedBranch = "loc-B";
    const r = await getCustomerApiContext({ allowCommerceOperator: true });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(h.dispose).toHaveBeenCalled();
  });

  it("GET /api/customers/search con reception reasignada → 403 sin consultar clientes", async () => {
    h.assignedBranch = "loc-B";
    const res = await searchGET(req());
    expect(res.status).toBe(403);
    expect(h.search).not.toHaveBeenCalled();
  });

  it("cuenta sin sucursal asignada → 403", async () => {
    h.assignedBranch = null;
    expect((await getCustomerApiContext({ allowCommerceOperator: true })).ok).toBe(false);
  });

  it("modo normal (branch_admin) no se ve afectado por la asignación", async () => {
    h.liveRole = "branch_admin";
    h.assignedBranch = "loc-B";
    expect((await getCustomerApiContext()).ok).toBe(true);
  });
});
