// MH20 (Fase 5.1C) — clasificación individual de las 8 reglas pendientes.
import { describe, expect, it } from "vitest";
import { MH_SEMANTIC_RULES } from "./mh-semantic-rules.catalog";
import { runMhSemanticRules } from "./mh-semantic-rules";

const UUID = "0A1B2C3D-4E5F-6071-8293-A4B5C6D7E8F9";
const ids = (kind: string, doc: unknown) => runMhSemanticRules(kind, doc);

describe("catálogo: clasificación de R20-PEND-01..08", () => {
  const pend = MH_SEMANTIC_RULES.filter((r) => r.status === "PENDIENTE_ACLARACION");
  it("son exactamente 8 y todas están clasificadas con justificación", () => {
    expect(pend.map((r) => r.id)).toEqual(Array.from({ length: 8 }, (_, i) => `R20-PEND-0${i + 1}`));
    for (const r of pend) {
      expect(["WARNING", "BLOCK_EMISSION", "BLOCK_ACTIVATION"]).toContain(r.classification);
      expect(r.rationale?.length).toBeGreaterThan(20);
      if (r.classification === "BLOCK_EMISSION") expect(r.blockCondition).toBeTruthy();
    }
  });
  it("no se convirtieron todas en bloqueos", () => {
    const blocking = pend.filter((r) => r.classification !== "WARNING").map((r) => r.id);
    expect(blocking).toEqual(["R20-PEND-01", "R20-PEND-07", "R20-PEND-08"]);
  });
  it("ninguna regla no pendiente lleva clasificación de pendiente", () => {
    for (const r of MH_SEMANTIC_RULES.filter((x) => x.status !== "PENDIENTE_ACLARACION")) expect(r.classification).toBeUndefined();
  });
});

describe("R20-PEND-01 (BLOCK_EMISSION: contingencia 2.0)", () => {
  const ident = (o: Record<string, unknown>) => ({ identificacion: { tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null, ...o } });
  it("positivo: operación normal sin errores ni advertencias", () => {
    const r = ids("01", ident({}));
    expect(r.errors.filter((e) => e.ruleId === "R20-PEND-01")).toEqual([]);
    expect(r.warnings.filter((e) => e.ruleId === "R20-PEND-01")).toEqual([]);
  });
  it("negativo: tipoOperacion 2 bloquea", () => {
    const r = ids("03", ident({ tipoModelo: 2, tipoOperacion: 2, tipoContingencia: 1 }));
    expect(r.errors.map((e) => e.ruleId)).toContain("R20-PEND-01");
  });
  it("negativo: tipoContingencia no nulo con tipoOperacion 1 bloquea", () => {
    expect(ids("01", ident({ tipoContingencia: 3 })).errors.map((e) => e.ruleId)).toContain("R20-PEND-01");
  });
  it("sub-condición fuera de blockCondition sigue como advertencia", () => {
    const r = ids("01", ident({ tipoModelo: 2 }));
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.ruleId)).toEqual(["R20-PEND-01"]);
  });
});

describe("R20-PEND-07 (BLOCK_EMISSION: documento relacionado electrónico)", () => {
  const nc = (numeroDocumento: string, tipoGeneracion = 2) => ({
    documentoRelacionado: [{ tipoDocumento: "03", tipoGeneracion, numeroDocumento, fechaEmision: "2026-11-01" }],
  });
  it("positivo: UUID en mayúsculas", () => {
    expect(ids("05", nc(UUID)).errors.filter((e) => e.ruleId === "R20-PEND-07")).toEqual([]);
  });
  it("negativo: UUID en minúsculas o número físico con tipoGeneracion 2 bloquea", () => {
    expect(ids("05", nc(UUID.toLowerCase())).errors.map((e) => e.ruleId)).toContain("R20-PEND-07");
    expect(ids("05", nc("12345")).errors.map((e) => e.ruleId)).toContain("R20-PEND-07");
  });
  it("tipoGeneracion 1 (físico) no aplica", () => {
    expect(ids("05", nc("12345", 1)).errors.filter((e) => e.ruleId === "R20-PEND-07")).toEqual([]);
  });
});

describe("R20-PEND-08 (BLOCK_EMISSION: FE ≥ $1,095 con receptor identificado)", () => {
  const fe = (mto: number, receptor: unknown) => ({ resumen: { montoTotalOperacion: mto }, receptor });
  const RECEPTOR = { tipoDocumento: "13", numDocumento: "01234567-8", nombre: "Cliente" };
  it("positivo: < 1095 sin receptor", () => {
    expect(ids("01", fe(1094.99, null)).errors.filter((e) => e.ruleId === "R20-PEND-08")).toEqual([]);
  });
  it("positivo: ≥ 1095 con receptor identificado", () => {
    expect(ids("01", fe(1095, RECEPTOR)).errors.filter((e) => e.ruleId === "R20-PEND-08")).toEqual([]);
  });
  it("negativo: ≥ 1095 sin receptor o con datos incompletos bloquea", () => {
    expect(ids("01", fe(1095, null)).errors.map((e) => e.ruleId)).toContain("R20-PEND-08");
    expect(ids("01", fe(2000, { ...RECEPTOR, numDocumento: null })).errors.map((e) => e.ruleId)).toContain("R20-PEND-08");
  });
  it("CCF no aplica (receptor siempre obligatorio por schema)", () => {
    expect(ids("03", fe(5000, null)).errors.filter((e) => e.ruleId === "R20-PEND-08")).toEqual([]);
  });
});

describe("reglas WARNING no bloquean (PEND-02..06)", () => {
  it("PEND-02 DUI mal formado → solo advertencia", () => {
    const r = ids("01", { receptor: { tipoDocumento: "13", numDocumento: "123" } });
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.ruleId)).toContain("R20-PEND-02");
  });
  it("PEND-03 ivaRete con totalGravada 0 → solo advertencia", () => {
    const r = ids("01", { resumen: { totalGravada: 0, ivaRete: 1, totalPagar: 0, montoTotalOperacion: 1 } });
    expect(r.errors.filter((e) => e.ruleId === "R20-PEND-03")).toEqual([]);
    expect(r.warnings.map((w) => w.ruleId)).toContain("R20-PEND-03");
  });
  it("PEND-04 crédito sin plazo → solo advertencia", () => {
    const r = ids("03", { resumen: { condicionOperacion: 2, totalPagar: 10, pagos: [{ codigo: "01" }] } });
    expect(r.warnings.map((w) => w.ruleId)).toContain("R20-PEND-04");
    expect(r.errors.filter((e) => e.ruleId === "R20-PEND-04")).toEqual([]);
  });
  it("PEND-05 observaciones > 3000 → solo advertencia", () => {
    const r = ids("03", { resumen: { observaciones: "x".repeat(3001) } });
    expect(r.warnings.map((w) => w.ruleId)).toContain("R20-PEND-05");
  });
  it("PEND-06 tributos con ventaGravada 0 → solo advertencia", () => {
    const r = ids("03", { cuerpoDocumento: [{ ventaGravada: 0, tributos: ["20"] }] });
    expect(r.warnings.map((w) => w.ruleId)).toContain("R20-PEND-06");
    expect(r.errors.filter((e) => e.ruleId === "R20-PEND-06")).toEqual([]);
  });
});
