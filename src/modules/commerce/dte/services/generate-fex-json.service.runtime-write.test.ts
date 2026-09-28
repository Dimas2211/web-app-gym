// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fex-json.service.runtime-write.test.ts
//
// FASE VI-E4A — generateFexJsonForSale acepta un `db` explícito y usa
// esa misma DB para TODOS los reads (DteOutgoingDocument, Sale,
// DteIssuerConfig, Country CAT-020 y Municipality vía el resolver
// territorial — FEX-PROD-0B). Este test hace fallar cualquier llamada al Prisma
// global para certificar RUNTIME_CLIENT_FEX11_GENERATION_CAN_HIT_GLOBAL_PRISMA
// = NO.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: generateFexJsonForSale tocó el Prisma global.");
      },
    },
  ),
}));

vi.mock("../utils/dte-territory.resolver", () => ({
  validateDteAddressCodes: vi.fn(async () => ({ ok: true })),
  resolveDteMunicipality: vi.fn(async () => ({
    departmentCode: "06", municipalityCode: "23", districtCode: "060123",
    districtName: "Distrito", newMunicipalityCode: "0601", newMunicipalityName: "San Salvador Centro",
  })),
}));

import { generateFexJsonForSale } from "./generate-fex-json.service";
import { resolveDteMunicipality, validateDteAddressCodes } from "../utils/dte-territory.resolver";

function buildFakeRuntimeDb() {
  const dteDoc = {
    id: "dte-1",
    dte_type_code: "11",
    generation_code: "GEN-11-1",
    control_number: "DTE-11-M001P001-000000000000001",
    environment: "TEST",
    sale_id: "sale-1",
    issuer_config_id: "cfg-1",
  };

  const sale = {
    id: "sale-1",
    location_id: "loc-1",
    status: "CONFIRMED",
    inventory_moved: true,
    customer_id: "cust-1",
    primary_dte_type_code: "11",
    condition_operation_code: "1",
    payment_method_code: "01",
    payment_term_code: null,
    payment_term_value: null,
    total_amount: 100,
    notes: null,
    customer: {
      id: "cust-1", name: "Cliente Extranjero", legal_name: null,
      id_type_code: "37", nit: null, dui: "PASSPORT-123",
      activity_name: "Actividad Test", address_complement: "Direccion",
      phone: "22222222", email: "cust@test.com",
      is_foreign: true, country_code: "US", country_name: "Estados Unidos",
      customer_person_type: "2",
    },
    export_details: {
      tenant_id: "tenant-1", item_type_export: 2,
      fiscal_precinct_code: null, regime_code: null,
      incoterm_code: null, incoterm_desc: null,
      insurance_amount: 0, freight_amount: 0,
    },
    items: [{
      line_number: 1, product_code_snapshot: "P1", product_name_snapshot: "Servicio 1",
      product_type_snapshot: "SERVICE",
      quantity: 1, unit_price: 100, discount_amount: 0, tax_rate_snapshot: 0,
      line_subtotal: 100, line_total: 100,
      product: { unit: { mh_unit_code: "59" } },
    }],
    payments: [],
  };

  const issuerConfig = {
    nit: "00000000000000", nrc: "123456", name: "Emisor Test", legal_name: null,
    activity_code: "01111", activity_name: "Actividad Test",
    establishment_code: "M001", establishment_type_code: "02", point_of_sale_code: "P001",
    cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
    dept_code: "06", municipality_code: "23", address_complement: "Direccion",
    phone: "22222222", email: "issuer@test.com", environment: "TEST",
  };

  const db = {
    __marker: "RUNTIME_CLIENT_DB",
    dteOutgoingDocument: { findFirst: vi.fn().mockResolvedValue(dteDoc) },
    sale:                { findFirst: vi.fn().mockResolvedValue(sale) },
    dteIssuerConfig:     { findFirst: vi.fn().mockResolvedValue(issuerConfig) },
    country:             { findFirst: vi.fn().mockResolvedValue({ code: "US", name: "Estados Unidos" }) },
  };

  return { db, dteDoc, sale, issuerConfig };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateFexJsonForSale — FASE VI-E4A (runtime db injection)", () => {
  it("usa exclusivamente context.client (db) para DteOutgoingDocument/Sale/DteIssuerConfig", async () => {
    const { db } = buildFakeRuntimeDb();

    const result = await generateFexJsonForSale(
      { tenant_id: "tenant-1", location_id: "loc-1", dte_document_id: "dte-1" },
      db as never,
    );

    expect(result).toMatchObject({ ok: true });
    expect(db.dteOutgoingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dte-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sale-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteIssuerConfig.findFirst).toHaveBeenCalledTimes(1);
  });

  it("propaga el mismo db al resolver territorial del emisor (validateDteAddressCodes)", async () => {
    const { db } = buildFakeRuntimeDb();

    await generateFexJsonForSale(
      { tenant_id: "tenant-1", location_id: "loc-1", dte_document_id: "dte-1" },
      db as never,
    );

    expect(validateDteAddressCodes).toHaveBeenCalledWith(expect.objectContaining({ role: "emisor" }), db);
  });

  it("FEX v3: país CAT-020 y distrito del emisor se resuelven con el mismo db", async () => {
    const { db } = buildFakeRuntimeDb();

    const result = await generateFexJsonForSale(
      { tenant_id: "tenant-1", location_id: "loc-1", dte_document_id: "dte-1" },
      db as never,
    );

    expect(db.country.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: "US", status: "active" } }),
    );
    expect(resolveDteMunicipality).toHaveBeenCalledWith({ deptCode: "06", municipalityCode: "23" }, db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.json.identificacion.version).toBe(3);
      expect(result.json.emisor.direccion).toMatchObject({ departamento: "06", municipio: "23", distrito: "23" });
      expect(result.json.receptor.codPais).toBe("US");
    }
  });

  it("FEX v3: jerarquía territorial inconsistente del emisor → fail-closed antes de construir JSON", async () => {
    const { db } = buildFakeRuntimeDb();
    vi.mocked(resolveDteMunicipality).mockResolvedValueOnce({
      departmentCode: "06", municipalityCode: "23", districtCode: "050623",
      districtName: "Distrito", newMunicipalityCode: "0601", newMunicipalityName: "San Salvador Centro",
    });

    const result = await generateFexJsonForSale(
      { tenant_id: "tenant-1", location_id: "loc-1", dte_document_id: "dte-1" },
      db as never,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("FEX 11 v3");
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado)", async () => {
    await expect(
      generateFexJsonForSale({ tenant_id: "tenant-1", location_id: "loc-1", dte_document_id: "dte-1" }),
    ).rejects.toThrow("RUNTIME_UNSAFE");
  });
});

