// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/[id] — route.test.ts
//
// DTE-OUTGOING-DEDICATED-RUNTIME-DETAIL-FIX: el detalle DTE solicita
// al contexto la resolución de location activa runtime (opt-in de
// lectura), usa tenant/location/client del contexto efectivo y es
// estrictamente de solo lectura, sin importar tipo ni estado fiscal.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const getDteApiContextMock = vi.fn();
vi.mock("../../dte-api-context", () => ({
  getDteApiContext: (...args: unknown[]) => getDteApiContextMock(...args),
}));

const getDetailMock = vi.fn();
vi.mock("@/modules/commerce/dte/outgoing/queries/get-dte-outgoing-detail-by-id", () => ({
  getDteOutgoingDetailById: (...args: unknown[]) => getDetailMock(...args),
}));

import { GET } from "./route";

const runtimeClient = { __runtimeFakeClient: true };

function okContext() {
  return {
    ok: true,
    user_id: "user-1",
    tenant_id: "tenant-RT",
    location_id: "loc-central",
    client: runtimeClient,
    runtime: null,
    readOnly: false,
    dispose: vi.fn(),
  };
}

function call(id: string) {
  return GET({} as never, { params: Promise.resolve({ id }) });
}

describe("GET /api/dte/outgoing/:id — detalle en Dedicated Runtime", () => {
  beforeEach(() => {
    getDteApiContextMock.mockReset();
    getDetailMock.mockReset();
  });

  it("pide al contexto resolver la location activa runtime (solo lectura)", async () => {
    getDteApiContextMock.mockResolvedValue(okContext());
    getDetailMock.mockResolvedValue({ id: "dte-1", dte_type_code: "01" });

    await call("dte-1");

    expect(getDteApiContextMock).toHaveBeenCalledWith(expect.anything(), {
      resolveRuntimeActiveLocation: true,
    });
  });

  it.each([
    ["01", "FE", "ACCEPTED"],
    ["03", "CCFE", "ACCEPTED"],
    ["05", "NC", "REJECTED"],
    ["11", "FEX", "ACCEPTED"],
    ["14", "FSE", "GENERATED"],
  ])("DTE %s (%s, %s) existente → detalle carga con contexto runtime", async (code, _label, status) => {
    const ctx = okContext();
    getDteApiContextMock.mockResolvedValue(ctx);
    getDetailMock.mockResolvedValue({ id: `dte-${code}`, dte_type_code: code, status });

    const res = await call(`dte-${code}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: { id: `dte-${code}`, dte_type_code: code, status } });
    expect(getDetailMock).toHaveBeenCalledWith({
      dteId: `dte-${code}`,
      tenantId: "tenant-RT",
      locationId: "loc-central",
      client: runtimeClient,
    });
    expect(ctx.dispose).toHaveBeenCalledTimes(1);
  });

  it("sin location activa real → propaga el guard 409 sin consultar el documento", async () => {
    getDteApiContextMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Selecciona una location activa para operar con documentos DTE.",
    });

    const res = await call("dte-1");

    expect(res.status).toBe(409);
    expect(getDetailMock).not.toHaveBeenCalled();
  });

  it("documento inexistente en el scope → 404", async () => {
    getDteApiContextMock.mockResolvedValue(okContext());
    getDetailMock.mockResolvedValue(null);

    const res = await call("dte-x");

    expect(res.status).toBe(404);
  });
});
