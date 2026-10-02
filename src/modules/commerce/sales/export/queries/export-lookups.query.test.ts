// ─────────────────────────────────────────────────────────────────
// commerce/sales/export/queries — export-lookups.query.test.ts
//
// FEX11-LOOKUPS-FINAL-FIX — semántica de los lookups FEX evaluada contra
// una DB runtime en memoria (evaluador mínimo del subconjunto de `where`
// Prisma que usan estas queries). Nunca toca Prisma global.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get: () => { throw new Error("Prisma global no debe usarse en lookups runtime"); } }),
}));

import type { PrismaClient } from "@prisma/client";
import { searchForeignCustomers } from "./search-foreign-customers";
import { searchExportProducts } from "./search-export-products";

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Row[]).some((w) => matches(row, w));
    const value = row[key];
    if (cond !== null && typeof cond === "object") {
      const c = cond as { contains?: string; notIn?: unknown[] };
      if (c.contains !== undefined) {
        return typeof value === "string" && value.toLowerCase().includes(c.contains.toLowerCase());
      }
      if (c.notIn !== undefined) return !c.notIn.includes(value);
    }
    return value === cond;
  });
}

function pick(row: Row, select: Row): Row {
  const out: Row = {};
  for (const [key, sel] of Object.entries(select)) {
    if (sel === true) out[key] = row[key] ?? null;
    else if (key === "unit") out.unit = row.unit ? pick(row.unit as Row, (sel as { select: Row }).select) : null;
    else if (key === "product_locations") {
      const s = sel as { where: Row; select: Row; take: number };
      out.product_locations = ((row.product_locations as Row[]) ?? [])
        .filter((pl) => matches(pl, s.where))
        .slice(0, s.take)
        .map((pl) => pick(pl, s.select));
    }
  }
  return out;
}

function fakeRuntimeDb(data: { customers?: Row[]; products?: Row[] }): PrismaClient {
  const findMany = (rows: Row[]) => async (args: { where: Row; take: number; select: Row }) =>
    rows.filter((r) => matches(r, args.where)).slice(0, args.take).map((r) => pick(r, args.select));
  return {
    customer: { findMany: findMany(data.customers ?? []) },
    product:  { findMany: findMany(data.products ?? []) },
  } as unknown as PrismaClient;
}

const TENANT = "tenant-trustme-like";
const OTHER  = "tenant-other";
const LOC    = "loc-central";

function customer(overrides: Row): Row {
  return {
    id: "c", customer_code: "C-1", name: "X", legal_name: null, id_type_code: "36",
    nit: null, dui: null, country_code: "US", country_name: "Estados Unidos",
    customer_person_type: "2", address_complement: null, activity_name: null, email: null, phone: null,
    tenant_id: TENANT, status: "active", is_foreign: true,
    ...overrides,
  };
}

const customers = [
  customer({ id: "fex1", customer_code: "EXP-20260811184120", name: "PRUEBA FEX 1", country_code: "9300", country_name: "LEGACY" }),
  customer({ id: "fex2", customer_code: "EXP-2", name: "ACME INC", legal_name: "ACME HOLDINGS", nit: "900123456", dui: null }),
  customer({ id: "fex3", customer_code: "EXP-3", name: "GLOBAL LLC", id_type_code: "13", dui: "P-778899" }),
  customer({ id: "nat1", customer_code: "C-NAT", name: "PRUEBA NACIONAL", is_foreign: false }),
  customer({ id: "oth1", customer_code: "EXP-OTH", name: "PRUEBA OTRO TENANT", tenant_id: OTHER }),
  customer({ id: "ina1", customer_code: "EXP-INA", name: "PRUEBA INACTIVO", status: "inactive" }),
];

