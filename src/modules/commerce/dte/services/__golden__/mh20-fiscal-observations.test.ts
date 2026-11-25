// ─────────────────────────────────────────────────────────────────
// MH20 (Fase 5.1D) — las notas internas (sale.notes / purchase.notes)
// nunca llegan al JSON fiscal MH 2.0. Solo las observaciones fiscales
// explícitas (DteBuildProfileOptions.observaciones) salen en
// resumen.observaciones. El perfil MH_1_2 conserva su salida histórica.
//
// Se inyecta una nota privada en el "loaded" de cada builder puro
// (envolviendo el export real) y se busca en el JSON serializado.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const SECRET = "NOTA-INTERNA-SECRETA-NO-FISCAL";
const captured: { fex?: unknown } = {};

vi.mock("../generate-fe-json.service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../generate-fe-json.service")>();
  return {
    ...orig,
    buildFeJsonFromLoadedData: ((input: any, ...rest: any[]) =>
      (orig.buildFeJsonFromLoadedData as any)({ ...input, sale: { ...input.sale, notes: SECRET } }, ...rest)) as typeof orig.buildFeJsonFromLoadedData,
  };
});
vi.mock("../generate-ccfe-json.service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../generate-ccfe-json.service")>();
  return {
    ...orig,
    buildCcfeJsonFromLoadedData: ((input: any, ...rest: any[]) =>
      (orig.buildCcfeJsonFromLoadedData as any)({ ...input, sale: { ...input.sale, notes: SECRET } }, ...rest)) as typeof orig.buildCcfeJsonFromLoadedData,
  };
});
vi.mock("../generate-fse-json.service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../generate-fse-json.service")>();
  return {
    ...orig,
    buildFseJsonFromLoadedData: ((loaded: any, ...rest: any[]) =>
      (orig.buildFseJsonFromLoadedData as any)({ ...loaded, purchase: { ...loaded.purchase, notes: SECRET } }, ...rest)) as typeof orig.buildFseJsonFromLoadedData,
  };
});
vi.mock("../generate-fex-json.service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../generate-fex-json.service")>();
  return {
    ...orig,
    buildFexJsonFromLoadedData: ((loaded: any) => {
      const withNote = { ...loaded, sale: { ...loaded.sale, notes: SECRET } };
      captured.fex = withNote;
      return orig.buildFexJsonFromLoadedData(withNote);
    }) as typeof orig.buildFexJsonFromLoadedData,
  };
});

import { buildMhTestScenarioJson } from "../../mh-test-runs/mh-test-scenarios";
import { buildFexJsonFromLoadedData, type FexLoadedData } from "../generate-fex-json.service";
import { generateNcJsonForDte } from "../generate-nc-json.service";
import { resolveMhTerritory20 } from "../../utils/dte-territory-projection";
import { resolveMh20FiscalObservations } from "../../utils/mh20-builder-helpers";
import { GOLDEN_CTX, GOLDEN_ISSUER, GOLDEN_NOW, goldenDoc, makeFakeDb } from "./mh20-fixtures";

const fakeDb = makeFakeDb({ docs: {}, issuer: {} }).db as unknown as PrismaClient;
const TAXPAYER = { deptCode: "06", municipalityCode: "14" };

async function terr(withReceptor: boolean) {
  const e = await resolveMhTerritory20({ role: "emisor", deptCode: GOLDEN_ISSUER.dept_code, municipalityCode: GOLDEN_ISSUER.municipality_code }, fakeDb);
  if (!e.ok) throw new Error(e.error);
  let r = null;
  if (withReceptor) {
    const rr = await resolveMhTerritory20({ role: "receptor", ...TAXPAYER }, fakeDb);
    if (!rr.ok) throw new Error(rr.error);
    r = rr.territory;
  }
  return { emisor: e.territory, receptor: r };
}

const serialized = (r: { ok: boolean; json?: unknown }) => JSON.stringify(r.ok ? r.json : null);

