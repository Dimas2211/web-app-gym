// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale.service.v3.test.ts
//
// FEX-PROD-0B — regresión del servicio comercial /dashboard/sales/export
// con el contrato FEX v3: país CAT-020, bloqueo de bienes (tipoRegimen),
// product_code ≤ 25, corrección explícita de país legado y creación del
// DteOutgoingDocument 11 en TEST. DB in-memory; Prisma global prohibido.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, {
    get() {
      throw new Error("RUNTIME_UNSAFE: export-sale.service tocó el Prisma global.");
    },
  }),
}));

const { createSaleDraftMock, addSaleItemToDraftMock, confirmSaleMock, reserveMock, listCatalogMock } = vi.hoisted(() => ({
  createSaleDraftMock:    vi.fn(),
  addSaleItemToDraftMock: vi.fn(),
  confirmSaleMock:        vi.fn(),
  reserveMock:            vi.fn(),
  listCatalogMock:        vi.fn(),
}));

vi.mock("../../services/sale.service", () => ({
  createSaleDraft:    createSaleDraftMock,
  addSaleItemToDraft: addSaleItemToDraftMock,
  confirmSale:        confirmSaleMock,
}));
vi.mock("../../../dte/services/dte-correlative.service", () => ({
  reserveDteControlNumber: reserveMock,
}));
vi.mock("../../../dte/queries/list-dte-catalog-items", () => ({
  listDteCatalogItems: listCatalogMock,
}));

import {
  createExportSale,
  createForeignCustomer,
  updateForeignCustomerCountry,
} from "./export-sale.service";
import { FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR } from "../../../dte/utils/fex11-v3-rules";
import type { CreateExportSaleInput, CreateForeignCustomerInput } from "../schemas/export-sale.schemas";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";

const CATALOGS: Record<string, { item_code: string }[]> = {
  "CAT-015": [{ item_code: "C3" }],
  "CAT-027": [{ item_code: "02" }],
  "CAT-028": [{ item_code: "EX-1.1000.000" }],
  "CAT-031": [{ item_code: "09" }],
  "CAT-029": [{ item_code: "1" }, { item_code: "2" }],
  "CAT-022": [{ item_code: "03" }, { item_code: "36" }],
};

const COUNTRIES: Record<string, { code: string; name: string }> = {
  US: { code: "US", name: "Estados Unidos" },
  SV: { code: "SV", name: "El Salvador" },
};

function buildDb(opts: { customerCountry?: string; productCode?: string; productType?: string; isForeign?: boolean } = {}) {
  const dteCreate = vi.fn(async () => ({ id: "dte-new" }));
  const db = {
    customer: {
      findFirst: vi.fn(async () => ({
        id: CUSTOMER_ID, is_foreign: opts.isForeign ?? true,
        country_code: opts.customerCountry ?? "US", country_name: "Estados Unidos", customer_person_type: "2",
      })),
      create: vi.fn(async () => ({ id: "cust-new", customer_code: "EXP-1" })),
      update: vi.fn(async () => ({})),
    },
    country: {
      findFirst: vi.fn(async ({ where }: { where: { code: string } }) => COUNTRIES[where.code] ?? null),
    },
    product: {
      findMany: vi.fn(async () => [{
        id: PRODUCT_ID, name: "Plan online",
        product_code: opts.productCode ?? "SRV-PT-01",
        product_type: opts.productType ?? "SERVICE",
        unit: { mh_unit_code: "59" },
      }]),
    },
    dteIssuerConfig: {
      findMany: vi.fn(async () => [{ environment: "TEST" }]),
      findFirst: vi.fn(async () => ({
        id: "cfg-1", nit: "06141234567890", nrc: "1234567", name: "GYM", activity_code: "93110",
        activity_name: "Deportes", dept_code: "05", municipality_code: "11", address_complement: "Calle 1",
        phone: "22223333", email: "f@gym.test", cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
      })),
    },
    saleExportDetails: { create: vi.fn(async () => ({})) },
    sale: { findFirst: vi.fn(async () => ({ sale_code: "VTA-2026-09-0001" })) },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ dteOutgoingDocument: { create: dteCreate } })),
  };
  return { db, dteCreate };
}

