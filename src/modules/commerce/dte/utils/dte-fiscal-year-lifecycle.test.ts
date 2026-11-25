// COR-01 (Fase 9.1) — distinción por etapa del ciclo de vida al cruzar el año.
// Borrador ≠ generado ≠ firmado pendiente ≠ respuesta incierta ≠ aceptado.
// Unitario y estructural (sin BD).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  classifyDteFiscalYearStage,
  decideDteCrossYearPolicy,
} from "./dte-fiscal-year-lifecycle";
import { checkDteFiscalYearForGeneration, DTE_FISCAL_YEAR_MISMATCH } from "./dte-fiscal-year";
import { cancelUnsignedMhTestDocument } from "../mh-test-runs/mh-test-documents.service";

const DTE_DIR = path.resolve(__dirname, "..");
const src = (rel: string) => readFileSync(path.join(DTE_DIR, rel), "utf8");

// 2026-12-31 12:00 SV (reserva) → 2027-01-02 10:00 SV (operación)
const RESERVED_AT = new Date("2026-12-31T18:00:00Z");
const NOW_2027    = new Date("2027-01-02T16:00:00Z");

describe("COR-01 lifecycle — clasificación", () => {
  it.each([
    ["PENDING_GENERATION", false, "DRAFT"],
    ["GENERATED",          false, "GENERATED"],
    ["SCHEMA_VALIDATED",   false, "GENERATED"],
    ["SIGNED",             false, "SIGNED_PENDING"],
    ["SIGNED",             true,  "UNCERTAIN"],
    ["SCHEMA_VALIDATED",   true,  "UNCERTAIN"],
    ["SENT",               false, "UNCERTAIN"],
    ["ACCEPTED",           false, "ACCEPTED"],
    ["OBSERVED",           false, "ACCEPTED"],
    ["CANCELLED",          false, "TERMINAL"],
    ["INVALIDATED",        false, "TERMINAL"],
    ["REJECTED",           false, "TERMINAL"],
  ])("%s (intento=%s) → %s", (dte_status, attempted, stage) => {
    expect(classifyDteFiscalYearStage({ dte_status, has_transmission_attempt: attempted })).toBe(stage);
  });
});

describe("COR-01 lifecycle — política de cruce de año", () => {
  it("borrador del año anterior: la guarda aplica; cancelar y reemitir es posible (no automático)", () => {
    const p = decideDteCrossYearPolicy({ dte_status: "PENDING_GENERATION" }, true);
    expect(p).toMatchObject({ stage: "DRAFT", fiscalYearGuardApplies: true, mayCancelAndReissue: true,
      mayContinueTransmission: false, preserveIdentity: true });
  });

  it("borrador sin cruce de año: sin bloqueo", () => {
    expect(decideDteCrossYearPolicy({ dte_status: "PENDING_GENERATION" }, false).fiscalYearGuardApplies).toBe(false);
  });

  it("generado del año anterior: no se bloquea; continúa a firma/transmisión con su identidad", () => {
    const p = decideDteCrossYearPolicy({ dte_status: "GENERATED" }, true);
    expect(p).toMatchObject({ fiscalYearGuardApplies: false, mayContinueTransmission: true,
      mayCancelAndReissue: false, preserveIdentity: true });
  });

  it("firmado pendiente del año anterior: se recupera y transmite; DTE_FISCAL_YEAR_MISMATCH no aplica", () => {
    const p = decideDteCrossYearPolicy({ dte_status: "SIGNED" }, true);
    expect(p).toMatchObject({ stage: "SIGNED_PENDING", fiscalYearGuardApplies: false,
      mayContinueTransmission: true, mayCancelAndReissue: false });
  });

  it("respuesta MH incierta: no se cancela ni reemite; exige conciliación", () => {
    for (const doc of [{ dte_status: "SENT" }, { dte_status: "SIGNED", has_transmission_attempt: true }]) {
      const p = decideDteCrossYearPolicy(doc, true);
      expect(p).toMatchObject({ stage: "UNCERTAIN", mayCancelAndReissue: false,
        mayContinueTransmission: false, requiresMhReconciliation: true, fiscalYearGuardApplies: false });
    }
  });

  it("aceptado: inmutable", () => {
    expect(decideDteCrossYearPolicy({ dte_status: "ACCEPTED" }, true)).toMatchObject({
      stage: "ACCEPTED", mayCancelAndReissue: false, mayContinueTransmission: false, fiscalYearGuardApplies: false });
  });

  it("la guarda de generación sigue rechazando solo el borrador cruzado", () => {
    const r = checkDteFiscalYearForGeneration({ fiscal_year: 2026, control_number: "DTE-01-M001P001-000000000000009" }, NOW_2027);
    expect(r).toMatchObject({ ok: false, code: DTE_FISCAL_YEAR_MISMATCH });
    expect(checkDteFiscalYearForGeneration({ fiscal_year: null, created_at: RESERVED_AT }, NOW_2027).ok).toBe(false);
  });
});

