// ─────────────────────────────────────────────────────────────────
// MH20 — fixtures MH_2_0 validadas contra los schemas OFICIALES 2.0
// (copia literal en schemas/mh/v2_0, SHA-256 = original) — IMP20-013..017.
//
// Cada documento 2.0 se valida tres veces:
//   1. AJV directo sobre el archivo oficial (independiente del servicio);
//   2. validateDteJsonAgainstOfficialSchema (selección por identificacion.version);
//   3. runMhSemanticRules (sin errores).
// Datos ficticios, base de datos falsa en memoria; nada se transmite.
// ─────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildMhTestScenarioJson, type MhTestScenarioCode } from "../../mh-test-runs/mh-test-scenarios";
import { generateNcJsonForDte } from "../generate-nc-json.service";
import { buildFseJsonFromLoadedData, type FseLoadedData } from "../generate-fse-json.service";
import { validateDteJsonAgainstOfficialSchema } from "../validate-dte-json-schema.service";
import { runMhSemanticRules } from "../../rules/mh-semantic-rules";
import { resolveMhTerritory20 } from "../../utils/dte-territory-projection";
import type { Mh20PartyTerritories } from "../../utils/mh20-builder-helpers";
import { GOLDEN_CTX, GOLDEN_ISSUER, GOLDEN_NOW, goldenDoc, makeFakeDb } from "./mh20-fixtures";

const V2_DIR = join(__dirname, "..", "..", "schemas", "mh", "v2_0");
const OFFICIAL: Record<string, string> = {
  "01": "fe-f-v2.json", "03": "fe-ccf-v4.json", "05": "fe-nc-v4.json", "14": "fe-fse-v2.json",
};

function officialValidate(kind: string, json: unknown): string[] {
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(join(V2_DIR, OFFICIAL[kind]), "utf8")));
  return validate(json) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

function expectValid20(kind: string, json: unknown): void {
  expect(officialValidate(kind, json)).toEqual([]);
  expect(validateDteJsonAgainstOfficialSchema(kind, json)).toEqual({ ok: true });
  expect(runMhSemanticRules(kind, json).errors).toEqual([]);
}

const fakeMunicipalityDb = makeFakeDb({ docs: {}, issuer: {} }).db as unknown as PrismaClient;

async function territories(receptor: { deptCode: string; municipalityCode: string } | null): Promise<Mh20PartyTerritories> {
  const e = await resolveMhTerritory20(
    { role: "emisor", deptCode: GOLDEN_ISSUER.dept_code, municipalityCode: GOLDEN_ISSUER.municipality_code }, fakeMunicipalityDb,
  );
  if (!e.ok) throw new Error(e.error);
  let r = null;
  if (receptor) {
    const rr = await resolveMhTerritory20({ role: "receptor", ...receptor }, fakeMunicipalityDb);
    if (!rr.ok) throw new Error(rr.error);
    r = rr.territory;
  }
  return { emisor: e.territory, receptor: r };
}

const TAXPAYER = { deptCode: "06", municipalityCode: "14" };

