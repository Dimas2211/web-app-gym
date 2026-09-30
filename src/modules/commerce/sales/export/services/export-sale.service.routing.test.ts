// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale.service.routing.test.ts
//
// FEX-PROD-1 — routing TEST/PRODUCTION de la creación FEX 11 y guard
// services-only (bienes/mixto fail-closed). Una sola DB fake (shared
// runtime) con dos tenants:
//   Tenant A = TrustMe      (emisores propios)
//   Tenant B = Metatraining (sin emisor, o con ambiente distinto)
// Prisma global prohibido; sin red, sin escrituras remotas.
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
  loadActiveIssuerConfigOrError,
  regenerateRejectedExportDte,
  resolveFex11AvailabilityForLocation,
} from "./export-sale.service";
import { FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR } from "../../../dte/utils/fex11-v3-rules";
import type { CreateExportSaleInput } from "../schemas/export-sale.schemas";

const TENANT_A = "tenant-trustme";
const TENANT_B = "efe111b0-6264-484f-8b05-ff1276e1eb0c"; // Metatraining
const LOC_A = "loc-trustme";
const LOC_B = "loc-metatraining";

const PRODUCT_ID  = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";

const CATALOGS: Record<string, { item_code: string }[]> = {
  "CAT-015": [{ item_code: "C3" }],
  "CAT-027": [{ item_code: "02" }],
  "CAT-028": [{ item_code: "EX-1.1000.000" }],
  "CAT-031": [{ item_code: "09" }],
};

interface IssuerRow {
  id: string; tenant_id: string; location_id: string;
  environment: "TEST" | "PRODUCTION"; is_active: boolean;
}

function issuer(id: string, tenant_id: string, location_id: string, environment: "TEST" | "PRODUCTION", is_active = true): IssuerRow {
  return { id, tenant_id, location_id, environment, is_active };
}

const ISSUER_FIELDS = {
  nit: "06141234567890", nrc: "1234567", name: "Emisor", activity_code: "93110",
  activity_name: "Deportes", dept_code: "05", municipality_code: "11", address_complement: "Calle 1",
  phone: "22223333", email: "f@emisor.test", cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
};

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

// DB compartida: emisores y documentos de ambos tenants en las mismas "tablas".
function sharedDb(opts: { issuers: IssuerRow[]; docs?: Record<string, unknown>[]; productType?: string }) {
  const createdDocs: Record<string, unknown>[] = [];
  const db = {
    customer: {
      findFirst: vi.fn(async () => ({
        id: CUSTOMER_ID, is_foreign: true, country_code: "US", country_name: "Estados Unidos", customer_person_type: "2",
      })),
    },
    country: { findFirst: vi.fn(async () => ({ code: "US", name: "Estados Unidos" })) },
    product: {
      findMany: vi.fn(async () => [{
        id: PRODUCT_ID, name: "Plan online", product_code: "SRV-01",
        product_type: opts.productType ?? "SERVICE", unit: { mh_unit_code: "59" },
      }]),
    },
    dteIssuerConfig: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        opts.issuers.filter((r) => matches(r as unknown as Record<string, unknown>, where)).map((r) => ({ environment: r.environment }))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = opts.issuers.find((r) => matches(r as unknown as Record<string, unknown>, where));
        return row ? { ...ISSUER_FIELDS, id: row.id, environment: row.environment } : null;
      }),
    },
    dteOutgoingDocument: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        (opts.docs ?? []).find((d) => matches(d, where)) ?? null),
    },
    saleExportDetails: { create: vi.fn(async () => ({})) },
    sale: { findFirst: vi.fn(async () => ({ sale_code: "VTA-1" })) },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        dteOutgoingDocument: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            createdDocs.push(data);
            return { id: `dte-${createdDocs.length}` };
          }),
        },
      })),
  };
  return { db, createdDocs };
}

