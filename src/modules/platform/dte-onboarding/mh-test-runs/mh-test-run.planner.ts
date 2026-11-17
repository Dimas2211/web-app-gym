// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding/mh-test-runs — mh-test-run.planner.ts
//
// DTE-MH-TEST-RUNS — planificador PURO: valida el plan (cantidades,
// primer correlativo por tipo, dependencias, perfiles) y produce los
// ítems ordenados + rangos visibles. No toca base de datos.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import {
  MH_TEST_DTE_TYPE_CODES,
  MH_TEST_INVALIDATION_TARGETS,
  MH_TEST_SCENARIOS,
  isMhTestScenarioCode,
  validateMhTestReceptors,
  type MhTestDteTypeCode,
  type MhTestScenarioCode,
} from "@/modules/commerce/dte/mh-test-runs/mh-test-scenarios";
import { MAX_DTE_CONTROL_NUMBER_BLOCK } from "@/modules/commerce/dte/services/dte-correlative.service";
import type { MhTestRunPlan, PlannedMhTestItem, PlannedMhTestRange } from "./mh-test-run.types";

/** Límite total de ítems por corrida (acota duración y superficie de revisión). */
export const MAX_MH_TEST_RUN_ITEMS = 200;
const MAX_CONTROL_SEQUENCE = 999_999_999_999_999;

const opt = z.string().trim().max(200).nullable().optional();
const idType = z.enum(["36", "13", "02", "03", "37"]);

const planSchema = z.object({
  version: z.literal(1),
  blocks: z.array(z.object({
    dteTypeCode:   z.enum(["01", "03", "05", "11", "14"]),
    firstSequence: z.number().int().min(1).max(MAX_CONTROL_SEQUENCE),
    scenarios:     z.array(z.object({ scenarioCode: z.string(), count: z.number().int().min(0).max(MAX_DTE_CONTROL_NUMBER_BLOCK) })).max(10),
  })).max(5),
  invalidations: z.array(z.object({ targetScenarioCode: z.string(), count: z.number().int().min(0).max(MAX_MH_TEST_RUN_ITEMS) })).max(5),
  receptors: z.object({
    identified: z.object({
      idTypeCode: z.enum(["13", "36"]), documentNumber: z.string().trim().max(30), name: z.string().trim().max(250),
      email: opt, phone: opt, deptCode: opt, municipalityCode: opt, addressComplement: opt,
    }).nullable().optional(),
    taxpayer: z.object({
      nit: z.string().trim().max(30), nrc: z.string().trim().max(20), name: z.string().trim().max(250), legalName: opt,
      activityCode: z.string().trim().max(10), activityName: z.string().trim().max(150),
      deptCode: z.string().trim().max(4), municipalityCode: z.string().trim().max(4), addressComplement: z.string().trim().max(200),
      phone: opt, email: z.string().trim().max(100),
    }).nullable().optional(),
    foreign: z.object({
      name: z.string().trim().max(250), idTypeCode: idType, documentNumber: z.string().trim().max(30),
      countryCode: z.string().trim().max(10), addressComplement: z.string().trim().max(300),
      activityName: z.string().trim().max(150), personType: z.enum(["1", "2"]), email: z.string().trim().max(100), phone: opt,
    }).nullable().optional(),
    excludedSubject: z.object({
      idTypeCode: idType, documentNumber: z.string().trim().max(30), name: z.string().trim().max(250),
      activityCode: opt, activityName: opt, deptCode: z.string().trim().max(4), municipalityCode: z.string().trim().max(4),
      addressComplement: z.string().trim().max(200), phone: opt, email: opt,
    }).nullable().optional(),
  }),
  responsible: z.object({ name: z.string().trim().max(100), docTypeCode: idType, documentNumber: z.string().trim().max(30) }).nullable(),
  contingency: z.object({ contingencyTypeCode: z.enum(["1", "2", "3", "4", "5"]), reason: z.string().trim().max(500).nullable() }).nullable(),
});