describe("MH_2_0 — builders validados contra schemas oficiales 2.0", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(GOLDEN_NOW);
  });
  afterAll(() => vi.useRealTimers());
  afterEach(() => { delete process.env.DTE_MH20_PROFILE_ENABLED; });

  const FE_CCF: Array<[string, MhTestScenarioCode, string, boolean, boolean]> = [
    ["FE v2 consumidor final", "FE01_CONSUMIDOR_FINAL", "01", false, false],
    ["FE v2 identificado",     "FE01_IDENTIFICADO",     "01", false, false],
    ["FE v2 contingencia",     "CONT01_FE",             "01", true,  false],
    ["CCF v4",                 "CCFE03_ESTANDAR",       "03", false, true],
    ["CCF v4 contingencia",    "CONT03_CCFE",           "03", true,  true],
  ];

  it.each(FE_CCF)("%s", async (_n, scenario, kind, contingency, withReceptor) => {
    const terr = await territories(withReceptor ? TAXPAYER : null);
    const built = buildMhTestScenarioJson(GOLDEN_CTX, scenario, goldenDoc(kind, 9, contingency), 3, GOLDEN_NOW, {
      profile: "MH_2_0", territories: terr,
    });
    expect(built.ok, built.ok ? "" : built.error).toBe(true);
    if (!built.ok) return;
    const json = built.json as Record<string, any>;
    expect(json.identificacion.version).toBe(kind === "01" ? 2 : 4);
    expect(json.emisor).not.toHaveProperty("codEstableMH");
    expect(json.emisor).not.toHaveProperty("tipoEstablecimiento");
    expect(json.emisor.direccion).toEqual({ departamento: "05", municipio: expect.any(String), distrito: expect.any(String), complemento: "Calle de prueba 123" });
    expect(json).not.toHaveProperty("extension");
    expect(json.resumen).not.toHaveProperty("reteRenta");
    expect(json.resumen).not.toHaveProperty("ivaRete1");
    if (!contingency) {
      expectValid20(kind, json);
      return;
    }
    // Fase 5.1C (cambio de expectativa registrado en 05-1-test-results.md):
    // el JSON en contingencia sigue siendo válido contra el schema oficial 2.0,
    // pero R20-PEND-01 (BLOCK_EMISSION) impide su emisión mientras el Evento de
    // Contingencia 2.0 esté bloqueado (INC-005, IMP20-019).
    expect(officialValidate(kind, json)).toEqual([]);
    const v = validateDteJsonAgainstOfficialSchema(kind, json);
    expect(v.ok).toBe(false);
    expect(runMhSemanticRules(kind, json).errors.map((e) => e.ruleId)).toEqual(["R20-PEND-01"]);
  });

  it("FE/CCF 2.0 rechazan numeroControl sin codificación AT", async () => {
    const terr = await territories(TAXPAYER);
    const doc = { ...goldenDoc("03", 9), control_number: "DTE-03-ABCD1234-000000000000009" };
    const built = buildMhTestScenarioJson(GOLDEN_CTX, "CCFE03_ESTANDAR", doc, 3, GOLDEN_NOW, { profile: "MH_2_0", territories: terr });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toMatch(/codificación de establecimiento/);
  });

  it("CCF 2.0 sin proyección territorial → error explícito (no se infiere)", () => {
    const built = buildMhTestScenarioJson(GOLDEN_CTX, "CCFE03_ESTANDAR", goldenDoc("03", 9), 3, GOLDEN_NOW, { profile: "MH_2_0" });
    expect(built.ok).toBe(false);
  });

  it("FSE v2 (receptor, sin ivaRete1, totalPagar = subTotal − reteRenta)", async () => {
    const terr = await territories(TAXPAYER);
    const built = buildMhTestScenarioJson(GOLDEN_CTX, "FSE14_SERVICIOS", goldenDoc("14", 9), 3, GOLDEN_NOW, {
      profile: "MH_2_0", territories: terr,
    });
    expect(built.ok, built.ok ? "" : built.error).toBe(true);
    if (!built.ok) return;
    const json = built.json as Record<string, any>;
    expect(json.identificacion.version).toBe(2);
    expect(json).not.toHaveProperty("sujetoExcluido");
    expect(json.receptor.direccion.distrito).toMatch(/^[0-9]{2}$/);
    expect(json.resumen).not.toHaveProperty("ivaRete1");
    expect(json.resumen.totalPagar).toBeCloseTo(json.resumen.subTotal - json.resumen.reteRenta, 2);
    expect(json.resumen.pagos[0].montoPago).toBe(json.resumen.totalPagar);
    expectValid20("14", json);
  });

  it("FSE v2 bloquea retención IVA 1% (IMP20-029, R20-DEL-03)", async () => {
    const terr = await territories(TAXPAYER);
    const base = buildMhTestScenarioJson(GOLDEN_CTX, "FSE14_SERVICIOS", goldenDoc("14", 9), 3, GOLDEN_NOW);
    expect(base.ok).toBe(true);
    // Reconstruye el loaded con retención 1 % activa sobre el builder puro.
    const loaded = {
      dteDoc: { control_number: goldenDoc("14").control_number, generation_code: goldenDoc("14").generation_code },
      purchase: {
        tenant_id: "t1", status: "CONFIRMED", document_type: "FSE", notes: null, payment_condition: "CASH", cancellation_type: null,
        retention_1pct_applies: true, retention_1pct_amount: 1, income_tax_withholding_applies: false, income_tax_withholding_amount: 0,
        supplier: {
          name: "SE", legal_name: null, taxpayer_type: "EXCLUDED_SUBJECT", id_type_code: "13", nit: null, dui: "00000000-0",
          other_document: null, activity_code: null, activity_name: null, dept_code: "06", municipality_code: "14",
          address_complement: "Col. Fixture", phone: null, email: null,
        },
        items: [{ dte_line_number: 1, quantity: 1, unit_cost: 100, line_subtotal: 100,
          product: { product_code: "X", name: "SERVICIO", product_type: "SERVICE", unit: { mh_unit_code: "59" } } }],
      },
      issuerConfig: { ...(GOLDEN_ISSUER as unknown as FseLoadedData["issuerConfig"]) },
    } as FseLoadedData;
    const v2 = buildFseJsonFromLoadedData(loaded, { profile: "MH_2_0", territories: terr });
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.error).toMatch(/ivaRete1/);
    // El perfil 1.2 conserva el comportamiento histórico (ivaRete1 permitido).
    const v1 = buildFseJsonFromLoadedData(loaded);
    expect(v1.ok).toBe(true);
  });

  it("FEX v3 es idéntica en ambos perfiles (IMP20-017)", () => {
    const a = buildMhTestScenarioJson(GOLDEN_CTX, "FEX11_SERVICIOS", goldenDoc("11", 9), 3, GOLDEN_NOW);
    const b = buildMhTestScenarioJson(GOLDEN_CTX, "FEX11_SERVICIOS", goldenDoc("11", 9), 3, GOLDEN_NOW, { profile: "MH_2_0" });
    expect(b).toEqual(a);
    if (a.ok) expect((a.json as any).identificacion.version).toBe(3);
  });

  async function ncOver(originJson: unknown) {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    const { db, updates } = makeFakeDb({
      docs: {
        "nc-1": {
          id: "nc-1", dte_type_code: "05", dte_status: "PENDING_GENERATION", mh_spec_profile: null,
          generation_code: "B1B2C3D4-E5F6-4234-8678-9ABCDEF01234", control_number: "DTE-05-M001P001-000000000000004",
          environment: "TEST", issuer_config_id: "iss-1", json_document: null,
        },
        "ccf-1": {
          id: "ccf-1", dte_type_code: "03", dte_status: "ACCEPTED",
          generation_code: "A1B2C3D4-E5F6-4234-8678-9ABCDEF01234", control_number: "DTE-03-M001P001-000000000000009",
          reception_stamp: "2026SELLOFIXTURE", json_document: originJson,
        },
      },
      issuer: { ...(GOLDEN_ISSUER as unknown as Record<string, unknown>), mh_spec_profile: "MH_2_0" },
      relation: { related_dte_document_id: "ccf-1" },
    });
    const res = await generateNcJsonForDte(
      { dteDocumentId: "nc-1", userId: "u1", tenantId: "t1", locationId: "l1" }, db as unknown as PrismaClient,
    );
    return { res, update: updates[0]?.data };
  }

  it("NC v4 sobre CCF v4 (fórmulas campos 143–153)", async () => {
    const terr = await territories(TAXPAYER);
    const ccf = buildMhTestScenarioJson(GOLDEN_CTX, "CCFE03_ESTANDAR", goldenDoc("03", 9), 3, GOLDEN_NOW, { profile: "MH_2_0", territories: terr });
    expect(ccf.ok).toBe(true);
    if (!ccf.ok) return;
    const { res, update } = await ncOver(ccf.json);
    expect(res.ok, res.ok ? "" : res.message).toBe(true);
    const json = update?.json_document as Record<string, any>;
    expect(json.identificacion.version).toBe(4);
    expect(update?.mh_spec_profile).toBe("MH_2_0");
    const r = json.resumen;
    expect(r.codigoRetencionMH).toBeNull();
    expect(r.montoTotalOperacion).toBeCloseTo(r.subTotalVentas + r.tributos[0].valor, 2);
    expect(r.totalPagar).toBeCloseTo(r.montoTotalOperacion + r.ivaPerci - r.ivaRete + r.totalNoGravado, 2);
    expect(json.receptor.direccion).toEqual((ccf.json as any).receptor.direccion);
    expectValid20("05", json);
  });

  it("NC v4 sobre CCF v3 histórico (dirección receptor proyectada)", async () => {
    const ccf = buildMhTestScenarioJson(GOLDEN_CTX, "CCFE03_ESTANDAR", goldenDoc("03", 9), 3, GOLDEN_NOW);
    expect(ccf.ok).toBe(true);
    if (!ccf.ok) return;
    const { res, update } = await ncOver(ccf.json);
    expect(res.ok, res.ok ? "" : res.message).toBe(true);
    const json = update?.json_document as Record<string, any>;
    expect(json.identificacion.version).toBe(4);
    expect(json.receptor.direccion.distrito).toMatch(/^[0-9]{2}$/);
    expectValid20("05", json);
  });
});

