// ─────────────────────────────────────────────────────────────────
// commerce/sales/export/actions — export-lookups.runtime.test.ts
//
// FEX11-LOOKUPS-FINAL-FIX — una identidad RUNTIME_CLIENT tenant-wide
// (location_id null en JWT) recibía "La sesión no tiene una location
// activa." en los lookups FEX y la UI mostraba cero resultados. Ahora:
//   - clientes (tenant-level) no exigen location, igual que
//     GET /api/customers/search;
//   - productos resuelven la location activa runtime, igual que
//     GET /api/products/search-for-sale;
//   - los write paths siguen exigiendo location del contexto (sin cambios).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { sessionUser } = vi.hoisted(() => ({
  sessionUser: { id: "user-1", tenant_id: "tenant-RT", location_id: null, auth_scope: "RUNTIME_CLIENT" },
}));
vi.mock("@/lib/permissions/guards", () => ({ requireAdmin: vi.fn(async () => sessionUser) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireOperationalContextMock = vi.fn();
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: (...args: unknown[]) => requireOperationalContextMock(...args),
  OperationalContextError: class extends Error {},
}));

const getEffectiveLocationIdMock = vi.fn();
vi.mock("@/lib/location/active-location", () => ({
  getEffectiveLocationId: (...args: unknown[]) => getEffectiveLocationIdMock(...args),
}));

const searchForeignCustomersMock = vi.fn();
vi.mock("../queries/search-foreign-customers", () => ({
  searchForeignCustomers: (...args: unknown[]) => searchForeignCustomersMock(...args),
}));
const searchExportProductsMock = vi.fn();
vi.mock("../queries/search-export-products", () => ({
  searchExportProducts: (...args: unknown[]) => searchExportProductsMock(...args),
}));
const createExportSaleMock = vi.fn();
vi.mock("../services/export-sale.service", () => ({
  createForeignCustomer: vi.fn(),
  createExportSale: (...args: unknown[]) => createExportSaleMock(...args),
  configureUnitMhCode: vi.fn(),
  updateForeignCustomerCountry: vi.fn(),
}));

import {
  searchForeignCustomersAction,
  searchExportProductsAction,
  createExportSaleAction,
} from "./export-sale.actions";

const runtimeClient = { __runtimeDb: true };

function runtimeHandle(overrides: Record<string, unknown> = {}) {
  const dispose = vi.fn();
  return {
    dispose,
    value: {
      context: {
        runtimeMode: "RUNTIME_CLIENT",
        tenantId: "tenant-RT",
        locationId: null,
        client: runtimeClient,
        effectiveUser: { id: "user-1" },
        commercialContext: {
          effectiveModules: new Map([["fiscal.dte", { code: "fiscal.dte", enabled: true }]]),
        },
        ...overrides,
      },
      dispose,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchForeignCustomersAction — Dedicated Runtime", () => {
  it("RUNTIME_CLIENT tenant-wide busca en la DB runtime con el tenant efectivo, sin exigir location", async () => {
    const h = runtimeHandle();
    requireOperationalContextMock.mockResolvedValue(h.value);
    searchForeignCustomersMock.mockResolvedValue([{ id: "c1", name: "PRUEBA FEX 1" }]);

    const res = await searchForeignCustomersAction("PRUEBA");

    expect(res).toEqual({ ok: true, items: [{ id: "c1", name: "PRUEBA FEX 1" }] });
    expect(searchForeignCustomersMock).toHaveBeenCalledWith("tenant-RT", "PRUEBA", 20, runtimeClient);
    expect(requireOperationalContextMock).toHaveBeenCalledWith(sessionUser, { module: "commerce.sales", write: false });
    expect(getEffectiveLocationIdMock).not.toHaveBeenCalled();
    expect(h.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("searchExportProductsAction — Dedicated Runtime", () => {
  it("resuelve la location activa runtime contra la DB runtime y busca con ella", async () => {
    const h = runtimeHandle();
    requireOperationalContextMock.mockResolvedValue(h.value);
    getEffectiveLocationIdMock.mockResolvedValue("loc-central");
    searchExportProductsMock.mockResolvedValue([{ id: "p1" }]);

    const res = await searchExportProductsAction("");

    expect(res).toEqual({ ok: true, items: [{ id: "p1" }] });
    expect(getEffectiveLocationIdMock).toHaveBeenCalledWith(sessionUser, runtimeClient, "tenant-RT");
    expect(searchExportProductsMock).toHaveBeenCalledWith("tenant-RT", "loc-central", "", 20, runtimeClient);
    expect(h.dispose).toHaveBeenCalledTimes(1);
  });

  it("usa la location del contexto si ya viene resuelta (sin consultar cookie)", async () => {
    requireOperationalContextMock.mockResolvedValue(runtimeHandle({ locationId: "loc-jwt" }).value);
    searchExportProductsMock.mockResolvedValue([]);

    await searchExportProductsAction("DESARROLLO");

    expect(getEffectiveLocationIdMock).not.toHaveBeenCalled();
    expect(searchExportProductsMock).toHaveBeenCalledWith("tenant-RT", "loc-jwt", "DESARROLLO", 20, runtimeClient);
  });

  it("sin location activa real → error controlado, sin query", async () => {
    const h = runtimeHandle();
    requireOperationalContextMock.mockResolvedValue(h.value);
    getEffectiveLocationIdMock.mockResolvedValue(null);

    const res = await searchExportProductsAction("");

    expect(res).toEqual({ ok: false, error: "La sesión no tiene una location activa." });
    expect(searchExportProductsMock).not.toHaveBeenCalled();
    expect(h.dispose).toHaveBeenCalledTimes(1);
  });

  it("PLATFORM_NATIVE no consulta la location runtime", async () => {
    requireOperationalContextMock.mockResolvedValue(runtimeHandle({ runtimeMode: "PLATFORM_NATIVE" }).value);

    const res = await searchExportProductsAction("");

    expect(res).toEqual({ ok: false, error: "La sesión no tiene una location activa." });
    expect(getEffectiveLocationIdMock).not.toHaveBeenCalled();
  });
});

// FEX11-RUNTIME-WRITES-FINAL-CLOSURE — los write paths se cubren en
// export-writes.runtime.test.ts; aquí solo el fail closed de la venta.
describe("createExportSaleAction — sin location activa runtime", () => {
  it("falla cerrado sin crear la venta", async () => {
    requireOperationalContextMock.mockResolvedValue(runtimeHandle().value);
    getEffectiveLocationIdMock.mockResolvedValue(null);

    const res = await createExportSaleAction({} as never);

    expect(res).toEqual({ ok: false, error: "Selecciona una location activa para crear la venta de exportación." });
    expect(getEffectiveLocationIdMock).toHaveBeenCalledWith(sessionUser, runtimeClient, "tenant-RT");
    expect(createExportSaleMock).not.toHaveBeenCalled();
  });
});
