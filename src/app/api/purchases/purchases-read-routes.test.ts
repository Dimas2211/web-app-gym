// ─────────────────────────────────────────────────────────────────
// api/purchases — purchases-read-routes.test.ts
//
// DEDICATED-RUNTIME-UI-CLOSURE: los GET de listado y detalle solicitan
// la location activa runtime (opt-in de lectura). DELETE /:id (escritura)
// sigue llamando getPurchaseApiContext SIN la opción.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const getPurchaseApiContextMock = vi.fn();
vi.mock("./purchase-api-context", () => ({
  getPurchaseApiContext: (...args: unknown[]) => getPurchaseApiContextMock(...args),
}));

const getPurchasesMock = vi.fn();
vi.mock("@/modules/commerce/purchases/queries/get-purchases", () => ({
  getPurchases: (...args: unknown[]) => getPurchasesMock(...args),
}));

const getPurchaseByIdMock = vi.fn();
vi.mock("@/modules/commerce/purchases/queries/get-purchase-by-id", () => ({
  getPurchaseById: (...args: unknown[]) => getPurchaseByIdMock(...args),
}));

const createPurchaseMock = vi.fn();
const deleteDraftPurchaseMock = vi.fn();
vi.mock("@/modules/commerce/purchases/services/purchase.service", () => ({
  createPurchase: (...args: unknown[]) => createPurchaseMock(...args),
  deleteDraftPurchase: (...args: unknown[]) => deleteDraftPurchaseMock(...args),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn() }));
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: vi.fn(),
  OperationalContextError: class extends Error {},
}));

import { GET as listGET } from "./route";
import { GET as detailGET, DELETE as detailDELETE } from "./[id]/route";

const runtimeClient = { __runtimeFakeClient: true };

function okContext() {
  return {
    ok: true,
    user_id: "user-1",
    tenant_id: "tenant-RT",
    location_id: "loc-central",
    client: runtimeClient,
    runtime: null,
    dispose: vi.fn(),
  };
}

function listRequest() {
  return { nextUrl: new URL("https://example.test/api/purchases?page=1") } as never;
}

describe("GET /api/purchases y /api/purchases/:id — lectura en Dedicated Runtime", () => {
  beforeEach(() => {
    getPurchaseApiContextMock.mockReset();
    getPurchasesMock.mockReset();
    getPurchaseByIdMock.mockReset();
    createPurchaseMock.mockReset();
    deleteDraftPurchaseMock.mockReset();
  });

  it("listado: pide location activa runtime y consulta con el contexto efectivo", async () => {
    getPurchaseApiContextMock.mockResolvedValue(okContext());
    getPurchasesMock.mockResolvedValue({ items: [], total: 0 });

    const res = await listGET(listRequest());

    expect(res.status).toBe(200);
    expect(getPurchaseApiContextMock).toHaveBeenCalledWith(expect.anything(), { resolveRuntimeActiveLocation: true });
    expect(getPurchasesMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-RT", location_id: "loc-central" }),
      runtimeClient,
    );
  });

  it("detalle: cabecera y líneas cargan con location runtime válida", async () => {
    const ctx = okContext();
    getPurchaseApiContextMock.mockResolvedValue(ctx);
    const detail = {
      id: "pur-1",
      status: "CONFIRMED",
      supplier: { name: "Proveedor" },
      total: "100.00",
      items: [{ id: "line-1" }, { id: "line-2" }],
    };
    getPurchaseByIdMock.mockResolvedValue(detail);

    const res = await detailGET({} as never, { params: Promise.resolve({ id: "pur-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(detail);
    expect(getPurchaseApiContextMock).toHaveBeenCalledWith(expect.anything(), { resolveRuntimeActiveLocation: true });
    expect(getPurchaseByIdMock).toHaveBeenCalledWith("pur-1", "tenant-RT", "loc-central", runtimeClient);
    expect(ctx.dispose).toHaveBeenCalledTimes(1);
    expect(deleteDraftPurchaseMock).not.toHaveBeenCalled();
    expect(createPurchaseMock).not.toHaveBeenCalled();
  });

  it("detalle sin location activa real → propaga 409 sin consultar la compra", async () => {
    getPurchaseApiContextMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Selecciona una location activa para consultar compras.",
    });

    const res = await detailGET({} as never, { params: Promise.resolve({ id: "pur-1" }) });

    expect(res.status).toBe(409);
    expect(getPurchaseByIdMock).not.toHaveBeenCalled();
  });

  it("DELETE deshabilitado (Autorización Operativa): 403 sin resolver contexto ni borrar", async () => {
    const res = await detailDELETE();

    expect(res.status).toBe(403);
    expect(getPurchaseApiContextMock).not.toHaveBeenCalled();
    expect(deleteDraftPurchaseMock).not.toHaveBeenCalled();
  });
});