function saleInput(overrides: Partial<CreateExportSaleInput> = {}): CreateExportSaleInput {
  return {
    sale_date: "2026-09-28", customer_id: CUSTOMER_ID, condition_operation_code: "1",
    payment_method_code: "01", payment_term_code: null, payment_term_value: null, notes: null,
    items: [{ product_id: PRODUCT_ID, quantity: 1, unit_price: 100, discount_amount: 0 }],
    item_type_export: 2, fiscal_precinct_code: null, regime_code: null,
    incoterm_code: null, incoterm_desc: null, insurance_amount: 0, freight_amount: 0,
    ...overrides,
  };
}

function expectNothingCreated(db: ReturnType<typeof sharedDb>["db"]) {
  expect(createSaleDraftMock).not.toHaveBeenCalled();
  expect(confirmSaleMock).not.toHaveBeenCalled();
  expect(reserveMock).not.toHaveBeenCalled();
  expect(db.$transaction).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  // Hermético: los antiguos flags FEX no deben influir (FEX11-FINAL-CLOSURE).
  vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
  vi.stubEnv("DTE_FEX11_ENABLED", "");
  vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "");
  listCatalogMock.mockImplementation(async ({ catalog_code }: { catalog_code: string }) => CATALOGS[catalog_code] ?? []);
  createSaleDraftMock.mockResolvedValue({ ok: true, id: "sale-1" });
  addSaleItemToDraftMock.mockResolvedValue({ ok: true });
  confirmSaleMock.mockResolvedValue({ ok: true });
  reserveMock.mockResolvedValue({ control_number: "DTE-11-M001P001-000000000000001" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── Routing de ambiente ────────────────────────────────────────────

describe("createExportSale — routing TEST/PRODUCTION (FEX-PROD-1)", () => {
  it("emisor TEST (sin env vars) -> DTE 11 TEST con issuer TEST; correlativo reservado en TEST", async () => {
    const { db, createdDocs } = sharedDb({ issuers: [issuer("A-test", TENANT_A, LOC_A, "TEST")] });

    const result = await createExportSale(TENANT_A, LOC_A, "u1", saleInput(), db as never);

    expect(result.ok).toBe(true);
    expect(createdDocs[0]).toMatchObject({ dte_type_code: "11", environment: "TEST", issuer_config_id: "A-test", tenant_id: TENANT_A });
    expect(reserveMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      tenant_id: TENANT_A, location_id: LOC_A, issuer_config_id: "A-test", environment: "TEST", dte_type_code: "11",
    }));
  });

  it("emisor PROD (sin env vars) -> DTE 11 PRODUCTION con issuer PROD; correlativo reservado en PRODUCTION", async () => {
    const { db, createdDocs } = sharedDb({ issuers: [issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION")] });

    const result = await createExportSale(TENANT_A, LOC_A, "u1", saleInput(), db as never);

    expect(result.ok).toBe(true);
    expect(createdDocs[0]).toMatchObject({ dte_type_code: "11", environment: "PRODUCTION", issuer_config_id: "A-prod" });
    expect(reserveMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      issuer_config_id: "A-prod", environment: "PRODUCTION",
    }));
  });

  it("TEST y PRODUCTION activos a la vez -> no infiere ambiente, falla", async () => {
    const { db } = sharedDb({ issuers: [
      issuer("A-test", TENANT_A, LOC_A, "TEST"), issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION"),
    ] });

    const result = await createExportSale(TENANT_A, LOC_A, "u1", saleInput(), db as never);

    expect(result.ok).toBe(false);
    expectNothingCreated(db);
  });

  it("emisor inactivo no cuenta como ambiente efectivo", async () => {
    const { db } = sharedDb({ issuers: [issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION", false)] });

    const result = await createExportSale(TENANT_A, LOC_A, "u1", saleInput(), db as never);

    expect(result.ok).toBe(false);
    expectNothingCreated(db);
  });
});

describe("loadActiveIssuerConfigOrError — ambiente exacto, sin fallback", () => {
  it("PRODUCTION con solo emisor TEST -> error (sin fallback TEST)", async () => {
    const { db } = sharedDb({ issuers: [issuer("A-test", TENANT_A, LOC_A, "TEST")] });
    const r = await loadActiveIssuerConfigOrError(TENANT_A, LOC_A, "PRODUCTION", db as never);
    expect(r.ok).toBe(false);
    expect(db.dteIssuerConfig.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: TENANT_A, location_id: LOC_A, environment: "PRODUCTION", is_active: true },
    }));
  });

  it("TEST con solo emisor PROD -> error (sin fallback PROD)", async () => {
    const { db } = sharedDb({ issuers: [issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION")] });
    expect((await loadActiveIssuerConfigOrError(TENANT_A, LOC_A, "TEST", db as never)).ok).toBe(false);
  });

  it("emisor exacto -> ok con su ambiente", async () => {
    const { db } = sharedDb({ issuers: [issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION")] });
    const r = await loadActiveIssuerConfigOrError(TENANT_A, LOC_A, "PRODUCTION", db as never);
    expect(r).toMatchObject({ ok: true, issuer: { id: "A-prod", environment: "PRODUCTION" } });
  });
});

// ── Services-only guard ────────────────────────────────────────────

describe("createExportSale — services-only (bienes/mixto fail-closed)", () => {
  for (const env of ["TEST", "PRODUCTION"] as const) {

    it(`${env}: servicios (item_type_export=2) -> permitido`, async () => {
      const { db, createdDocs } = sharedDb({ issuers: [issuer("A-1", TENANT_A, LOC_A, env)] });

      const result = await createExportSale(TENANT_A, LOC_A, "u1", saleInput(), db as never);

      expect(result.ok).toBe(true);
      expect(createdDocs[0]).toMatchObject({ environment: env });
    });

    for (const [label, type] of [["bienes", 1], ["mixto", 3]] as const) {
      it(`${env}: ${label} (item_type_export=${type}) -> bloqueado antes de crear venta, correlativo o DTE`, async () => {
        const { db } = sharedDb({ issuers: [issuer("A-1", TENANT_A, LOC_A, env)], productType: "PRODUCT" });

        const result = await createExportSale(TENANT_A, LOC_A, "u1", saleInput({
          item_type_export: type, fiscal_precinct_code: "02", regime_code: "EX-1.1000.000",
        }), db as never);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toContain(FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR);
        expect(db.dteIssuerConfig.findMany).not.toHaveBeenCalled();
        expectNothingCreated(db);
      });
    }
  }
});

// ── Shared runtime isolation (TrustMe / Metatraining) ─────────────

describe("Shared runtime — aislamiento Tenant A (TrustMe) / Tenant B (Metatraining)", () => {
  it("B sin emisor propio no puede usar el emisor de A (misma DB) -> falla, nada creado", async () => {
    const { db } = sharedDb({ issuers: [
      issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION"),
      // Emisor de A usado con la location de B: sigue siendo de A.
      issuer("A-prod-2", TENANT_A, LOC_B, "PRODUCTION"),
    ] });

    const result = await createExportSale(TENANT_B, LOC_B, "u-b", saleInput(), db as never);

    expect(result.ok).toBe(false);
    expectNothingCreated(db);
    expect(db.dteIssuerConfig.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenant_id: TENANT_B, location_id: LOC_B }),
    }));
  });

  it("A en PRODUCTION y B en TEST en la misma DB -> cada uno con su emisor/ambiente/correlativo, sin mezcla", async () => {
    const { db, createdDocs } = sharedDb({ issuers: [
      issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION"),
      issuer("B-test", TENANT_B, LOC_B, "TEST"),
    ] });

    expect((await createExportSale(TENANT_A, LOC_A, "u-a", saleInput(), db as never)).ok).toBe(true);
    expect((await createExportSale(TENANT_B, LOC_B, "u-b", saleInput(), db as never)).ok).toBe(true);

    expect(createdDocs[0]).toMatchObject({ tenant_id: TENANT_A, issuer_config_id: "A-prod", environment: "PRODUCTION" });
    expect(createdDocs[1]).toMatchObject({ tenant_id: TENANT_B, issuer_config_id: "B-test", environment: "TEST" });
    expect(reserveMock.mock.calls[0][1]).toMatchObject({ tenant_id: TENANT_A, issuer_config_id: "A-prod", environment: "PRODUCTION" });
    expect(reserveMock.mock.calls[1][1]).toMatchObject({ tenant_id: TENANT_B, issuer_config_id: "B-test", environment: "TEST" });
  });

  it("B no puede abrir/regenerar un DTE de A ni consumir su correlativo", async () => {
    const { db } = sharedDb({
      issuers: [issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION")],
      docs: [{
        id: "dte-A", tenant_id: TENANT_A, location_id: LOC_A, dte_type_code: "11",
        sale_id: "sale-A", dte_status: "REJECTED", issuer_config_id: "A-prod", environment: "PRODUCTION",
      }],
    });

    const result = await regenerateRejectedExportDte(TENANT_B, LOC_B, "dte-A", db as never);

    expect(result.ok).toBe(false);
    expect(reserveMock).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("disponibilidad por sucursal: A (emisor PROD) sí, B (sin emisor) no", async () => {
    const { db } = sharedDb({ issuers: [issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION")] });

    expect(await resolveFex11AvailabilityForLocation(TENANT_A, LOC_A, db as never)).toEqual({ enabled: true, environment: "PRODUCTION" });
    expect(await resolveFex11AvailabilityForLocation(TENANT_B, LOC_B, db as never)).toEqual({ enabled: false, environment: null });
  });
});

describe("regenerateRejectedExportDte — hereda ambiente del documento original", () => {
  const REJECTED_PROD = {
    id: "dte-A", tenant_id: TENANT_A, location_id: LOC_A, dte_type_code: "11",
    sale_id: "sale-A", dte_status: "REJECTED", issuer_config_id: "A-prod", environment: "PRODUCTION",
  };

  it("rechazado PROD -> nuevo DTE PROD con el mismo emisor", async () => {
    const { db, createdDocs } = sharedDb({ issuers: [issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION")], docs: [REJECTED_PROD] });

    const result = await regenerateRejectedExportDte(TENANT_A, LOC_A, "dte-A", db as never);

    expect(result.ok).toBe(true);
    expect(createdDocs[0]).toMatchObject({ environment: "PRODUCTION", issuer_config_id: "A-prod" });
  });

  it("rechazado PROD apuntando a emisor TEST (mismatch) -> falla", async () => {
    const { db } = sharedDb({ issuers: [issuer("A-test", TENANT_A, LOC_A, "TEST")], docs: [{ ...REJECTED_PROD, issuer_config_id: "A-test" }] });

    const result = await regenerateRejectedExportDte(TENANT_A, LOC_A, "dte-A", db as never);

    expect(result.ok).toBe(false);
    expect(reserveMock).not.toHaveBeenCalled();
  });
});

// FEX11-FINAL-CLOSURE — gate de /dashboard/sales/export a nivel de sucursal:
// emisor activo único en la DB runtime recibida. Sin flags DTE_FEX11_*
// (el gate de módulo fiscal.dte vive en resolveSalesExportAvailability).
describe("resolveFex11AvailabilityForLocation — gate de /dashboard/sales/export", () => {
  it("emisor TEST activo y sin ningún DTE_FEX11_* -> habilitado en TEST, resuelto contra la DB runtime recibida", async () => {
    const { db } = sharedDb({ issuers: [issuer("A-test", TENANT_A, LOC_A, "TEST")] });

    expect(await resolveFex11AvailabilityForLocation(TENANT_A, LOC_A, db as never)).toEqual({ enabled: true, environment: "TEST" });
    expect(db.dteIssuerConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenant_id: TENANT_A, location_id: LOC_A, is_active: true } }),
    );
  });

  it("emisor PROD activo y sin ningún DTE_FEX11_* -> habilitado en PRODUCTION", async () => {
    const { db } = sharedDb({ issuers: [issuer("A-prod", TENANT_A, LOC_A, "PRODUCTION")] });

    expect(await resolveFex11AvailabilityForLocation(TENANT_A, LOC_A, db as never)).toEqual({ enabled: true, environment: "PRODUCTION" });
  });

  it("sin emisor activo -> deshabilitado", async () => {
    const { db } = sharedDb({ issuers: [issuer("A-test", TENANT_A, LOC_A, "TEST", false)] });

    expect(await resolveFex11AvailabilityForLocation(TENANT_A, LOC_A, db as never)).toEqual({ enabled: false, environment: null });
  });
});
