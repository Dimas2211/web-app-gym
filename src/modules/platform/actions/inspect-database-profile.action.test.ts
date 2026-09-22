// ─────────────────────────────────────────────────────────────────
// platform/actions — inspect-database-profile.action.test.ts
//
// SHARED-PILOT-1 — GAP 1. Verifica que el Inspector, al inspeccionar
// el perfil de una organización vinculada a un tenant (Shared DB),
// nunca muestre datos tenant-owned de OTRO tenant presente en la
// misma base física.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions/guards", () => ({
  requireSuperAdmin: vi.fn().mockResolvedValue({ id: "admin-1", role: "super_admin" }),
}));

vi.mock("@/lib/security/encryption", () => ({
  assertEncryptionAvailable: vi.fn(),
}));

const findUniqueProfileMock = vi.fn();
vi.mock("../runtime/control-plane-prisma", () => ({
  controlPlanePrisma: {
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

import { inspectDatabaseProfileAction } from "./inspect-database-profile.action";

// ── Shared DB sintética con dos tenants físicos ────────────────────

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

function buildSharedClient() {
  const gyms = [
    { id: TENANT_A, name: "Cliente 3", slug: "cliente-3", status: "active", created_at: new Date("2026-01-01") },
    { id: TENANT_B, name: "Sentinel", slug: "sentinel", status: "active", created_at: new Date("2026-01-02") },
  ];
  const branches = [
    { id: "loc-a1", gym_id: TENANT_A, name: "Loc A1", status: "active" },
    { id: "loc-b1", gym_id: TENANT_B, name: "Loc B1", status: "active" },
  ];
  const users = [
    { id: "user-a1", gym_id: TENANT_A, first_name: "Ana", last_name: "A", email: "admin-a@example.com", role: "super_admin", created_at: new Date() },
    { id: "user-b1", gym_id: TENANT_B, first_name: "Beto", last_name: "B", email: "admin-b@example.com", role: "super_admin", created_at: new Date() },
  ];
  const products = [
    { id: "p-a", tenant_id: TENANT_A },
    { id: "p-b", tenant_id: TENANT_B },
  ];
  const customers = [
    { id: "c-a", tenant_id: TENANT_A },
    { id: "c-b", tenant_id: TENANT_B },
  ];
  const suppliers = [
    { id: "s-a", tenant_id: TENANT_A },
    { id: "s-b", tenant_id: TENANT_B },
  ];
  const sales = [
    { id: "sale-a", tenant_id: TENANT_A, sale_code: "A-0001", status: "CONFIRMED", total_amount: "10.00", created_at: new Date() },
    { id: "sale-b", tenant_id: TENANT_B, sale_code: "B-0001", status: "CONFIRMED", total_amount: "20.00", created_at: new Date() },
  ];
  const dteDocs = [
    { id: "dte-a", tenant_id: TENANT_A, dte_type_code: "01", dte_status: "PROCESSED", created_at: new Date() },
    { id: "dte-b", tenant_id: TENANT_B, dte_type_code: "01", dte_status: "PROCESSED", created_at: new Date() },
  ];
  const dteIssuers = [
    { id: "issuer-a", tenant_id: TENANT_A, is_active: true, nit: "NIT-A", name: "Issuer A", environment: "TEST", created_at: new Date() },
    { id: "issuer-b", tenant_id: TENANT_B, is_active: true, nit: "NIT-B", name: "Issuer B", environment: "TEST", created_at: new Date() },
  ];
  const cashRegisters = [
    { id: "cash-a", tenant_id: TENANT_A },
    { id: "cash-b", tenant_id: TENANT_B },
  ];
  const productCategories = [
    { id: "cat-a", tenant_id: TENANT_A },
    { id: "cat-b", tenant_id: TENANT_B },
  ];
  const taxRates = [
    { id: "tax-a", tenant_id: TENANT_A },
    { id: "tax-b", tenant_id: TENANT_B },
  ];

  const byTenant = <T extends { tenant_id?: string; gym_id?: string }>(rows: T[], where: Record<string, unknown> | undefined) => {
    const tenantId = (where?.tenant_id ?? where?.gym_id) as string | undefined;
    if (!tenantId) return rows;
    return rows.filter((r) => r.tenant_id === tenantId || r.gym_id === tenantId);
  };

  return {
    gym: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        gyms.find((g) => g.id === where.id) ?? null),
      findFirst: vi.fn(async () => [...gyms].sort((a, b) => a.created_at.getTime() - b.created_at.getTime())[0] ?? null),
      count: vi.fn(async () => gyms.length),
    },
    branch: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => byTenant(branches, where)),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(branches, where).length),
    },
    user: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => byTenant(users, where)),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(users, where).length),
    },
    product: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(products, where).length),
    },
    customer: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(customers, where).length),
    },
    supplier: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(suppliers, where).length),
    },
    sale: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(sales, where).length),
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => byTenant(sales, where)),
    },
    dteOutgoingDocument: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(dteDocs, where).length),
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => byTenant(dteDocs, where)),
    },
    dteIssuerConfig: {
      findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => byTenant(dteIssuers, where)[0] ?? null),
    },
    cashRegister: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(cashRegisters, where).length),
    },
    unitOfMeasure: { count: vi.fn(async () => 5) },
    productCategory: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(productCategories, where).length),
    },
    identificationType: { count: vi.fn(async () => 5) },
    economicActivity:   { count: vi.fn(async () => 5) },
    municipality:       { count: vi.fn(async () => 5) },
    dteCatalogItem:      { count: vi.fn(async () => 5) },
    taxRate: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => byTenant(taxRates, where).length),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inspectDatabaseProfileAction — Shared DB tenant isolation", () => {
  it("organización vinculada a tenant A: solo ve datos de A, nunca de B", async () => {
    findUniqueProfileMock.mockResolvedValue({
      id: "profile-a",
      label: "Perfil A",
      organization: { name: "Cliente 3", tenant_id: TENANT_A },
    });
    const client = buildSharedClient();
    withRuntimePrismaForInspectionMock.mockImplementation((_profileId, cb) => cb(client));

    const result = await inspectDatabaseProfileAction("profile-a");

    expect(result.success).toBe(true);
    expect(result.tenant?.id).toBe(TENANT_A);

    // ORGANIZATION_SCOPED — solo A
    expect(result.locations).toEqual([{ id: "loc-a1", name: "Loc A1", status: "active" }]);
    expect(result.admins.map((a) => a.id)).toEqual(["user-a1"]);
    expect(result.summary.locations).toBe(1);
    expect(result.summary.users).toBe(1);
    expect(result.summary.products).toBe(1);
    expect(result.summary.customers).toBe(1);
    expect(result.summary.suppliers).toBe(1);
    expect(result.summary.sales).toBe(1);
    expect(result.recentSales.map((s) => s.id)).toEqual(["sale-a"]);
    expect(result.summary.dteDocuments).toBe(1);
    expect(result.recentDte.map((d) => d.id)).toEqual(["dte-a"]);
    expect(result.dteConfig?.nit).toBe("NIT-A");
    expect(result.summary.cashRegisters).toBe(1);
    expect(result.catalogSummary.productCategories).toBe(1);
    expect(result.catalogSummary.taxRates).toBe(1);

    // Nunca aparece nada de tenant B
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT_B);
    expect(serialized).not.toContain("loc-b1");
    expect(serialized).not.toContain("user-b1");
    expect(serialized).not.toContain("sale-b");
    expect(serialized).not.toContain("dte-b");
    expect(serialized).not.toContain("NIT-B");

    // PHYSICAL_DB — summary.tenants representa la cuenta física, no debe confundirse con org-scoped
    expect(result.summary.tenants).toBe(2);

    // GLOBAL_REFERENCE — catálogos globales no se filtran
    expect(result.catalogSummary.unitsOfMeasure).toBe(5);
    expect(result.catalogSummary.identificationTypes).toBe(5);
    expect(result.catalogSummary.economicActivities).toBe(5);
    expect(result.catalogSummary.municipalities).toBe(5);
    expect(result.catalogSummary.dteCatalogItems).toBe(5);
  });

  it("organización vinculada a tenant B: solo ve datos de B, nunca de A", async () => {
    findUniqueProfileMock.mockResolvedValue({
      id: "profile-b",
      label: "Perfil B",
      organization: { name: "Sentinel", tenant_id: TENANT_B },
    });
    const client = buildSharedClient();
    withRuntimePrismaForInspectionMock.mockImplementation((_profileId, cb) => cb(client));

    const result = await inspectDatabaseProfileAction("profile-b");

    expect(result.tenant?.id).toBe(TENANT_B);
    expect(result.locations).toEqual([{ id: "loc-b1", name: "Loc B1", status: "active" }]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT_A);
    expect(serialized).not.toContain("loc-a1");
    expect(serialized).not.toContain("sale-a");
  });

  it("organización sin tenant_id vinculado (pre-binding): preserva comportamiento previo, sin inventar tenant", async () => {
    findUniqueProfileMock.mockResolvedValue({
      id: "profile-unbound",
      label: "Perfil sin bind",
      organization: { name: "Nuevo Cliente", tenant_id: null },
    });
    const client = buildSharedClient();
    withRuntimePrismaForInspectionMock.mockImplementation((_profileId, cb) => cb(client));

    const result = await inspectDatabaseProfileAction("profile-unbound");

    expect(result.tenantIdUsed).toBeNull();
    // Pre-binding: toma el primer gym físico (orden created_at asc) sin filtrar
    expect(result.tenant?.id).toBe(TENANT_A);
    // Sin filtro: ve ambos tenants físicos (comportamiento pre-binding preservado)
    expect(result.summary.locations).toBe(2);
    expect(result.summary.products).toBe(2);
  });
});
