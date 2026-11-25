// MH20 — Fase 9.0: generateMhTestDocumentJson con el perfil de la corrida.
// BD falsa en memoria (fixtures); sin red ni base real.

import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { generateMhTestDocumentJson } from "./mh-test-documents.service";
import { GOLDEN_ISSUER, GOLDEN_RECEPTORS, municipalityRow } from "../services/__golden__/mh20-fixtures";
import { validateDteJsonAgainstOfficialSchema } from "../services/validate-dte-json-schema.service";

function fakeDb() {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    dteOutgoingDocument: {
      findFirst: async () => ({
        id: "doc-1", dte_status: "PENDING_GENERATION", control_number: "DTE-01-M001P001-000000000000011",
        generation_code: "D1B2C3D4-E5F6-4234-8678-000000000001", transmission_type_code: "1",
        contingency_type_code: null, contingency_reason: null,
      }),
      updateMany: async (args: { data: Record<string, unknown> }) => { updates.push(args.data); return { count: 1 }; },
    },
    dteIssuerConfig: { findFirst: async () => GOLDEN_ISSUER },
    municipality: { findFirst: async ({ where }: { where: { dept_code: string; code: string } }) => municipalityRow(where.dept_code, where.code) },
    department: { findFirst: async ({ where }: { where: { code: string } }) => ({ code: where.code, name: "DEPTO" }) },
  };
  return { db: db as unknown as PrismaClient, updates };
}
const scope = { tenantId: "t1", locationId: "l1", issuerConfigId: "iss-1", userId: null };

describe("Fase 9.0 — generación del documento de prueba con el perfil de la corrida", () => {
  it("MH_2_0: FE v2 con builder canónico, válida y con mh_spec_profile persistido", async () => {
    const { db, updates } = fakeDb();
    const r = await generateMhTestDocumentJson(db, scope, { key: "run:1", scenario: "FE01_IDENTIFICADO", index: 1, receptors: GOLDEN_RECEPTORS, profile: "MH_2_0" });
    expect(r, JSON.stringify(r)).toEqual({ ok: true });
    expect(updates[0].mh_spec_profile).toBe("MH_2_0");
    const json = updates[0].json_document as { identificacion: { version: number } };
    expect(json.identificacion.version).toBe(2);
    expect(validateDteJsonAgainstOfficialSchema("01", json)).toEqual({ ok: true });
  });
  it("MH_1_2 (por defecto): FE v1 y sin escribir la columna M1", async () => {
    const { db, updates } = fakeDb();
    const r = await generateMhTestDocumentJson(db, scope, { key: "run:1", scenario: "FE01_IDENTIFICADO", index: 1, receptors: GOLDEN_RECEPTORS });
    expect(r).toEqual({ ok: true });
    expect(updates[0]).not.toHaveProperty("mh_spec_profile");
    expect((updates[0].json_document as { identificacion: { version: number } }).identificacion.version).toBe(1);
  });
  it("MH_2_0: escenario de contingencia bloqueado sin escribir nada", async () => {
    const { db, updates } = fakeDb();
    const r = await generateMhTestDocumentJson(db, scope, { key: "run:1", scenario: "CONT01_FE", index: 1, receptors: GOLDEN_RECEPTORS, profile: "MH_2_0" });
    expect(r).toMatchObject({ ok: false, code: "SCENARIO_BLOCKED" });
    expect(updates).toEqual([]);
  });
});