describe("5.1D — notas internas fuera del JSON fiscal MH 2.0", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(GOLDEN_NOW); });
  afterAll(() => vi.useRealTimers());

  it.each([
    ["FE v2", "FE01_IDENTIFICADO", "01", false],
    ["CCF v4", "CCFE03_ESTANDAR", "03", true],
    ["FSE v2", "FSE14_SERVICIOS", "14", true],
  ] as const)("%s: sale/purchase.notes no aparece; observaciones = null", async (_n, scenario, kind, withReceptor) => {
    const built = buildMhTestScenarioJson(GOLDEN_CTX, scenario, goldenDoc(kind, 9), 3, GOLDEN_NOW, {
      profile: "MH_2_0", territories: await terr(withReceptor),
    });
    expect(built.ok, built.ok ? "" : built.error).toBe(true);
    expect(serialized(built)).not.toContain(SECRET);
    expect((built as any).json.resumen.observaciones).toBeNull();
  });

  it.each([
    ["FE v2", "FE01_IDENTIFICADO", "01", false],
    ["CCF v4", "CCFE03_ESTANDAR", "03", true],
    ["FSE v2", "FSE14_SERVICIOS", "14", true],
  ] as const)("%s: observación fiscal explícita sí se envía", async (_n, scenario, kind, withReceptor) => {
    const built = buildMhTestScenarioJson(GOLDEN_CTX, scenario, goldenDoc(kind, 9), 3, GOLDEN_NOW, {
      profile: "MH_2_0", territories: await terr(withReceptor), observaciones: "  Entrega según contrato 45  ",
    });
    expect(built.ok, built.ok ? "" : built.error).toBe(true);
    expect((built as any).json.resumen.observaciones).toBe("Entrega según contrato 45");
    expect(serialized(built)).not.toContain(SECRET);
  });

  it("observación fiscal > 3000 → error explícito (sin recorte silencioso)", async () => {
    const built = buildMhTestScenarioJson(GOLDEN_CTX, "FE01_IDENTIFICADO", goldenDoc("01", 9), 3, GOLDEN_NOW, {
      profile: "MH_2_0", territories: await terr(false), observaciones: "x".repeat(3001),
    });
    expect(built.ok).toBe(false);
    expect(resolveMh20FiscalObservations("x".repeat(3000))).toEqual({ ok: true, value: "x".repeat(3000) });
    expect(resolveMh20FiscalObservations("   ")).toEqual({ ok: true, value: null });
  });

  it("FEX v3 con MH_2_0: sale.notes no aparece; explícita sí", () => {
    const base = buildMhTestScenarioJson(GOLDEN_CTX, "FEX11_SERVICIOS", goldenDoc("11", 9), 3, GOLDEN_NOW);
    expect(base.ok).toBe(true);
    const loaded = captured.fex as FexLoadedData;
    const v20 = buildFexJsonFromLoadedData({ ...loaded, profile: "MH_2_0" });
    expect(v20.ok).toBe(true);
    expect(serialized(v20)).not.toContain(SECRET);
    expect((v20 as any).json.resumen.observaciones).toBeNull();
    const explicit = buildFexJsonFromLoadedData({ ...loaded, profile: "MH_2_0", fiscalObservations: "Obs fiscal" });
    expect((explicit as any).json.resumen.observaciones).toBe("Obs fiscal");
  });

  it("NC v4: observaciones = null (sin fuente fiscal)", async () => {
    process.env.DTE_MH20_PROFILE_ENABLED = "true";
    try {
      const ccf = buildMhTestScenarioJson(GOLDEN_CTX, "CCFE03_ESTANDAR", goldenDoc("03", 9), 3, GOLDEN_NOW, {
        profile: "MH_2_0", territories: await terr(true),
      });
      expect(ccf.ok).toBe(true);
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
            reception_stamp: "2026SELLOFIXTURE", json_document: (ccf as any).json,
          },
        },
        issuer: { ...(GOLDEN_ISSUER as unknown as Record<string, unknown>), mh_spec_profile: "MH_2_0" },
        relation: { related_dte_document_id: "ccf-1" },
      });
      const res = await generateNcJsonForDte({ dteDocumentId: "nc-1", userId: "u1", tenantId: "t1", locationId: "l1" }, db as unknown as PrismaClient);
      expect(res.ok, res.ok ? "" : (res as any).error).toBe(true);
      const json = (updates[0]?.data as any)?.json_document;
      expect(json.identificacion.version).toBe(4);
      expect(json.resumen.observaciones).toBeNull();
    } finally {
      delete process.env.DTE_MH20_PROFILE_ENABLED;
    }
  });
});

describe("5.1D — perfil MH_1_2 intacto", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(GOLDEN_NOW); });
  afterAll(() => vi.useRealTimers());

  it("FE v1 / CCF v3 no envían sale.notes (como antes)", () => {
    for (const [scenario, kind] of [["FE01_IDENTIFICADO", "01"], ["CCFE03_ESTANDAR", "03"]] as const) {
      const built = buildMhTestScenarioJson(GOLDEN_CTX, scenario, goldenDoc(kind, 9), 3, GOLDEN_NOW);
      expect(built.ok).toBe(true);
      expect(serialized(built)).not.toContain(SECRET);
    }
  });

  it("FSE v1 y FEX v3 (1.2) conservan el comportamiento histórico: notes en observaciones (riesgo registrado)", () => {
    const fse = buildMhTestScenarioJson(GOLDEN_CTX, "FSE14_SERVICIOS", goldenDoc("14", 9), 3, GOLDEN_NOW);
    expect((fse as any).json.resumen.observaciones).toBe(SECRET);
    const fex = buildMhTestScenarioJson(GOLDEN_CTX, "FEX11_SERVICIOS", goldenDoc("11", 9), 3, GOLDEN_NOW);
    expect((fex as any).json.resumen.observaciones).toBe(SECRET);
  });
});