export type MhTestPlanResult =
  | { ok: true; plan: MhTestRunPlan; items: PlannedMhTestItem[]; ranges: PlannedMhTestRange[]; scenarios: Set<MhTestScenarioCode> }
  | { ok: false; errors: string[] };

export function planMhTestRun(input: unknown): MhTestPlanResult {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "plan"}: ${i.message}`) };
  }
  const plan = parsed.data as MhTestRunPlan;
  const errors: string[] = [];

  // ── Bloques por tipo ───────────────────────────────────────────
  const seenTypes = new Set<MhTestDteTypeCode>();
  const counts = new Map<MhTestScenarioCode, number>();
  for (const block of plan.blocks) {
    if (seenTypes.has(block.dteTypeCode)) errors.push(`Tipo ${block.dteTypeCode}: bloque duplicado.`);
    seenTypes.add(block.dteTypeCode);
    let total = 0;
    for (const s of block.scenarios) {
      if (!isMhTestScenarioCode(s.scenarioCode)) {
        errors.push(`Tipo ${block.dteTypeCode}: escenario desconocido "${s.scenarioCode}".`);
        continue;
      }
      if (MH_TEST_SCENARIOS[s.scenarioCode].dteTypeCode !== block.dteTypeCode) {
        errors.push(`Escenario ${s.scenarioCode} no corresponde al tipo ${block.dteTypeCode}.`);
        continue;
      }
      if (counts.has(s.scenarioCode)) errors.push(`Escenario ${s.scenarioCode} repetido.`);
      counts.set(s.scenarioCode, s.count);
      total += s.count;
    }
    if (total < 1) errors.push(`Tipo ${block.dteTypeCode}: la cantidad total debe ser al menos 1.`);
    if (total > MAX_DTE_CONTROL_NUMBER_BLOCK) errors.push(`Tipo ${block.dteTypeCode}: máximo ${MAX_DTE_CONTROL_NUMBER_BLOCK} documentos.`);
    if (block.firstSequence + total - 1 > MAX_CONTROL_SEQUENCE) errors.push(`Tipo ${block.dteTypeCode}: el rango excede el máximo del número de control.`);
  }
  if (plan.blocks.length === 0) errors.push("El plan no tiene documentos.");

  // ── Dependencias ───────────────────────────────────────────────
  const nc = counts.get("NC05_SOBRE_CCFE") ?? 0;
  const ccfe = counts.get("CCFE03_ESTANDAR") ?? 0;
  if (nc > ccfe) errors.push(`NC 05 (${nc}) requiere al menos la misma cantidad de CCFE 03 estándar (${ccfe}).`);

  const invByTarget = new Map<MhTestScenarioCode, number>();
  for (const inv of plan.invalidations) {
    if (inv.count === 0) continue;
    if (!isMhTestScenarioCode(inv.targetScenarioCode) || !MH_TEST_INVALIDATION_TARGETS.includes(inv.targetScenarioCode)) {
      errors.push(`Invalidación: objetivo "${inv.targetScenarioCode}" no permitido (solo FE 01 identificado o CCFE 03 estándar).`);
      continue;
    }
    if (invByTarget.has(inv.targetScenarioCode)) errors.push(`Invalidación: objetivo ${inv.targetScenarioCode} repetido.`);
    invByTarget.set(inv.targetScenarioCode, inv.count);
  }
  const invFe = invByTarget.get("FE01_IDENTIFICADO") ?? 0;
  const invCcfe = invByTarget.get("CCFE03_ESTANDAR") ?? 0;
  if (invFe > (counts.get("FE01_IDENTIFICADO") ?? 0)) errors.push("Invalidaciones de FE 01 exceden los FE 01 identificados planificados.");
  // Un CCFE usado por una NC no se invalida (quedaría la NC sobre un documento anulado).
  if (invCcfe > ccfe - nc) errors.push(`Invalidaciones de CCFE 03 (${invCcfe}) exceden los CCFE 03 libres de NC (${ccfe - nc}).`);

  const totalInvalidations = invFe + invCcfe;
  const contingencyDocs = (counts.get("CONT01_FE") ?? 0) + (counts.get("CONT03_CCFE") ?? 0);
  const totalDocs = [...counts.values()].reduce((a, b) => a + b, 0);
  const totalItems = totalDocs + totalInvalidations + (contingencyDocs > 0 ? 1 : 0);
  if (totalItems > MAX_MH_TEST_RUN_ITEMS) errors.push(`La corrida excede ${MAX_MH_TEST_RUN_ITEMS} ítems (${totalItems}).`);

  // ── Perfiles (sin inventar datos) ──────────────────────────────
  const scenarios = new Set([...counts.entries()].filter(([, c]) => c > 0).map(([s]) => s));
  errors.push(...validateMhTestReceptors(scenarios, plan.receptors, plan.responsible, totalInvalidations > 0 || contingencyDocs > 0, plan.contingency));

  if (errors.length > 0) return { ok: false, errors };

  // ── Ítems ordenados ────────────────────────────────────────────
  const items: PlannedMhTestItem[] = [];
  const ranges: PlannedMhTestRange[] = [];
  const seqsByScenario = new Map<MhTestScenarioCode, number[]>();
  let seq = 1;
  const orderedBlocks = [...plan.blocks].sort((a, b) => MH_TEST_DTE_TYPE_CODES.indexOf(a.dteTypeCode) - MH_TEST_DTE_TYPE_CODES.indexOf(b.dteTypeCode));
  for (const block of orderedBlocks) {
    let next = block.firstSequence;
    for (const s of block.scenarios) {
      const code = s.scenarioCode as MhTestScenarioCode;
      for (let i = 0; i < s.count; i++) {
        items.push({ seq, kind: "DTE", dteTypeCode: block.dteTypeCode, scenarioCode: code, plannedSequence: next, dependsOnSeq: null });
        seqsByScenario.set(code, [...(seqsByScenario.get(code) ?? []), seq]);
        seq++; next++;
      }
    }
    const count = next - block.firstSequence;
    ranges.push({ dteTypeCode: block.dteTypeCode, first: block.firstSequence, last: next - 1, count });
  }

  // NC i → CCFE i (los primeros `nc` CCFE estándar).
  const ccfeSeqs = seqsByScenario.get("CCFE03_ESTANDAR") ?? [];
  (seqsByScenario.get("NC05_SOBRE_CCFE") ?? []).forEach((ncSeq, i) => {
    items.find((it) => it.seq === ncSeq)!.dependsOnSeq = ccfeSeqs[i];
  });

  // Evento de contingencia: un único evento que reporta todos los documentos de contingencia.
  const contSeqs = [...(seqsByScenario.get("CONT01_FE") ?? []), ...(seqsByScenario.get("CONT03_CCFE") ?? [])];
  if (contSeqs.length > 0) {
    const eventSeq = seq++;
    items.push({ seq: eventSeq, kind: "CONTINGENCY_EVENT", dteTypeCode: null, scenarioCode: "CONTINGENCY_EVENT", plannedSequence: null, dependsOnSeq: null });
    for (const s of contSeqs) items.find((it) => it.seq === s)!.dependsOnSeq = eventSeq;
  }

  // Invalidaciones: FE identificados desde el inicio; CCFE libres (los posteriores a los usados por NC).
  const feTargets = (seqsByScenario.get("FE01_IDENTIFICADO") ?? []).slice(0, invFe);
  const ccfeTargets = ccfeSeqs.slice(nc, nc + invCcfe);
  for (const target of [...feTargets, ...ccfeTargets]) {
    const targetItem = items.find((it) => it.seq === target)!;
    items.push({ seq: seq++, kind: "INVALIDATION", dteTypeCode: null, scenarioCode: `INVALIDATION_${targetItem.scenarioCode}`, plannedSequence: null, dependsOnSeq: target });
  }

  return { ok: true, plan, items, ranges, scenarios };
}
