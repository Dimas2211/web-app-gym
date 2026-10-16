// ─────────────────────────────────────────────────────────────────
// commerce/shared — reception-pages-access.test.ts
//
// Casos 1-3, 11, 13, 15, 19, 22: acceso directo por URL a
// /dashboard/sales, /dashboard/sales/new y /dashboard/cash.
// Server Components invocados directamente con dependencias mockeadas.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const h = vi.hoisted(() => ({
  jwtRole: "reception",
  liveRole: "reception",
  locationId: "loc-REC" as string | null,
  moduleEnabled: true,
  assignedBranch: "loc-REC" as string | null,
  RUNTIME: { __runtime: true } as Record<string, unknown>,
  listSales: vi.fn(async () => ({ items: [], total: 0 })),
  workspace: vi.fn(),
}));

function redirectError(url: string) {
  return Object.assign(new Error("NEXT_REDIRECT"), { url });
}

vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw redirectError(url); }) }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("Prisma global NO debe usarse"); } }),
}));
vi.mock("@/lib/permissions/guards", () => ({
  requireCommerceOperator: vi.fn(async () => {
    if (!["super_admin", "branch_admin", "reception"].includes(h.jwtRole)) throw redirectError("/dashboard");
    return { id: "u1", role: h.jwtRole, tenant_id: "tenant-A", location_id: h.locationId, auth_scope: "RUNTIME_CLIENT" };
  }),
}));
vi.mock("@/lib/location/active-location", () => ({ getEffectiveLocationId: vi.fn(async () => "loc-COOKIE") }));
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveTenantContext: vi.fn(async () => ({
    context: {
      tenantId: "tenant-A",
      client: h.RUNTIME,
      runtime: null,
      locationId: h.locationId,
      runtimeMode: "RUNTIME_CLIENT",
      readOnly: false,
      effectiveRole: h.liveRole,
    },
    dispose: vi.fn(async () => {}),
  })),
  resolveRuntimeFirstLocationId: vi.fn(async () => "loc-PRIMERA"),
}));
vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  requireOrganizationModule: vi.fn(async () => {
    if (!h.moduleEnabled) throw redirectError("/dashboard?commercial_error=module_not_enabled");
    return {};
  }),
}));
vi.mock("@/modules/commerce/sales/queries/list-sales", () => ({ listSales: h.listSales }));
vi.mock("@/modules/commerce/cash/queries/list-cash-registers", () => ({ listCashRegisters: vi.fn(async () => []) }));
vi.mock("@/modules/commerce/sales/components/sales-client", () => ({ SalesClient: () => null }));
vi.mock("@/modules/commerce/sales/components/sale-new-client", () => ({ SaleNewClient: () => null }));
vi.mock("@/modules/commerce/cash/components/cash-client", () => ({ CashClient: () => null }));
vi.mock("@/modules/commerce/dte/queries/list-dte-catalog-items", () => ({ listDteCatalogItems: vi.fn(async () => []) }));
vi.mock("@/core/modules/locations/queries", () => ({ getLocationById: vi.fn(async () => ({ name: "Sucursal REC" })) }));
vi.mock("@/modules/commerce/sales/queries/get-sale-detail-by-id", () => ({ getSaleDetailById: vi.fn(async () => null) }));
vi.mock("@/modules/commerce/sales/export/services/sales-export-availability", () => ({
  resolveSalesExportAvailability: vi.fn(async () => ({ enabled: false })),
}));
vi.mock("@/core/security/operational-authorization/operational-authorization", () => ({
  checkOperationalGrant: vi.fn(async () => ({ ok: false, error: "sin grant" })),
}));
vi.mock("@/modules/commerce/cash/actions/get-cash-workspace-state.action", () => ({
  getCashWorkspaceStateAction: h.workspace,
}));

import SalesPage from "@/app/(dashboard)/dashboard/sales/page";
import NewSalePage from "@/app/(dashboard)/dashboard/sales/new/page";
import CashPage from "@/app/(dashboard)/dashboard/cash/page";

// Tabla `users` sintética de la DB runtime: asignación actual (User.branch_id).
const userFindFirst = vi.fn(async ({ where }: { where: { id: string; tenant_id: string } }) =>
  where.id === "u1" && where.tenant_id === "tenant-A" ? { branch_id: h.assignedBranch } : null,
);
h.RUNTIME.user = { findFirst: userFindFirst };

beforeEach(() => {
  Object.assign(h, {
    jwtRole: "reception",
    liveRole: "reception",
    locationId: "loc-REC",
    moduleEnabled: true,
    assignedBranch: "loc-REC",
  });
  userFindFirst.mockClear();
  h.listSales.mockClear();
});