describe("COR-01 lifecycle — estructura: la guarda vive solo en la generación", () => {
  const NON_GENERATION = [
    "services/sign-dte-document.service.ts",
    "services/transmit-dte-document.service.ts",
    "services/dte-reconciliation.service.ts",
    "services/reopen-signed-dte-for-resign.service.ts",
    "services/reopen-rejected-dte-for-resign.service.ts",
    "services/mh-retransmission-guard.ts",
    "services/deliver-dte-to-external-db.service.ts",
  ];
  it.each(NON_GENERATION)("%s no aplica DTE_FISCAL_YEAR_MISMATCH", (rel) => {
    const s = src(rel);
    expect(s).not.toContain("checkDteFiscalYearForGeneration");
    expect(s).not.toContain("DTE_FISCAL_YEAR_MISMATCH");
  });

  const GENERATORS = [
    "services/generate-fe-json.service.ts",
    "services/generate-ccfe-json.service.ts",
    "services/generate-nc-json.service.ts",
  ];
  it.each(GENERATORS)("%s: guarda tras exigir PENDING_GENERATION", (rel) => {
    const s = src(rel);
    const guardAt = s.indexOf("checkDteFiscalYearForGeneration(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(s.indexOf("PENDING_GENERATION")).toBeGreaterThan(-1);
    expect(s.indexOf("PENDING_GENERATION")).toBeLessThan(guardAt);
  });

  // FEX/FSE: el pipeline admite REGENERAR (reescribir JSON) desde GENERATED/SCHEMA_VALIDATED.
  // Al cruzar el año la guarda bloquea solo esa reescritura (fecEmi nuevo con número del año
  // anterior); el JSON ya generado se conserva y sigue disponible para firma y transmisión.
  it.each([
    ["services/generate-fex-json.service.ts", "services/generate-fex-json-pipeline.service.ts"],
    ["services/generate-fse-json.service.ts", "services/generate-fse-json-pipeline.service.ts"],
  ])("%s: guarda antes de calcular fecEmi; pipeline nunca regenera SIGNED/SENT", (gen, pipe) => {
    const g = src(gen);
    const guardAt = g.indexOf("checkDteFiscalYearForGeneration(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(g.indexOf("svDateTime(now)", guardAt));
    const p = src(pipe);
    expect(p).toContain("\"PENDING_GENERATION\"");
    expect(p).not.toMatch(/dte_status:\s*\{\s*in:\s*\[[^\]]*"(SIGNED|SENT|ACCEPTED)"/);
  });

  it("reabrir para re-firma conserva JSON y no pasa por la generación", () => {
    for (const rel of ["services/reopen-signed-dte-for-resign.service.ts", "services/reopen-rejected-dte-for-resign.service.ts"]) {
      const s = src(rel);
      expect(s).toContain("\"SCHEMA_VALIDATED\"");
      expect(s).not.toMatch(/dte_status:\s*"PENDING_GENERATION"/);
    }
  });
});

describe("COR-01 lifecycle — cancelaciones existentes no tocan firmados ni inciertos", () => {
  it("cancelUnsignedMhTestDocument excluye SIGNED/SENT/ACCEPTED", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = { dteOutgoingDocument: { updateMany } } as never;
    await cancelUnsignedMhTestDocument(db, { tenantId: "t", locationId: "l", userId: null } as never, "k");
    const statuses: string[] = updateMany.mock.calls[0][0].where.dte_status.in;
    expect(statuses).not.toContain("SIGNED");
    expect(statuses).not.toContain("SENT");
    expect(statuses).not.toContain("ACCEPTED");
    expect(updateMany.mock.calls[0][0].data).toEqual({ dte_status: "CANCELLED", updated_by: null });
  });

  it("anular una venta solo cancela DTE PENDING_GENERATION intactos", () => {
    const s = readFileSync(path.resolve(DTE_DIR, "../sales/services/sale.service.ts"), "utf8");
    expect(s).toMatch(/dte_status:\s*"PENDING_GENERATION",\s*updated_at:\s*doc\.updated_at\s*\},\s*data:\s*\{\s*dte_status:\s*"CANCELLED"/);
  });
});
