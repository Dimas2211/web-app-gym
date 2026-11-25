// ─────────────────────────────────────────────────────────────────
// MH20 (Fase 5.1F) — FEX v3 bajo el perfil MH_2_0.
//
// Contrato estructural: el schema oficial del paquete 2.0
// (originales/svfe-json-schemas/v3/fe-fex-v3.json) tiene el MISMO SHA-256
// que schemas/mh/fex-11-v3.schema.json. Las diferencias efectivas 2.0 son
// semánticas y ya implementadas en el motor base:
//   - observaciones: sin notas internas (5.1D);
//   - Cabañas: 5.1B error explícito (CAT-INC-001) → Fase 6.1 CAT-013 2.0 por perfil;
//   - bienes: bloqueado con causa 2.0 (CAT-028 / CAT-033, CAT-INC-004);
//   - versión 3 pendiente de confirmación (INC-003): PRODUCTION bloqueado.
// Fixtures validadas con AJV directo contra el archivo ORIGINAL.
// ─────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, { get() { throw new Error("RUNTIME_UNSAFE: prisma global"); } }),
}));
vi.mock("../../utils/dte-territory.resolver", () => ({
  validateDteAddressCodes: vi.fn(async () => ({ ok: true })),
  resolveDteMunicipality: vi.fn(),
}));

import { buildFexJsonFromLoadedData, generateFexJsonForSale, type FexLoadedData } from "../generate-fex-json.service";
import { resolveDteMunicipality } from "../../utils/dte-territory.resolver";
import { assertDteSpecGenerationAllowed } from "../../spec/resolve-active-dte-spec-profile";
import { FEX_GOODS_MH20_BLOCKED_ERROR, FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR } from "../../utils/fex11-v3-rules";
import { GOLDEN_CTX, GOLDEN_NOW, goldenDoc } from "./mh20-fixtures";

const REPO = join(__dirname, "..", "..", "..", "..", "..", "..");
const OFFICIAL_FEX = join(REPO, "docs", "fiscal", "mh-normativa-2.0", "originales", "svfe-json-schemas", "v3", "fe-fex-v3.json");
const CURRENT_FEX = join(__dirname, "..", "..", "schemas", "mh", "fex-11-v3.schema.json");

function validateOfficial(json: unknown): string[] {
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(OFFICIAL_FEX, "utf8")));
  return validate(json) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

/** loaded FEX servicios de la batería MH TEST (datos ficticios). */
function servicesLoaded(): FexLoadedData {
  return {
    tenant_id: GOLDEN_CTX.issuer.tenant_id,
    dteDoc: { control_number: goldenDoc("11", 9).control_number, generation_code: goldenDoc("11", 9).generation_code },
    sale: {
      status: "CONFIRMED", inventory_moved: true, customer_id: "c-ext", primary_dte_type_code: "11",
      condition_operation_code: "1", payment_method_code: "01", payment_term_code: null, payment_term_value: null,
      total_amount: 300, notes: "NOTA INTERNA",
      customer: {
        id: "c-ext", name: "FOREIGN BUYER LLC", legal_name: null, id_type_code: "37", nit: null, dui: "P1234567",
        activity_name: "Comercio", address_complement: "100 Main St", phone: null, email: "buyer@example.com",
        is_foreign: true, country_code: "US", country_name: "ESTADOS UNIDOS", customer_person_type: "2",
      },
      export_details: {
        tenant_id: GOLDEN_CTX.issuer.tenant_id, item_type_export: 2, fiscal_precinct_code: null, regime_code: null,
        incoterm_code: null, incoterm_desc: null, insurance_amount: 0, freight_amount: 0,
      },
      items: [{
        line_number: 1, product_code_snapshot: "SRV-1", product_name_snapshot: "SERVICIO DE CONSULTORIA",
        product_type_snapshot: "SERVICE", quantity: 1, unit_price: 300, discount_amount: 0, tax_rate_snapshot: 0,
        line_subtotal: 300, line_total: 300, product: { unit: { mh_unit_code: "59" } },
      }],
      payments: [{ mh_payment_form_code: "01", amount: 300, reference: null }],
    },
    issuerConfig: {
      nit: GOLDEN_CTX.issuer.nit, nrc: GOLDEN_CTX.issuer.nrc, name: GOLDEN_CTX.issuer.name, legal_name: GOLDEN_CTX.issuer.legal_name,
      activity_code: GOLDEN_CTX.issuer.activity_code, activity_name: GOLDEN_CTX.issuer.activity_name,
      establishment_code: GOLDEN_CTX.issuer.establishment_code, point_of_sale_code: GOLDEN_CTX.issuer.point_of_sale_code,
      dept_code: GOLDEN_CTX.issuer.dept_code, municipality_code: GOLDEN_CTX.issuer.municipality_code,
      address_complement: GOLDEN_CTX.issuer.address_complement, phone: GOLDEN_CTX.issuer.phone, email: GOLDEN_CTX.issuer.email,
      environment: "TEST",
    },
    emisorFexTerritory: GOLDEN_CTX.emisorFexTerritory,
    receptorCountry:    { code: "US", name: "ESTADOS UNIDOS" },
  } as unknown as FexLoadedData;
}