function saleInput(overrides: Partial<CreateExportSaleInput> = {}): CreateExportSaleInput {
  return {
    sale_date: "2026-09-25",
    customer_id: CUSTOMER_ID,
    condition_operation_code: "1",
    payment_method_code: "01",
    payment_term_code: null,
    payment_term_value: null,
    notes: null,
    items: [{ product_id: PRODUCT_ID, quantity: 1, unit_price: 100, discount_amount: 0 }],
    item_type_export: 2,
    fiscal_precinct_code: null,
    regime_code: null,
    incoterm_code: null,
    incoterm_desc: null,
    insurance_amount: 0,
    freight_amount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listCatalogMock.mockImplementation(async ({ catalog_code }: { catalog_code: string }) => CATALOGS[catalog_code] ?? []);
  createSaleDraftMock.mockResolvedValue({ ok: true, id: "sale-1" });
  addSaleItemToDraftMock.mockResolvedValue({ ok: true });
  confirmSaleMock.mockResolvedValue({ ok: true });
  reserveMock.mockResolvedValue({ control_number: "DTE-11-M001P001-000000000000001" });
  // FEX11-FINAL-CLOSURE: sin flags — el ambiente sale del emisor activo.
  vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
  vi.stubEnv("DTE_FEX11_ENABLED", "");
  vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createExportSale — FEX v3", () => {
  it("exportación de servicios con país CAT-020 → DteOutgoingDocument 11 en TEST", async () => {
    const { db, dteCreate } = buildDb();

    const result = await createExportSale("tenant-1", "loc-1", "user-1", saleInput(), db as never);

    expect(result).toMatchObject({ ok: true, dte_document_id: "dte-new" });
    expect(dteCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dte_type_code: "11", environment: "TEST", dte_status: "PENDING_GENERATION" }),
    }));
    expect(db.saleExportDetails.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ country_code: "US", country_name: "Estados Unidos", item_type_export: 2 }),
    });
  });

  it("cliente con país legado (9540) → bloquea antes de crear la venta", async () => {
    const { db } = buildDb({ customerCountry: "9540" });

    const result = await createExportSale("tenant-1", "loc-1", "user-1", saleInput(), db as never);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("versión anterior");
    expect(createSaleDraftMock).not.toHaveBeenCalled();
  });

  it("exportación de bienes → bloqueada (tipoRegimen sin catálogo oficial) antes de mover inventario", async () => {
    const { db } = buildDb({ productType: "PRODUCT" });

    const result = await createExportSale("tenant-1", "loc-1", "user-1", saleInput({
      item_type_export: 1, fiscal_precinct_code: "02", regime_code: "EX-1.1000.000",
    }), db as never);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain(FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR);
    expect(createSaleDraftMock).not.toHaveBeenCalled();
    expect(confirmSaleMock).not.toHaveBeenCalled();
  });

  it("product_code > 25 → error claro, sin truncar ni crear venta", async () => {
    const longCode = "SRV-CODIGO-MUY-LARGO-00001";
    const { db } = buildDb({ productCode: longCode });

    const result = await createExportSale("tenant-1", "loc-1", "user-1", saleInput(), db as never);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors?.join(" ")).toContain(longCode);
    expect(createSaleDraftMock).not.toHaveBeenCalled();
  });

  it("bien dentro de una exportación declarada como servicios → error", async () => {
    const { db } = buildDb({ productType: "PRODUCT" });

    const result = await createExportSale("tenant-1", "loc-1", "user-1", saleInput(), db as never);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors?.join(" ")).toContain("es un bien");
  });
});

describe("createForeignCustomer — país CAT-020", () => {
  const input: CreateForeignCustomerInput = {
    name: "ACME", legal_name: null, id_type_code: "03", document_number: "AB123",
    country_code: "US", country_name: "texto libre del cliente", customer_person_type: "2",
    activity_name: "Servicios varios", address_complement: "Main St 1", phone: null, email: null,
  };

  it("guarda código y nombre oficiales CAT-020", async () => {
    const { db } = buildDb();

    const result = await createForeignCustomer("tenant-1", "user-1", input, db as never);

    expect(result.ok).toBe(true);
    expect(db.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ country_code: "US", country_name: "Estados Unidos" }),
    }));
  });

  it("código legado FEX v1 → rechazado", async () => {
    const { db } = buildDb();

    const result = await createForeignCustomer("tenant-1", "user-1", { ...input, country_code: "9540" }, db as never);

    expect(result.ok).toBe(false);
    expect(db.customer.create).not.toHaveBeenCalled();
  });
});

describe("updateForeignCustomerCountry — corrección explícita de país legado", () => {
  it("actualiza solo country_code/country_name con el valor CAT-020, scoped por tenant", async () => {
    const { db } = buildDb({ customerCountry: "9540" });

    const result = await updateForeignCustomerCountry("tenant-1", "user-1", CUSTOMER_ID, "US", db as never);

    expect(result).toEqual({ ok: true, country_code: "US", country_name: "Estados Unidos" });
    expect(db.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: CUSTOMER_ID, tenant_id: "tenant-1", status: "active" },
    }));
    expect(db.customer.update).toHaveBeenCalledWith({
      where: { id: CUSTOMER_ID },
      data:  { country_code: "US", country_name: "Estados Unidos", updated_by: "user-1" },
    });
  });

  it("código fuera de CAT-020 o El Salvador → no actualiza", async () => {
    const { db } = buildDb();

    expect((await updateForeignCustomerCountry("tenant-1", "user-1", CUSTOMER_ID, "9540", db as never)).ok).toBe(false);
    expect((await updateForeignCustomerCountry("tenant-1", "user-1", CUSTOMER_ID, "SV", db as never)).ok).toBe(false);
    expect(db.customer.update).not.toHaveBeenCalled();
  });

  it("cliente no extranjero → no actualiza", async () => {
    const { db } = buildDb({ isForeign: false });

    const result = await updateForeignCustomerCountry("tenant-1", "user-1", CUSTOMER_ID, "US", db as never);

    expect(result.ok).toBe(false);
    expect(db.customer.update).not.toHaveBeenCalled();
  });
});