describe("/dashboard/sales", () => {
  it("reception entra; lista SOLO su sucursal; acciones fiscales DTE ocultas", async () => {
    const el = (await SalesPage()) as ReactElement<{ canManageFiscalDte: boolean }>;
    expect(el.props.canManageFiscalDte).toBe(false);
    expect(h.listSales).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-A", location_id: "loc-REC" }),
      h.RUNTIME,
    );
  });

  it("branch_admin conserva las acciones fiscales", async () => {
    h.jwtRole = h.liveRole = "branch_admin";
    const el = (await SalesPage()) as ReactElement<{ canManageFiscalDte: boolean }>;
    expect(el.props.canManageFiscalDte).toBe(true);
  });

  it("rol LIVE trainer → redirect /dashboard sin consultar ventas", async () => {
    h.liveRole = "trainer";
    await expect(SalesPage()).rejects.toMatchObject({ url: "/dashboard" });
    expect(h.listSales).not.toHaveBeenCalled();
  });

  it.each(["trainer", "client"])("JWT %s → redirect /dashboard", async (role) => {
    h.jwtRole = h.liveRole = role;
    await expect(SalesPage()).rejects.toMatchObject({ url: "/dashboard" });
  });

  it("commerce.sales deshabilitado → bloquea", async () => {
    h.moduleEnabled = false;
    await expect(SalesPage()).rejects.toMatchObject({ url: "/dashboard?commercial_error=module_not_enabled" });
    expect(h.listSales).not.toHaveBeenCalled();
  });
});

describe("/dashboard/sales/new", () => {
  const params = (sale_id?: string) => ({ searchParams: Promise.resolve(sale_id ? { sale_id } : {}) });

  it("reception entra a capturar una venta nueva", async () => {
    const el = (await NewSalePage(params())) as ReactElement<{ locationName?: string }>;
    expect(el.props.locationName).toBe("Sucursal REC");
  });

  it("URL directa con sale_id sin grant → redirect (ownership/clave intactos)", async () => {
    await expect(NewSalePage(params("sale-x"))).rejects.toMatchObject({ url: "/dashboard/sales?auth=required" });
  });

  it("commerce.sales deshabilitado → bloquea la URL directa de captura", async () => {
    h.moduleEnabled = false;
    await expect(NewSalePage(params())).rejects.toMatchObject({ url: "/dashboard?commercial_error=module_not_enabled" });
  });

  it("rol LIVE client → redirect /dashboard", async () => {
    h.liveRole = "client";
    await expect(NewSalePage(params())).rejects.toMatchObject({ url: "/dashboard" });
  });
});

describe("/dashboard/cash", () => {
  it("pasa los permisos efectivos del servidor a CashClient", async () => {
    h.workspace.mockResolvedValueOnce({
      ok: true,
      data: { registers: [], selected_register: null, open_session: null },
      permissions: { canAdministerRegisters: false },
    });
    const el = (await CashPage()) as ReactElement<{ permissions: { canAdministerRegisters: boolean } }>;
    expect(el.props.permissions).toEqual({ canAdministerRegisters: false });
  });
});

describe("páginas — sucursal fija vigente (User.branch_id)", () => {
  const params = () => ({ searchParams: Promise.resolve({}) });

  it("reception reasignada a B con JWT A → /dashboard/sales redirige sin listar ventas de A", async () => {
    h.assignedBranch = "loc-B";
    await expect(SalesPage()).rejects.toMatchObject({ url: "/dashboard" });
    expect(h.listSales).not.toHaveBeenCalled();
  });

  it("reception reasignada → /dashboard/sales/new redirige", async () => {
    h.assignedBranch = "loc-B";
    await expect(NewSalePage(params())).rejects.toMatchObject({ url: "/dashboard" });
  });

  it("branch_admin reasignado → /dashboard/sales redirige", async () => {
    h.jwtRole = h.liveRole = "branch_admin";
    h.assignedBranch = "loc-B";
    await expect(SalesPage()).rejects.toMatchObject({ url: "/dashboard" });
  });

  it("cuenta sin sucursal asignada → redirige", async () => {
    h.assignedBranch = null;
    await expect(SalesPage()).rejects.toMatchObject({ url: "/dashboard" });
  });

  it("reception vigente → la asignación se valida en la DB runtime del tenant efectivo", async () => {
    await SalesPage();
    expect(userFindFirst).toHaveBeenCalledWith({ where: { id: "u1", tenant_id: "tenant-A" }, select: { branch_id: true } });
  });

  it("super_admin → sin consulta de asignación", async () => {
    h.jwtRole = h.liveRole = "super_admin";
    await SalesPage();
    expect(userFindFirst).not.toHaveBeenCalled();
  });
});
