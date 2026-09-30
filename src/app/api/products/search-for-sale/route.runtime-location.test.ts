// ─────────────────────────────────────────────────────────────────
// api/products/search-for-sale — route.runtime-location.test.ts
//
// FINAL-RUNTIME-CLOSURE: la búsqueda de productos para venta solicita la
// location activa runtime (opt-in de lectura) y busca con tenant/location/
// client del contexto efectivo. La semántica del fallback está cubierta
// en sale-api-context.test.ts.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const getSaleApiContextMock = vi.fn();
vi.mock("@/app/api/sales/sale-api-context", () => ({
  getSaleApiContext: (...args: unknown[]) => getSaleApiContextMock(...args),
}));

const searchProductsForSaleMock = vi.fn();
vi.mock("@/modules/commerce/sales/queries/search-products-for-sale", () => ({
  searchProductsForSale: (...args: unknown[]) => searchProductsForSaleMock(...args),
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: vi.fn().mockResolvedValue({}),
  assertOrganizationModule: vi.fn(),
  CommercialEnforcementError: class extends Error {},
}));

import { GET } from "./route";

const runtimeClient = { __runtimeFakeClient: true };

function request(qs = "q=abc") {
  return { nextUrl: new URL(`https://example.test/api/products/search-for-sale?${qs}`) } as never;
}

describe("GET /api/products/search-for-sale — Dedicated Runtime", () => {
  beforeEach(() => {
    getSaleApiContextMock.mockReset();
    searchProductsForSaleMock.mockReset();
  });

  it("pide location activa runtime y busca con el contexto efectivo", async () => {
    getSaleApiContextMock.mockResolvedValue({
      ok: true,
      user_id: "user-1",
      tenant_id: "tenant-RT",
      location_id: "loc-central",
      client: runtimeClient,
      runtime: null,
      dispose: vi.fn(),
    });
    searchProductsForSaleMock.mockResolvedValue({ items: [], pagination: { total: 0 } });

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(getSaleApiContextMock).toHaveBeenCalledWith(expect.anything(), { resolveRuntimeActiveLocation: true });
    expect(searchProductsForSaleMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-RT", location_id: "loc-central", search: "abc", client: runtimeClient }),
    );
  });

  it("sin location activa real → propaga el guard 409", async () => {
    getSaleApiContextMock.mockResolvedValue({ ok: false, status: 409, error: "Selecciona una location activa para operar con ventas." });

    const res = await GET(request());

    expect(res.status).toBe(409);
    expect(searchProductsForSaleMock).not.toHaveBeenCalled();
  });
});
