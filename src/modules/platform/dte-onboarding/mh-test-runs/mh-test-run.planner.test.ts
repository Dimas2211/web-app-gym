// DTE-MH-TEST-RUNS — planificador puro: rangos visibles, dependencias y límites.

import { describe, it, expect } from "vitest";
import { planMhTestRun } from "./mh-test-run.planner";

const taxpayer = {
  nit: "06140000000000", nrc: "1234", name: "CONTRIBUYENTE FIXTURE", activityCode: "46900", activityName: "Venta",
  deptCode: "06", municipalityCode: "14", addressComplement: "Col. Fixture", email: "c@fixture.test",
};
const responsible = { name: "Responsable Fixture", docTypeCode: "13", documentNumber: "000000000" };

const base = { version: 1, invalidations: [], receptors: {}, responsible: null, contingency: null };

describe("planMhTestRun", () => {
  it("rangos por tipo con primer correlativo y cantidad editables", () => {
    const r = planMhTestRun({ ...base, blocks: [
      { dteTypeCode: "03", firstSequence: 101, scenarios: [{ scenarioCode: "CCFE03_ESTANDAR", count: 3 }] },
      { dteTypeCode: "01", firstSequence: 50, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 2 }] },
    ], receptors: { taxpayer } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ranges).toEqual([
      { dteTypeCode: "01", first: 50, last: 51, count: 2 },
      { dteTypeCode: "03", first: 101, last: 103, count: 3 },
    ]);
    expect(r.items.map((i) => i.plannedSequence)).toEqual([50, 51, 101, 102, 103]);
  });

  it("NC depende de su CCFE; invalidaciones de CCFE solo sobre CCFE no usados por NC", () => {
    const r = planMhTestRun({ ...base, receptors: { taxpayer }, responsible, blocks: [
      { dteTypeCode: "03", firstSequence: 1, scenarios: [{ scenarioCode: "CCFE03_ESTANDAR", count: 3 }] },
      { dteTypeCode: "05", firstSequence: 1, scenarios: [{ scenarioCode: "NC05_SOBRE_CCFE", count: 2 }] },
    ], invalidations: [{ targetScenarioCode: "CCFE03_ESTANDAR", count: 1 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nc = r.items.filter((i) => i.scenarioCode === "NC05_SOBRE_CCFE");
    expect(nc.map((i) => i.dependsOnSeq)).toEqual([1, 2]);
    const inv = r.items.filter((i) => i.kind === "INVALIDATION");
    expect(inv.map((i) => i.dependsOnSeq)).toEqual([3]);
  });

  it("rechaza invalidar un CCFE usado por NC y más NC que CCFE", () => {
    const r = planMhTestRun({ ...base, receptors: { taxpayer }, responsible, blocks: [
      { dteTypeCode: "03", firstSequence: 1, scenarios: [{ scenarioCode: "CCFE03_ESTANDAR", count: 1 }] },
      { dteTypeCode: "05", firstSequence: 1, scenarios: [{ scenarioCode: "NC05_SOBRE_CCFE", count: 2 }] },
    ], invalidations: [{ targetScenarioCode: "CCFE03_ESTANDAR", count: 1 }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/NC 05/);
    expect(r.errors.join(" ")).toMatch(/libres de NC/);
  });

  it("FE consumidor final no es invalidable (OBS-1)", () => {
    const r = planMhTestRun({ ...base, responsible, blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }],
      invalidations: [{ targetScenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] });
    expect(r.ok).toBe(false);
  });

  it("contingencia: un evento que agrupa los documentos 01/03 de contingencia", () => {
    const r = planMhTestRun({ ...base, receptors: { taxpayer }, responsible, contingency: { contingencyTypeCode: "1", reason: null }, blocks: [
      { dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "CONT01_FE", count: 2 }] },
      { dteTypeCode: "03", firstSequence: 1, scenarios: [{ scenarioCode: "CONT03_CCFE", count: 1 }] },
    ] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ev = r.items.filter((i) => i.kind === "CONTINGENCY_EVENT");
    expect(ev).toHaveLength(1);
    expect(r.items.filter((i) => i.dependsOnSeq === ev[0].seq)).toHaveLength(3);
  });

  it("escenario de otro tipo, tipo repetido, cantidad 0 y primer número inválido se rechazan", () => {
    expect(planMhTestRun({ ...base, blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "CCFE03_ESTANDAR", count: 1 }] }] }).ok).toBe(false);
    expect(planMhTestRun({ ...base, blocks: [
      { dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] },
      { dteTypeCode: "01", firstSequence: 5, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] },
    ] }).ok).toBe(false);
    expect(planMhTestRun({ ...base, blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 0 }] }] }).ok).toBe(false);
    expect(planMhTestRun({ ...base, blocks: [{ dteTypeCode: "01", firstSequence: 0, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 1 }] }] }).ok).toBe(false);
  });

  it("límite total de ítems", () => {
    const r = planMhTestRun({ ...base, blocks: [{ dteTypeCode: "01", firstSequence: 1, scenarios: [{ scenarioCode: "FE01_CONSUMIDOR_FINAL", count: 201 }] }] });
    expect(r.ok).toBe(false);
  });
});