describe("MH_2_0 — reglas semánticas negativas", () => {
  async function ccf20(): Promise<Record<string, any>> {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(GOLDEN_NOW);
    const built = buildMhTestScenarioJson(GOLDEN_CTX, "CCFE03_ESTANDAR", goldenDoc("03", 9), 3, GOLDEN_NOW, {
      profile: "MH_2_0", territories: await territories(TAXPAYER),
    });
    vi.useRealTimers();
    if (!built.ok) throw new Error(built.error);
    return structuredClone(built.json) as Record<string, any>;
  }

  it("totalPagar fuera de holgura ±0.01 → R20-TOT-01", async () => {
    const json = await ccf20();
    json.resumen.totalPagar = Math.round((json.resumen.totalPagar + 0.05) * 100) / 100;
    const ids = runMhSemanticRules("03", json).errors.map((e) => e.ruleId);
    expect(ids).toContain("R20-TOT-01");
    const v = validateDteJsonAgainstOfficialSchema("03", json);
    expect(v.ok).toBe(false);
  });

  it("totalPagar dentro de holgura ±0.01 → sin error", async () => {
    const json = await ccf20();
    json.resumen.totalPagar = Math.round((json.resumen.totalPagar + 0.01) * 100) / 100;
    expect(runMhSemanticRules("03", json).errors.map((e) => e.ruleId)).not.toContain("R20-TOT-01");
  });

  it("municipio inexistente en CAT-013 2.0 → R20-TERR-01", async () => {
    const json = await ccf20();
    json.receptor.direccion.municipio = "99";
    expect(runMhSemanticRules("03", json).errors.map((e) => e.ruleId)).toContain("R20-TERR-01");
  });

  // Fase 6.1: Cabañas ya no se bloquea por CAT-INC-001; la regla valida la
  // jerarquía completa. 09/10 (ESTE) + distrito 01 (Cinquera, OESTE) es inválido.
  it("Cabañas con distrito de otro municipio (09/10/01) → R20-TERR-01 jerarquía", async () => {
    const json = await ccf20();
    json.receptor.direccion = { ...json.receptor.direccion, departamento: "09", municipio: "10", distrito: "01" };
    expect(runMhSemanticRules("03", json).errors.map((e) => e.ruleId)).toContain("R20-TERR-01");
  });

  it("Cabañas válido 2.0 (09/10/06 Sensuntepeque, 09/11/01 Cinquera) → sin R20-TERR-01", async () => {
    for (const [mun, dis] of [["10", "06"], ["11", "01"]]) {
      const json = await ccf20();
      json.receptor.direccion = { ...json.receptor.direccion, departamento: "09", municipio: mun, distrito: dis };
      expect(runMhSemanticRules("03", json).errors.map((e) => e.ruleId)).not.toContain("R20-TERR-01");
    }
  });

  it("establecimiento fuera de codificación AT → R20-EST-01", async () => {
    const json = await ccf20();
    json.identificacion.numeroControl = "DTE-03-ABCD1234-000000000000009";
    expect(runMhSemanticRules("03", json).errors.map((e) => e.ruleId)).toContain("R20-EST-01");
  });
});
