// ─────────────────────────────────────────────────────────────────
// platform/actions — get-client-view-data.action.test.ts
//
// SHARED-PILOT-3. Antes de esta fase, "Entrar como cliente" no filtraba
// NINGUNA query por tenant_id (ni siquiera tenía un guard de tenant
// ausente) — exponía Gym/Branch/User/productos/ventas/DTE/caja de
// TODOS los tenants físicos de la base a cualquier super_admin. Estos
// tests fijan el contrato fail-closed nuevo: sin tenant_id vinculado,
// error TENANT_BINDING_REQUIRED sin abrir conexión runtime; con
// tenant_id vinculado, aislamiento estricto por tenant en una DB
// compartida (Shared Runtime).
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

const withRuntimePrismaForInspectionMock = vi.fn();
vi.mock("../runtime/runtime-database-router", () => ({
  withRuntimePrismaForInspection: (...args: unknown[]) =>
    withRuntimePrismaForInspectionMock(...args),
}));

import { getClientViewDataAction } from "./get-client-view-data.action";

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
  const products = [
    { id: "p-a", tenant_id: TENANT_A, product_code: "A1", name: "Prod A", sku: null, status: "active", sale_price: "1", created_at: new Date() },
    { id: "p-b", tenant_id: TENANT_B, product_code: "B1", name: "Prod B", sku: null, status: "active", sale_price: "2", created_at: new Date() },
  ];
  const sales = [
    { id: "sale-a", tenant_id: TENANT_A, sale_code: "A-0001", status: "CONFIRMED", total_amount: "10.00", created_at: new Date() },
    { id: "sale-b", tenant_id: TENANT_B, sale_code: "B-0001", status: "CONFIRMED", total_amount: "999.00", created_at: new Date() },
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
    product: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => byTenant(products, where)),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(products, where).length),
    },
    customer: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    supplier: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    sale: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => byTenant(sales, where)),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(sales, where).length),
    },
    dteOutgoingDocument: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    dteIssuerConfig: { findFirst: vi.fn(async () => null) },
    cashRegister: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
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

describe("getClientViewDataAction — Shared DB tenant isolation", () => {
  it("organización vinculada a tenant A: solo ve datos de A, nunca de B", async () => {
    findUniqueProfileMock.mockResolvedValue({
      id: "profile-a",
      label: "Perfil A",
      db_host: "host",
      db_port: 5432,
      db_name: "db",
      environment: "PRODUCTION",
      organization: { name: "Cliente A", tenant_id: TENANT_A },
    });
    const client = buildSharedClient();
    withRuntimePrismaForInspectionMock.mockImplementation((_profileId, cb) => cb(client));

    const result = await getClientViewDataAction("profile-a");

    expect(result.success).toBe(true);
    expect(result.tenant?.id).toBe(TENANT_A);
    expect(result.locations).toEqual([{ id: "loc-a1", name: "Loc A1", status: "active" }]);
    expect(result.products.map((p) => p.id)).toEqual(["p-a"]);
    expect(result.sales.map((s) => s.id)).toEqual(["sale-a"]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT_B);
    expect(serialized).not.toContain("loc-b1");
    expect(serialized).not.toContain("sale-b");
    expect(serialized).not.toContain("999.00");
  });

  it("organización sin tenant_id vinculado: FAIL CLOSED, no abre conexión runtime ni expone datos", async () => {
    findUniqueProfileMock.mockResolvedValue({
      id: "profile-unbound",
      label: "Perfil sin bind",
      db_host: "host",
      db_port: 5432,
      db_name: "db",
      environment: "PRODUCTION",
      organization: { name: "Nuevo Cliente", tenant_id: null },
    });

    const result = await getClientViewDataAction("profile-unbound");

    expect(result.success).toBe(false);
    expect(result.error).toContain("TENANT_BINDING_REQUIRED");
    // Nunca se abrió la conexión runtime hacia la base cliente.
    expect(withRuntimePrismaForInspectionMock).not.toHaveBeenCalled();
  });
});
