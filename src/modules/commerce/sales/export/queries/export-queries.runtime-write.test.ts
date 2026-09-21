// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-queries.runtime-write.test.ts
//
// FASE VI-E4A — getUnitMhContext, searchExportProducts y
// searchForeignCustomers aceptan un `db` explícito y lo usan para TODA
// lectura. Este test hace fallar cualquier llamada al Prisma global
// para certificar RUNTIME_CLIENT_FEX11_LOOKUPS_CAN_HIT_GLOBAL_PRISMA = NO
// y RUNTIME_CLIENT_FEX11_UNIT_REFERENCE_RUNTIME_SAFE = YES (UnitOfMeasure
// se resuelve siempre en la misma runtime DB — ver Product.unit_id como
// FK física local).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: una query de export tocó el Prisma global.");
      },
    },
  ),
}));

import { getUnitMhContext } from "./get-unit-mh-context";
import { searchExportProducts } from "./search-export-products";
import { searchForeignCustomers } from "./search-foreign-customers";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUnitMhContext — FASE VI-E4A (runtime db injection)", () => {
  it("usa db.unitOfMeasure/db.product cuando se pasa db explícito", async () => {
    const db = {
      unitOfMeasure: { findUnique: vi.fn().mockResolvedValue({ id: "u1", name: "Unidad", symbol: "U", mh_unit_code: "59" }) },
      product:       { count: vi.fn().mockResolvedValue(3) },
    };

    const result = await getUnitMhContext("tenant-1", "u1", db as never);

    expect(result).toMatchObject({ unit_id: "u1", shared_product_count: 3 });
    expect(db.unitOfMeasure.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1" } }));
    expect(db.product.count).toHaveBeenCalledWith({ where: { tenant_id: "tenant-1", unit_id: "u1" } });
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado)", async () => {
    await expect(getUnitMhContext("tenant-1", "u1")).rejects.toThrow("RUNTIME_UNSAFE");
  });
});

describe("searchExportProducts — FASE VI-E4A (runtime db injection)", () => {
  it("usa db.product cuando se pasa db explícito", async () => {
    const db = { product: { findMany: vi.fn().mockResolvedValue([]) } };

    await searchExportProducts("tenant-1", "loc-1", "", 20, db as never);

    expect(db.product.findMany).toHaveBeenCalledTimes(1);
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado)", async () => {
    await expect(searchExportProducts("tenant-1", "loc-1", "")).rejects.toThrow("RUNTIME_UNSAFE");
  });
});

describe("searchForeignCustomers — FASE VI-E4A (runtime db injection)", () => {
  it("usa db.customer cuando se pasa db explícito", async () => {
    const db = { customer: { findMany: vi.fn().mockResolvedValue([]) } };

    await searchForeignCustomers("tenant-1", "", 20, db as never);

    expect(db.customer.findMany).toHaveBeenCalledTimes(1);
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado)", async () => {
    await expect(searchForeignCustomers("tenant-1", "")).rejects.toThrow("RUNTIME_UNSAFE");
  });
});
