// ─────────────────────────────────────────────────────────────────
// platform/actions — get-support-session-data.action.test.ts
//
// SHARED-PILOT-3. Antes de esta fase, Support Session exigía
// organization.tenant_id (MISSING_TENANT guard) pero nunca lo usaba
// para filtrar las queries — leía Gym/Branch/User/ventas/DTE/caja sin
// filtro, exponiendo datos de otros tenants en una DB compartida
// (Shared Runtime). Estos tests fijan el contrato de aislamiento
// estricto por tenant_id.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn().mockResolvedValue({ id: "admin-1", role: "super_admin" }),
}));

vi.mock("@/lib/security/encryption", () => ({
  assertEncryptionAvailable: vi.fn(),
}));

const findUniqueProfileMock = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    platformDatabaseProfile: {
      findUnique: (...args: unknown[]) => findUniqueProfileMock(...args),
    },
  },
}));

const withRuntimePrismaMock = vi.fn();
vi.mock("../runtime/runtime-database-router", () => ({
  withRuntimePrisma: (...args: unknown[]) => withRuntimePrismaMock(...args),
}));

vi.mock("@/modules/commerce/products/queries/get-products", () => ({
  getProducts: vi.fn(async () => ({ total: 0, items: [] })),
}));
vi.mock("@/modules/commerce/customers/queries/list-customers", () => ({
  listCustomers: vi.fn(async () => ({ total: 0, items: [] })),
}));
vi.mock("@/modules/commerce/suppliers/queries/get-suppliers", () => ({
  getSuppliers: vi.fn(async () => ({ total: 0, items: [] })),
}));
vi.mock("@/modules/commerce/inventory/queries/get-product-locations", () => ({
  getProductLocations: vi.fn(async () => ({ total: 0, items: [] })),
}));

import { getSupportSessionDataAction } from "./get-support-session-data.action";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

function buildSharedClient() {
  const runtimeTenants = [
    { id: TENANT_A, name: "Cliente A", slug: "cliente-a", status: "active" },
    { id: TENANT_B, name: "Cliente B", slug: "cliente-b", status: "active" },
  ];
  const branches = [
    { id: "loc-a1", tenant_id: TENANT_A, name: "Loc A1", status: "active" },
    { id: "loc-b1", tenant_id: TENANT_B, name: "Loc B1", status: "active" },
  ];
  const sales = [
    { id: "sale-a", tenant_id: TENANT_A, sale_code: "A-0001", sale_date: new Date(), status: "CONFIRMED", payment_status: "PAID", total_amount: "10.00", customer: null },
    { id: "sale-b", tenant_id: TENANT_B, sale_code: "B-0001", sale_date: new Date(), status: "CONFIRMED", payment_status: "PAID", total_amount: "999.00", customer: null },
  ];

  const byTenant = <T extends { tenant_id?: string }>(rows: T[], where: Record<string, unknown> | undefined) => {
    const tenantId = where?.tenant_id as string | undefined;
    if (!tenantId) return rows;
    return rows.filter((r) => r.tenant_id === tenantId);
  };

  return {
    runtimeTenant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        runtimeTenants.find((t) => t.id === where.id) ?? null),
      count: vi.fn(async () => runtimeTenants.length),
    },
    branch: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => byTenant(branches, where)),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(branches, where).length),
    },
    user: { count: vi.fn(async () => 1) },
    sale: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => byTenant(sales, where)),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(sales, where).length),
    },
    dteOutgoingDocument: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    dteIssuerConfig: { findFirst: vi.fn(async () => null) },
    tenantFiscalConfig: { findUnique: vi.fn(async () => null) },
    cashRegister: { count: vi.fn(async () => 0) },
    cashSession: { findMany: vi.fn(async () => []) },
    unitOfMeasure: { count: vi.fn(async () => 3) },
    productCategory: { count: vi.fn(async () => 0) },
    identificationType: { count: vi.fn(async () => 3) },
    economicActivity: { count: vi.fn(async () => 3) },
    municipality: { count: vi.fn(async () => 3) },
    dteCatalogItem: { count: vi.fn(async () => 3) },
    taxRate: { count: vi.fn(async () => 0) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSupportSessionDataAction — Shared DB tenant isolation", () => {
  it("organización vinculada a tenant A: solo ve datos de A, nunca de B", async () => {
    findUniqueProfileMock.mockResolvedValue({
      id: "profile-a",
      label: "Perfil A",
      db_host: "host", db_port: 5432, db_name: "db", db_user: "u",
      encrypted_password: "enc", ssl_mode: "prefer", environment: "PRODUCTION",
      is_active: true, last_tested_at: null, last_test_status: null, last_test_message: null,
      organization: { id: "org-a", code: "A", name: "Cliente A", tenant_id: TENANT_A },
    });
    const client = buildSharedClient();
    withRuntimePrismaMock.mockImplementation((_opts, cb) => cb(client));

    const result = await getSupportSessionDataAction("profile-a");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.tenant?.id).toBe(TENANT_A);
    expect(result.locations).toEqual([{ id: "loc-a1", name: "Loc A1", status: "active" }]);
    expect(result.sales.map((s) => s.id)).toEqual(["sale-a"]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT_B);
    expect(serialized).not.toContain("loc-b1");
    expect(serialized).not.toContain("sale-b");
    expect(serialized).not.toContain("999.00");
  });

  it("organización sin tenant_id vinculado: MISSING_TENANT, no abre conexión runtime", async () => {
    findUniqueProfileMock.mockResolvedValue({
      id: "profile-unbound",
      label: "Perfil sin bind",
      db_host: "host", db_port: 5432, db_name: "db", db_user: "u",
      encrypted_password: "enc", ssl_mode: "prefer", environment: "PRODUCTION",
      is_active: true, last_tested_at: null, last_test_status: null, last_test_message: null,
      organization: { id: "org-x", code: "X", name: "Nuevo Cliente", tenant_id: null },
    });

    const result = await getSupportSessionDataAction("profile-unbound");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe("MISSING_TENANT");
    expect(withRuntimePrismaMock).not.toHaveBeenCalled();
  });
});