describe("searchForeignCustomers — runtime DB", () => {
  const db = fakeRuntimeDb({ customers });
  const ids = async (q: string) => (await searchForeignCustomers(TENANT, q, 20, db)).map((c) => c.id);

  it("query PRUEBA → devuelve PRUEBA FEX 1 (cliente active + is_foreign del tenant)", async () => {
    expect(await ids("PRUEBA")).toEqual(["fex1"]);
  });

  it("cliente nacional no aparece", async () => {
    expect(await ids("NACIONAL")).toEqual([]);
  });

  it("cliente de otro tenant no aparece", async () => {
    expect(await ids("OTRO TENANT")).toEqual([]);
  });

  it("cliente foreign con país legado SÍ aparece (con su país legado intacto)", async () => {
    const [row] = await searchForeignCustomers(TENANT, "prueba fex", 20, db);
    expect(row).toMatchObject({ id: "fex1", country_code: "9300", country_name: "LEGACY" });
  });

  it("búsqueda por customer_code", async () => {
    expect(await ids("EXP-20260811")).toEqual(["fex1"]);
  });

  it("búsqueda por NIT y por DUI/documento", async () => {
    expect(await ids("900123")).toEqual(["fex2"]);
    expect(await ids("P-7788")).toEqual(["fex3"]);
  });

  it("búsqueda por legal_name", async () => {
    expect(await ids("HOLDINGS")).toEqual(["fex2"]);
  });
});

function product(overrides: Row): Row {
  return {
    id: "p", product_code: "X", name: "X", sale_price: 100, is_stockable: false,
    tenant_id: TENANT, allow_sale: true, status: "ACTIVE",
    unit: { id: "u-srv", name: "Servicio", symbol: "SRV", mh_unit_code: "59" },
    product_locations: [],
    ...overrides,
  };
}

const products = [
  product({ id: "p1", product_code: "10-0001", name: "DESARROLLO LANDING PAGE" }),
  product({ id: "p2", product_code: "10-0002", name: "DESARROLLO E-COMMERCE" }),
  product({ id: "p4", product_code: "10-0004", name: "SUSCRIPCION DE MANTENIMIENTO",
    unit: { id: "u-x", name: "Unidad", symbol: "UND", mh_unit_code: null } }),
  product({ id: "p6", product_code: "10-0006", name: "COMISION POR VENTA DE PAGINA WEB", is_stockable: true,
    product_locations: [{ tenant_id: TENANT, location_id: LOC, is_active: true, current_stock: 7 }] }),
  product({ id: "bl1", product_code: "10-0090", name: "DESARROLLO BLOQUEADO", status: "BLOCKED_SALE" }),
  product({ id: "in1", product_code: "10-0091", name: "DESARROLLO INACTIVO", status: "INACTIVE" }),
  product({ id: "ns1", product_code: "10-0092", name: "DESARROLLO NO VENDIBLE", allow_sale: false }),
  product({ id: "ot1", product_code: "10-0001", name: "DESARROLLO OTRO TENANT", tenant_id: OTHER }),
];

describe("searchExportProducts — runtime DB", () => {
  const db = fakeRuntimeDb({ products });
  const ids = async (q: string) => (await searchExportProducts(TENANT, LOC, q, 20, db)).map((p) => p.id);

  it('search="" → catálogo vendible inicial del tenant', async () => {
    expect(await ids("")).toEqual(["p1", "p2", "p4", "p6"]);
  });

  it("query DESARROLLO filtra en vivo", async () => {
    expect(await ids("desarrollo")).toEqual(["p1", "p2"]);
  });

  it("producto de otro tenant no aparece", async () => {
    expect(await ids("OTRO TENANT")).toEqual([]);
  });

  it("bloqueado / inactivo / no vendible no aparecen", async () => {
    expect(await ids("BLOQUEADO")).toEqual([]);
    expect(await ids("INACTIVO")).toEqual([]);
    expect(await ids("NO VENDIBLE")).toEqual([]);
  });

  it("producto sin mh_unit_code aparece marcado, no se oculta", async () => {
    const [row] = await searchExportProducts(TENANT, LOC, "SUSCRIPCION", 20, db);
    expect(row).toMatchObject({ id: "p4", unit_id: "u-x", mh_unit_code: null });
  });

  it("stock de la active location", async () => {
    const [row] = await searchExportProducts(TENANT, LOC, "COMISION", 20, db);
    expect(row).toMatchObject({ id: "p6", current_stock: 7 });
    const [other] = await searchExportProducts(TENANT, "loc-otra", "COMISION", 20, db);
    expect(other).toMatchObject({ id: "p6", current_stock: null });
  });
});
