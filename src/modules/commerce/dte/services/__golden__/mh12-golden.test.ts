// ─────────────────────────────────────────────────────────────────
// MH20 — regresión golden del perfil MH_1_2 (IMP20-013..016, IMP20-035).
//
// Los archivos *.golden.json se capturaron con el código ANTERIOR a la
// adaptación 2.0 (MH20_GOLDEN_CAPTURE=1, rama feat/mh-normativa-2.0 antes
// de modificar los builders). Este test exige que el perfil MH_1_2 (por
// defecto, interruptor apagado) siga produciendo EXACTAMENTE esos bytes.
// No regenerar estos archivos para "arreglar" un fallo: un diff aquí es
// una regresión del perfil histórico.
// ─────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildMhTestScenarioJson, type MhTestScenarioCode } from "../../mh-test-runs/mh-test-scenarios";
import { generateNcJsonForDte } from "../generate-nc-json.service";
import { validateDteJsonAgainstOfficialSchema } from "../validate-dte-json-schema.service";
import { GOLDEN_CTX, GOLDEN_ISSUER, GOLDEN_NOW, goldenDoc, makeFakeDb } from "./mh20-fixtures";

const DIR = __dirname;
const CAPTURE = process.env.MH20_GOLDEN_CAPTURE === "1";

function goldenCheck(name: string, json: unknown): void {
  const file = join(DIR, `${name}.golden.json`);
  const text = JSON.stringify(json, null, 2) + "\n";
  if (CAPTURE || !existsSync(file)) {
    if (!CAPTURE) throw new Error(`Falta el golden ${name}; capture con MH20_GOLDEN_CAPTURE=1 desde el código previo.`);
    writeFileSync(file, text, "utf8");
    return;
  }
  expect(text).toBe(readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
}

const SCENARIOS: Array<[string, MhTestScenarioCode, string, boolean]> = [
  ["fe-v1-consumidor-final", "FE01_CONSUMIDOR_FINAL", "01", false],
  ["fe-v1-identificado",     "FE01_IDENTIFICADO",     "01", false],
  ["fe-v1-contingencia",     "CONT01_FE",             "01", true],
  ["ccfe-v3",                "CCFE03_ESTANDAR",       "03", false],
  ["ccfe-v3-contingencia",   "CONT03_CCFE",           "03", true],
  ["fex-v3",                 "FEX11_SERVICIOS",       "11", false],
  ["fse-v1",                 "FSE14_SERVICIOS",       "14", false],
];

describe("MH_1_2 golden — builders históricos byte a byte", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(GOLDEN_NOW);
    delete process.env.DTE_MH20_PROFILE_ENABLED;
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it.each(SCENARIOS)("%s", (name, scenario, typeCode, contingency) => {
    const built = buildMhTestScenarioJson(GOLDEN_CTX, scenario, goldenDoc(typeCode, 9, contingency), 3, GOLDEN_NOW);
    expect(built.ok, built.ok ? "" : built.error).toBe(true);
    if (!built.ok) return;
    expect(validateDteJsonAgainstOfficialSchema(typeCode, built.json)).toEqual({ ok: true });
    goldenCheck(name, built.json);
  });

  it("nc-v3 (NC total sobre CCF v3 aceptado)", async () => {
    const ccf = buildMhTestScenarioJson(GOLDEN_CTX, "CCFE03_ESTANDAR", goldenDoc("03", 9), 3, GOLDEN_NOW);
    expect(ccf.ok).toBe(true);
    if (!ccf.ok) return;
    const { db, updates } = makeFakeDb({
      docs: {
        "nc-1": {
          id: "nc-1", dte_type_code: "05", dte_status: "PENDING_GENERATION",
          generation_code: "B1B2C3D4-E5F6-4234-8678-9ABCDEF01234", control_number: "DTE-05-M001P001-000000000000004",
          environment: "TEST", issuer_config_id: "iss-1", json_document: null,
        },
        "ccf-1": {
          id: "ccf-1", dte_type_code: "03", dte_status: "ACCEPTED",
          generation_code: "A1B2C3D4-E5F6-4234-8678-9ABCDEF01234", control_number: "DTE-03-M001P001-000000000000009",
          reception_stamp: "2026SELLOFIXTURE", json_document: ccf.json,
        },
      },
      issuer: GOLDEN_ISSUER as unknown as Record<string, unknown>,
      relation: { related_dte_document_id: "ccf-1" },
    });
    const res = await generateNcJsonForDte(
      { dteDocumentId: "nc-1", userId: "u1", tenantId: "t1", locationId: "l1" },
      db as unknown as PrismaClient,
    );
    expect(res.ok, res.ok ? "" : res.message).toBe(true);
    const json = updates[0]?.data.json_document;
    expect(validateDteJsonAgainstOfficialSchema("05", json)).toEqual({ ok: true });
    goldenCheck("nc-v3", json);
    // Con el interruptor apagado no se escribe la columna M1.
    expect(updates[0]?.data).not.toHaveProperty("mh_spec_profile");
  });
});
