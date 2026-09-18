// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-ccfe-json.service.runtime-write.test.ts
//
// FASE VI-E3 — generateCcfeJsonForDte acepta un `db` explícito y usa
// esa misma DB para TODOS los reads (DteOutgoingDocument, Sale,
// DteIssuerConfig) y el write final (GENERATED). Este test hace fallar
// cualquier llamada al Prisma global para certificar
// RUNTIME_CLIENT_CCFE03_GENERATION_CAN_HIT_GLOBAL_PRISMA = NO.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: generateCcfeJsonForDte tocó el Prisma global.");
      },
    },
  ),
}));

vi.mock("../utils/dte-territory.resolver", () => ({
  validateDteAddressCodes: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../utils/dte-contingency-identification.utils", () => ({
  buildContingencyIdentificationBlock: vi.fn(() => ({
    ok: true,
    data: { tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null },
  })),
}));

import { generateCcfeJsonForDte } from "./generate-ccfe-json.service";
import { validateDteAddressCodes } from "../utils/dte-territory.resolver";

function buildFakeRuntimeDb() {
  const dteDoc = {
    id: "dte-1",
    dte_type_code: "03",
    dte_status: "PENDING_GENERATION",
    generation_code: "GEN-1",
    control_number: "DTE-03-M001P001-000000000000001",
    environment: "TEST",
    sale_id: "sale-1",
    issuer_config_id: "cfg-1",
    transmission_type_code: "1",
    contingency_type_code: null,
    contingency_reason: null,
  };

  const customer = {
    id: "cust-1",
    name: "Cliente Registrado",
    legal_name: null,
    taxpayer_type: "REGISTERED_TAXPAYER",
    nit: "00000000000000",
    nrc: "123456",
    activity_code: "01111",
    activity_name: "Actividad Test",
    dept_code: "05",
    municipality_code: "11",
    address_complement: "Calle Falsa 123",
    phone: null,
    email: null,
  };

  const sale = {
    id: "sale-1",
    sale_date: new Date(),
    status: "CONFIRMED",
    inventory_moved: true,
    customer_id: "cust-1",
    condition_operation_code: "1",
    payment_method_code: "01",
    payment_term_code: null,
    payment_term_value: null,
    subtotal: 100,
    discount_amount: 0,
    tax_amount: 13,
    total_amount: 113,
    customer,
    items: [{
      line_number: 1,
      product_code_snapshot: "P1",
      product_name_snapshot: "Producto 1",
      product_type_snapshot: "PRODUCT",
      quantity: 1,
      unit_price: 113,
      discount_amount: 0,
      tax_rate_snapshot: 13,
      tax_amount: 13,
      line_subtotal: 100,
      line_total: 113,
    }],
    payments: [],
  };

  const issuerConfig = {
    nit: "00000000000000",
    nrc: "654321",
    name: "Emisor Test",
    legal_name: null,
    activity_code: "01111",
    activity_name: "Actividad Test",
    establishment_code: "M001",
    establishment_type_code: "02",
    point_of_sale_code: "P001",
    dept_code: "05",
    municipality_code: "11",
    address_complement: "Colonia Test",
    phone: null,
    email: null,
    environment: "TEST",
  };

  const db = {
    __marker: "RUNTIME_CLIENT_DB",
    dteOutgoingDocument: {
      findFirst: vi.fn().mockResolvedValue(dteDoc),
      update: vi.fn().mockResolvedValue({}),
    },
    sale: { findFirst: vi.fn().mockResolvedValue(sale) },
    dteIssuerConfig: { findFirst: vi.fn().mockResolvedValue(issuerConfig) },
  };

  return { db, dteDoc, sale, issuerConfig };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateCcfeJsonForDte — FASE VI-E3 (runtime db injection)", () => {
  it("usa exclusivamente context.client (db) para DteOutgoingDocument/Sale/DteIssuerConfig", async () => {
    const { db } = buildFakeRuntimeDb();

    const result = await generateCcfeJsonForDte("dte-1", "tenant-1", "loc-1", "u1", db as never);

    expect(result).toMatchObject({ ok: true });
    expect(db.dteOutgoingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dte-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sale-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteIssuerConfig.findFirst).toHaveBeenCalledTimes(1);
    expect(db.dteOutgoingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dte-1" },
        data: expect.objectContaining({ dte_status: "GENERATED" }),
      }),
    );
  });

  it("propaga el mismo db al resolver territorial (validateDteAddressCodes) para emisor y receptor", async () => {
    const { db } = buildFakeRuntimeDb();

    await generateCcfeJsonForDte("dte-1", "tenant-1", "loc-1", "u1", db as never);

    expect(validateDteAddressCodes).toHaveBeenCalledWith(expect.objectContaining({ role: "receptor" }), db);
    expect(validateDteAddressCodes).toHaveBeenCalledWith(expect.objectContaining({ role: "emisor" }), db);
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado)", async () => {
    await expect(generateCcfeJsonForDte("dte-1", "tenant-1", "loc-1", "u1")).rejects.toThrow("RUNTIME_UNSAFE");
  });
});