describe("FEX v3 — contrato 2.0", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(GOLDEN_NOW); });
  afterAll(() => vi.useRealTimers());

  it("schema oficial 2.0 fe-fex-v3.json = fex-11-v3.schema.json (SHA-256)", () => {
    expect(sha(OFFICIAL_FEX)).toBe(sha(CURRENT_FEX));
  });

  it("fixture 2.0 servicios (sin observaciones) válida contra el schema oficial 2.0", () => {
    const r = buildFexJsonFromLoadedData({ ...servicesLoaded(), profile: "MH_2_0" });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (!r.ok) return;
    expect(r.json.identificacion.version).toBe(3);
    expect(r.json.resumen.observaciones).toBeNull();
    expect(JSON.stringify(r.json)).not.toContain("NOTA INTERNA");
    expect(validateOfficial(r.json)).toEqual([]);
  });

  it("fixture 2.0 servicios con observación fiscal explícita válida contra el schema oficial 2.0", () => {
    const r = buildFexJsonFromLoadedData({ ...servicesLoaded(), profile: "MH_2_0", fiscalObservations: "Servicio prestado según contrato 2026-45" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.json.resumen.observaciones).toBe("Servicio prestado según contrato 2026-45");
    expect(validateOfficial(r.json)).toEqual([]);
  });

  it("MH_1_2: misma fixture conserva sale.notes (histórico) y también es válida", () => {
    const r = buildFexJsonFromLoadedData(servicesLoaded());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.json.resumen.observaciones).toBe("NOTA INTERNA");
    expect(validateOfficial(r.json)).toEqual([]);
  });

  it("bienes: bloqueado en ambos perfiles, con causa 2.0 específica", () => {
    const goods = servicesLoaded();
    (goods.sale as any).export_details = { ...(goods.sale as any).export_details, item_type_export: 1 };
    const v20 = buildFexJsonFromLoadedData({ ...goods, profile: "MH_2_0" });
    const v12 = buildFexJsonFromLoadedData(goods);
    expect(v20).toEqual({ ok: false, error: FEX_GOODS_MH20_BLOCKED_ERROR });
    expect(v12).toEqual({ ok: false, error: FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR });
  });

  it("INC-003: versión 3 con MH_2_0 solo en TEST (PRODUCTION fail-closed)", () => {
    expect(assertDteSpecGenerationAllowed("MH_2_0", "11", "TEST")).toMatchObject({ ok: true, warning: expect.stringMatching(/INC-003/) });
    expect(assertDteSpecGenerationAllowed("MH_2_0", "11", "PRODUCTION")).toMatchObject({ ok: false });
    expect(assertDteSpecGenerationAllowed("MH_1_2", "11", "PRODUCTION")).toMatchObject({ ok: true, warning: null });
  });
});

describe("generateFexJsonForSale — Cabañas por perfil (CAT-013 v1.1, Fase 6.1)", () => {
  const issuer = (dept: string, profile: string | null) => ({
    nit: "06140101011011", nrc: "1234567", name: "Emisor", legal_name: null,
    activity_code: "62010", activity_name: "Programación", establishment_code: "M001", establishment_type_code: "02",
    point_of_sale_code: "P001", cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
    dept_code: dept, municipality_code: "10", address_complement: "Barrio El Centro",
    phone: "22222222", email: "e@example.com", environment: "TEST", mh_spec_profile: profile,
  });
  const fakeDb = (dept: string, profile: string | null) => {
    const loaded = servicesLoaded();
    return {
      dteOutgoingDocument: { findFirst: vi.fn().mockResolvedValue({
        id: "dte-1", dte_type_code: "11", generation_code: loaded.dteDoc.generation_code, control_number: loaded.dteDoc.control_number,
        environment: "TEST", sale_id: "s-1", issuer_config_id: "cfg-1",
      }) },
      sale: { findFirst: vi.fn().mockResolvedValue({ id: "s-1", location_id: "l-1", ...loaded.sale }) },
      dteIssuerConfig: { findFirst: vi.fn().mockResolvedValue(issuer(dept, profile)) },
      country: { findFirst: vi.fn().mockResolvedValue({ code: "US", name: "ESTADOS UNIDOS" }) },
    };
  };

  beforeEach(() => {
    vi.mocked(resolveDteMunicipality).mockResolvedValue({
      departmentCode: "09", municipalityCode: "10", districtCode: "090110",
      districtName: "Sensuntepeque", newMunicipalityCode: "0901", newMunicipalityName: "Cabañas Este",
    } as never);
  });
  afterAll(() => { delete process.env.DTE_MH20_PROFILE_ENABLED; });

  it("MH_1_2 (interruptor OFF): comportamiento histórico, no bloquea por Cabañas", async () => {
    delete process.env.DTE_MH20_PROFILE_ENABLED;
    const r = await generateFexJsonForSale({ tenant_id: GOLDEN_CTX.issuer.tenant_id, location_id: "l-1", dte_document_id: "dte-1" }, fakeDb("09", null) as never);
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (r.ok) expect(r.json.emisor.direccion).toMatchObject({ departamento: "09", municipio: "11", distrito: "10" });
  });

  // Fase 6.1 (CAT-013 v1.1, consultas §13): cambio de expectativa
  // justificado. MH_2_0 ya no bloquea: usa CAT-013 2.0 (Cabañas Este = 10).
  it("MH_2_0 (TEST): proyecta con CAT-013 2.0 (Cabañas Este → 10); 1.2 daría 11", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    const r = await generateFexJsonForSale({ tenant_id: GOLDEN_CTX.issuer.tenant_id, location_id: "l-1", dte_document_id: "dte-1" }, fakeDb("09", "MH_2_0") as never);
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (r.ok) expect(r.json.emisor.direccion).toMatchObject({ departamento: "09", municipio: "10", distrito: "10" });
  });
});
