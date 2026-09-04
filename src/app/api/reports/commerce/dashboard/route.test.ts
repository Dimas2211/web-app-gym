// ─────────────────────────────────────────────────────────────────
// api/reports/commerce/dashboard — route.test.ts
//
// Bloque B (cierre reporting) — reporte COMPUESTO (commerce.sales +
// commerce.purchases). Escenario C del cierre de module enforcement:
// commerce.sales habilitado + commerce.purchases deshabilitado ->
// las secciones de ventas están presentes, las secciones de compras
// quedan en null (no disponibles), y las queries de compras
// idealmente no se ejecutan.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  authMock,
  getEffectiveLocationIdMock,
  getCommerceReportSummarySpy,
  getSalesByPeriodSpy,
  getPurchasesByPeriodSpy,
  getTopSoldProductsSpy,
  getTopSoldServicesSpy,
  getServiceSalesDistributionSpy,
  getProductVsServiceSalesSpy,
  getPurchasesBySupplierSpy,
  resolveCommercialEnforcementContextMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getEffectiveLocationIdMock: vi.fn(async () => "loc-1"),
  getCommerceReportSummarySpy: vi.fn(async () => ({ total_sales: 100 })),
  getSalesByPeriodSpy: vi.fn(async () => [{ date: "2026-01-01", total: 10 }]),
  getPurchasesByPeriodSpy: vi.fn(async () => [{ date: "2026-01-01", total: 5 }]),
  getTopSoldProductsSpy: vi.fn(async () => []),
  getTopSoldServicesSpy: vi.fn(async () => []),
  getServiceSalesDistributionSpy: vi.fn(async () => []),
  getProductVsServiceSalesSpy: vi.fn(async () => ({ products_total: 0, services_total: 0 })),
  getPurchasesBySupplierSpy: vi.fn(async () => []),
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/location/active-location", () => ({ getEffectiveLocationId: getEffectiveLocationIdMock }));
vi.mock("@/modules/commerce/reports/queries/get-commerce-report-summary", () => ({
  getCommerceReportSummary: getCommerceReportSummarySpy,
}));
vi.mock("@/modules/commerce/reports/queries/get-sales-by-period", () => ({ getSalesByPeriod: getSalesByPeriodSpy }));
vi.mock("@/modules/commerce/reports/queries/get-purchases-by-period", () => ({
  getPurchasesByPeriod: getPurchasesByPeriodSpy,
}));
vi.mock("@/modules/commerce/reports/queries/get-top-sold-products", () => ({
  getTopSoldProducts: getTopSoldProductsSpy,
}));
vi.mock("@/modules/commerce/reports/queries/get-top-sold-services", () => ({
  getTopSoldServices: getTopSoldServicesSpy,
}));
vi.mock("@/modules/commerce/reports/queries/get-service-sales-distribution", () => ({
  getServiceSalesDistribution: getServiceSalesDistributionSpy,
}));
vi.mock("@/modules/commerce/reports/queries/get-product-vs-service-sales", () => ({
  getProductVsServiceSales: getProductVsServiceSalesSpy,
}));
vi.mock("@/modules/commerce/reports/queries/get-purchases-by-supplier", () => ({
  getPurchasesBySupplier: getPurchasesBySupplierSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

import { GET } from "./route";

const SESSION_USER = { id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" };

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/reports/commerce/dashboard?date_from=2026-01-01&date_to=2026-01-31");
}

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue({ user: SESSION_USER });
  getEffectiveLocationIdMock.mockClear();
  getCommerceReportSummarySpy.mockClear();
  getSalesByPeriodSpy.mockClear();
  getPurchasesByPeriodSpy.mockClear();
  getTopSoldProductsSpy.mockClear();
  getTopSoldServicesSpy.mockClear();
  getServiceSalesDistributionSpy.mockClear();
  getProductVsServiceSalesSpy.mockClear();
  getPurchasesBySupplierSpy.mockClear();
  resolveCommercialEnforcementContextMock.mockReset();
});

describe("GET /api/reports/commerce/dashboard — filtrado por módulos efectivos (reporte compuesto)", () => {
  it("C) commerce.sales habilitado + commerce.purchases deshabilitado -> secciones de ventas presentes, secciones de compras null y sus queries NO se ejecutan", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map([["commerce.sales", { enabled: true, source: "PLAN" }]]),
      effectiveEntitlements: new Map(),
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);

    // secciones de ventas: presentes, queries ejecutadas
    expect(body.sales_by_period).not.toBeNull();
    expect(getSalesByPeriodSpy).toHaveBeenCalledTimes(1);
    expect(getTopSoldProductsSpy).toHaveBeenCalled();
    expect(getTopSoldServicesSpy).toHaveBeenCalled();
    expect(getServiceSalesDistributionSpy).toHaveBeenCalledTimes(1);
    expect(getProductVsServiceSalesSpy).toHaveBeenCalledTimes(1);

    // secciones de compras: no disponibles, queries NUNCA ejecutadas
    expect(body.purchases_by_period).toBeNull();
    expect(body.purchases_by_supplier).toBeNull();
    expect(getPurchasesByPeriodSpy).not.toHaveBeenCalled();
    expect(getPurchasesBySupplierSpy).not.toHaveBeenCalled();

    // summary mezcla ambos dominios -> no se calcula si falta un lado
    expect(body.summary).toBeNull();
    expect(getCommerceReportSummarySpy).not.toHaveBeenCalled();

    expect(body._module_availability).toEqual({
      "commerce.sales": true,
      "commerce.purchases": false,
    });
  });
});
