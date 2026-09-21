// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fse-json.service.runtime-write.test.ts
//
// FASE VI-E4A — generateFseJsonForPurchase acepta un `db` explícito y
// usa esa misma DB para TODOS los reads (DteOutgoingDocument, Purchase,
// DteIssuerConfig). Este test hace fallar cualquier llamada al Prisma
// global para certificar RUNTIME_CLIENT_FSE14_GENERATION_CAN_HIT_GLOBAL_PRISMA
// = NO. buildFseJsonFromLoadedData (pure builder) no toca Prisma — se
// certifica indirectamente por no requerir ningún mock de DB propio.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: generateFseJsonForPurchase tocó el Prisma global.");
      },
    },
  ),
}));

vi.mock("../utils/dte-territory.resolver", () => ({
  validateDteAddressCodes: vi.fn(async () => ({ ok: true })),
}));

import { generateFseJsonForPurchase } from "./generate-fse-json.service";
import { validateDteAddressCodes } from "../utils/dte-territory.resolver";

function buildFakeRuntimeDb() {
  const dteDoc = {
    id: "dte-1",
    dte_type_code: "14",
    generation_code: "GEN-14-1",
    control_number: "DTE-14-M001P001-000000000000001",
    environment: "TEST",
    purchase_id: "purchase-1",
    issuer_config_id: "cfg-1",
  };

  const purchase = {
    tenant_id: "tenant-1",
    status: "CONFIRMED",
    document_type: "FSE",
    notes: null,
    payment_condition: "CON",
    cancellation_type: "01",
    retention_1pct_applies: false,
    retention_1pct_amount: 0,
    income_tax_withholding_applies: false,
    income_tax_withholding_amount: 0,
    supplier: {
      name: "Proveedor Excluido", legal_name: null, taxpayer_type: "EXCLUDED_SUBJECT",
      id_type_code: "13", nit: null, dui: "00000000-0", other_document: null,
      activity_code: "01111", activity_name: "Actividad Test",
      dept_code: "06", municipality_code: "23", address_complement: "Direccion",
      phone: "22222222", email: "sup@test.com",
    },
    items: [{
      dte_line_number: 1, quantity: 1, unit_cost: 100, line_subtotal: 100,
      product: { product_code: "P1", name: "Producto 1", product_type: "PRODUCT", unit: { mh_unit_code: "59" } },
    }],
  };

  const issuerConfig = {
    nit: "00000000000000", nrc: "123456", name: "Emisor Test",
    activity_code: "01111", activity_name: "Actividad Test",
    establishment_code: "M001", point_of_sale_code: "P001",
    cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
    dept_code: "06", municipality_code: "23", address_complement: "Direccion",
    phone: "22222222", email: "issuer@test.com", environment: "TEST",
  };

  const db = {
    __marker: "RUNTIME_CLIENT_DB",
    dteOutgoingDocument: { findFirst: vi.fn().mockResolvedValue(dteDoc) },
    purchase:            { findFirst: vi.fn().mockResolvedValue(purchase) },
    dteIssuerConfig:     { findFirst: vi.fn().mockResolvedValue(issuerConfig) },
  };

  return { db, dteDoc, purchase, issuerConfig };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateFseJsonForPurchase — FASE VI-E4A (runtime db injection)", () => {
  it("usa exclusivamente context.client (db) para DteOutgoingDocument/Purchase/DteIssuerConfig", async () => {
    const { db } = buildFakeRuntimeDb();

    const result = await generateFseJsonForPurchase(
      { tenant_id: "tenant-1", location_id: "loc-1", dte_document_id: "dte-1" },
      db as never,
    );

    expect(result).toMatchObject({ ok: true });
    expect(db.dteOutgoingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dte-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.purchase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "purchase-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteIssuerConfig.findFirst).toHaveBeenCalledTimes(1);
  });

  it("propaga el mismo db al resolver territorial (validateDteAddressCodes)", async () => {
    const { db } = buildFakeRuntimeDb();

    await generateFseJsonForPurchase(
      { tenant_id: "tenant-1", location_id: "loc-1", dte_document_id: "dte-1" },
      db as never,
    );

    expect(validateDteAddressCodes).toHaveBeenCalledWith(expect.objectContaining({ role: "emisor" }), db);
    expect(validateDteAddressCodes).toHaveBeenCalledWith(expect.objectContaining({ role: "sujeto excluido" }), db);
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado)", async () => {
    await expect(
      generateFseJsonForPurchase({ tenant_id: "tenant-1", location_id: "loc-1", dte_document_id: "dte-1" }),
    ).rejects.toThrow("RUNTIME_UNSAFE");
  });
});
