// ─────────────────────────────────────────────────────────────────
// api/sales — sales-read-routes.test.ts
//
// DEDICATED-RUNTIME-UI-CLOSURE: los GET de listado y detalle solicitan
// la location activa runtime (opt-in de lectura) y usan tenant/location/
// client del contexto efectivo. Las escrituras (POST/PATCH) no pasan por
// getSaleApiContext y no se ven afectadas.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const getSaleApiContextMock = vi.fn();
vi.mock("./sale-api-context", () => ({
  getSaleApiContext: (...args: unknown[]) => getSaleApiContextMock(...args),
}));

const listSalesMock = vi.fn();
vi.mock("@/modules/commerce/sales/queries/list-sales", () => ({
  listSales: (...args: unknown[]) => listSalesMock(...args),
}));

const getSaleDetailMock = vi.fn();
vi.mock("@/modules/commerce/sales/queries/get-sale-detail-by-id", () => ({
  getSaleDetailById: (...args: unknown[]) => getSaleDetailMock(...args),
}));

const createSaleDraftMock = vi.fn();
const updateSaleDraftMock = vi.fn();
vi.mock("@/modules/commerce/sales/services/sale.service", () => ({
  createSaleDraft: (...args: unknown[]) => createSaleDraftMock(...args),
  updateSaleDraft: (...args: unknown[]) => updateSaleDraftMock(...args),
}));

vi.mock("@/lib/permissions/guards", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: vi.fn(),
  OperationalContextError: class extends Error {},
}));

import { GET as listGET } from "./route";
import { GET as detailGET } from "./[id]/route";

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
  return { nextUrl: new URL("https://example.test/api/sales?page=1") } as never;
}

describe("GET /api/sales y /api/sales/:id — lectura en Dedicated Runtime", () => {
  beforeEach(() => {
    getSaleApiContextMock.mockReset();
    listSalesMock.mockReset();
    getSaleDetailMock.mockReset();
    createSaleDraftMock.mockReset();
    updateSaleDraftMock.mockReset();
  });

  it("listado: pide location activa runtime y consulta con el contexto efectivo", async () => {
    getSaleApiContextMock.mockResolvedValue(okContext());
    listSalesMock.mockResolvedValue({ items: [], total: 0 });

    const res = await listGET(listRequest());

    expect(res.status).toBe(200);
    expect(getSaleApiContextMock).toHaveBeenCalledWith(expect.anything(), { resolveRuntimeActiveLocation: true });
    expect(listSalesMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-RT", location_id: "loc-central" }),
      runtimeClient,
    );
  });

  it.each([
    ["FE 01", "01"],
    ["FEX 11", "11"],
  ])("detalle venta %s: líneas cargan con location runtime válida", async (_label, dteType) => {
    const ctx = okContext();
    getSaleApiContextMock.mockResolvedValue(ctx);
    const sale = { id: "sale-1", dte_type_code: dteType, items: [{ id: "item-1" }, { id: "item-2" }] };
    getSaleDetailMock.mockResolvedValue(sale);

    const res = await detailGET({} as never, { params: Promise.resolve({ id: "sale-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items).toHaveLength(2);
    expect(getSaleApiContextMock).toHaveBeenCalledWith(expect.anything(), { resolveRuntimeActiveLocation: true });
    expect(getSaleDetailMock).toHaveBeenCalledWith("sale-1", "tenant-RT", "loc-central", runtimeClient);
    expect(ctx.dispose).toHaveBeenCalledTimes(1);
  });

  it("detalle sin location activa real → propaga 409 sin consultar la venta", async () => {
    getSaleApiContextMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Selecciona una location activa para operar con ventas.",
    });

    const res = await detailGET({} as never, { params: Promise.resolve({ id: "sale-1" }) });

    expect(res.status).toBe(409);
    expect(getSaleDetailMock).not.toHaveBeenCalled();
  });

  it("lectura no dispara escrituras", async () => {
    getSaleApiContextMock.mockResolvedValue(okContext());
    getSaleDetailMock.mockResolvedValue({ id: "sale-1", items: [] });

    await detailGET({} as never, { params: Promise.resolve({ id: "sale-1" }) });

    expect(createSaleDraftMock).not.toHaveBeenCalled();
    expect(updateSaleDraftMock).not.toHaveBeenCalled();
  });
});
