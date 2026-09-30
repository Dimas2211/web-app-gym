// ─────────────────────────────────────────────────────────────────
// api/purchases — purchases-lookup-read-routes.test.ts
//
// FINAL-RUNTIME-CLOSURE: GET /api/purchases/products y
// GET /api/suppliers/:id/purchase-history solicitan la location activa
// runtime (opt-in de lectura) y consultan con tenant/location/client del
// contexto efectivo. La semántica del fallback (cookie validada en la DB
// runtime, 409 sin cookie, PLATFORM_NATIVE sin cambios) está cubierta en
// purchase-api-context.test.ts.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const getPurchaseApiContextMock = vi.fn();
vi.mock("@/app/api/purchases/purchase-api-context", () => ({
  getPurchaseApiContext: (...args: unknown[]) => getPurchaseApiContextMock(...args),
}));

const getProductsForPurchaseMock = vi.fn();
vi.mock("@/modules/commerce/purchases/queries/get-products-for-purchase", () => ({
  getProductsForPurchase: (...args: unknown[]) => getProductsForPurchaseMock(...args),
}));

import { GET as productsGET } from "./products/route";
import { GET as supplierHistoryGET } from "../suppliers/[id]/purchase-history/route";

function runtimeClient() {
  return {
    supplier: { findFirst: vi.fn().mockResolvedValue({ id: "sup-1" }) },
    purchase: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function okContext(client: unknown) {
  return {
    ok: true,
    user_id: "user-1",
    tenant_id: "tenant-RT",
    location_id: "loc-central",
    client,
    runtime: null,
    dispose: vi.fn(),
  };
}

describe("GET /api/purchases/products — Dedicated Runtime", () => {
  beforeEach(() => {
    getPurchaseApiContextMock.mockReset();
    getProductsForPurchaseMock.mockReset();
  });

  it("pide location activa runtime y busca con el contexto efectivo", async () => {
    const client = runtimeClient();
    getPurchaseApiContextMock.mockResolvedValue(okContext(client));
    getProductsForPurchaseMock.mockResolvedValue([{ id: "p-1" }]);

    const res = await productsGET({ nextUrl: new URL("https://example.test/api/purchases/products?search=abc") } as never);

    expect(res.status).toBe(200);
    expect(getPurchaseApiContextMock).toHaveBeenCalledWith(expect.anything(), { resolveRuntimeActiveLocation: true });
    expect(getProductsForPurchaseMock).toHaveBeenCalledWith("tenant-RT", "loc-central", "abc", client);
  });

  it("sin location activa real → propaga el guard 409", async () => {
    getPurchaseApiContextMock.mockResolvedValue({ ok: false, status: 409, error: "Selecciona una location activa para consultar compras." });

    const res = await productsGET({ nextUrl: new URL("https://example.test/api/purchases/products") } as never);

    expect(res.status).toBe(409);
    expect(getProductsForPurchaseMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/suppliers/:id/purchase-history — Dedicated Runtime", () => {
  beforeEach(() => {
    getPurchaseApiContextMock.mockReset();
  });

  it("pide location activa runtime y consulta la DB runtime con tenant/location efectivos", async () => {
    const client = runtimeClient();
    getPurchaseApiContextMock.mockResolvedValue(okContext(client));

    const res = await supplierHistoryGET({} as never, { params: Promise.resolve({ id: "sup-1" }) });

    expect(res.status).toBe(200);
    expect(getPurchaseApiContextMock).toHaveBeenCalledWith(expect.anything(), { resolveRuntimeActiveLocation: true });
    expect(client.purchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: "tenant-RT", location_id: "loc-central", supplier_id: "sup-1" },
      }),
    );
  });

  it("sin location activa real → propaga el guard 409", async () => {
    getPurchaseApiContextMock.mockResolvedValue({ ok: false, status: 409, error: "Selecciona una location activa para consultar compras." });

    const res = await supplierHistoryGET({} as never, { params: Promise.resolve({ id: "sup-1" }) });

    expect(res.status).toBe(409);
  });
});