// ─────────────────────────────────────────────────────────────────
// FEX-PROD-1 — identificacion.ambiente sigue al ambiente del documento
// (y de su emisor, que debe coincidir). Sin cambios de fórmulas/schema.
// ─────────────────────────────────────────────────────────────────

describe("generateFexJsonForSale — ambiente TEST/PRODUCTION (FEX-PROD-1)", () => {
  function dbFor(docEnv: string, issuerEnv: string) {
    const { db, dteDoc, issuerConfig } = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findFirst.mockResolvedValue({ ...dteDoc, environment: docEnv });
    db.dteIssuerConfig.findFirst.mockResolvedValue({ ...issuerConfig, environment: issuerEnv });
    return db;
  }
  const PARAMS = { tenant_id: "tenant-1", location_id: "loc-1", dte_document_id: "dte-1" };

  it("documento TEST -> identificacion.ambiente = \"00\", version 3", async () => {
    const result = await generateFexJsonForSale(PARAMS, dbFor("TEST", "TEST") as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.json.identificacion.ambiente).toBe("00");
      expect(result.json.identificacion.version).toBe(3);
    }
  });

  it("documento PRODUCTION -> identificacion.ambiente = \"01\", version 3", async () => {
    const result = await generateFexJsonForSale(PARAMS, dbFor("PRODUCTION", "PRODUCTION") as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.json.identificacion.ambiente).toBe("01");
      expect(result.json.identificacion.version).toBe(3);
    }
  });

  it("documento PRODUCTION + emisor TEST -> no genera JSON", async () => {
    const result = await generateFexJsonForSale(PARAMS, dbFor("PRODUCTION", "TEST") as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no coincide");
  });

  it("documento TEST + emisor PRODUCTION -> no genera JSON", async () => {
    const result = await generateFexJsonForSale(PARAMS, dbFor("TEST", "PRODUCTION") as never);
    expect(result.ok).toBe(false);
  });
});
