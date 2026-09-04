// ─────────────────────────────────────────────────────────────────
// api/reports/commerce/sales-list — route.test.ts
//
// Bloque B (cierre reporting) — reporte de un solo dominio
// (commerce.sales). Escenarios A/B/D del cierre de module enforcement
// para /api/reports/**:
//   A) commerce.sales deshabilitado -> 403, getSalesListReport NUNCA
//      se invoca (la query de negocio no se ejecuta).
//   B) commerce.sales habilitado -> 200, getSalesListReport se invoca.
//   D) LEGACY_UNMANAGED -> bypass mantenido, getSalesListReport se
//      invoca igual que en un tenant MANAGED con el módulo habilitado.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { authMock, getEffectiveLocationIdMock, getSalesListReportSpy, resolveCommercialEnforcementContextMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    getEffectiveLocationIdMock: vi.fn(async () => "loc-1"),
    getSalesListReportSpy: vi.fn(async () => [{ sale_id: "s1" }]),
    resolveCommercialEnforcementContextMock: vi.fn(),
  }));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/location/active-location", () => ({ getEffectiveLocationId: getEffectiveLocationIdMock }));
vi.mock("@/modules/commerce/reports/queries/get-sales-list-report", () => ({
  getSalesListReport: getSalesListReportSpy,
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
  return new NextRequest("http://localhost/api/reports/commerce/sales-list?date_from=2026-01-01&date_to=2026-01-31");
}

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue({ user: SESSION_USER });
  getEffectiveLocationIdMock.mockClear();
  getSalesListReportSpy.mockClear();
  resolveCommercialEnforcementContextMock.mockReset();
});

describe("GET /api/reports/commerce/sales-list — module enforcement (commerce.sales)", () => {
  it("A) commerce.sales deshabilitado -> 403, getSalesListReport NUNCA se invoca", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "MANAGED",
      tenantId: "tenant-1",
      organizationId: "org-1",
      planId: "plan-1",
      verticalId: null,
      effectiveModules: new Map(),
      effectiveEntitlements: new Map(),
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(getSalesListReportSpy).not.toHaveBeenCalled();
  });

  it("B) commerce.sales habilitado -> 200, getSalesListReport se invoca", async () => {
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

    expect(res.status).toBe(200);
    expect(getSalesListReportSpy).toHaveBeenCalledTimes(1);
  });

  it("D) LEGACY_UNMANAGED -> bypass mantenido, getSalesListReport se invoca", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue({
      mode: "LEGACY_UNMANAGED",
      tenantId: "tenant-1",
      organizationId: null,
      planId: null,
      verticalId: null,
      effectiveModules: new Map(),
      effectiveEntitlements: new Map(),
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(getSalesListReportSpy).toHaveBeenCalledTimes(1);
  });
});
