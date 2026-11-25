// ─────────────────────────────────────────────────────────────────
// platform/dte-onboarding/mh-test-runs — mh-test-minimums.ts
//
// MH20 (Fase 8, IMP20-031/032/033) — perfil normativo por corrida, preset
// configurable de cantidades mínimas (Manual de Funcionamiento 2.0 p. 79)
// y encadenamiento en corridas de ≤ 200 ítems. PURO: no toca BD ni red.
//
// Reutiliza el planner, el motor, el runtime-port y el panel existentes:
// cada segmento de la cadena es un plan normal que el planner valida y el
// motor procesa igual que hoy. No hay un segundo motor fiscal.
//
// Escenarios 2.0 sin endpoint/versión confirmados quedan BLOCKED y nunca
// entran a un plan (Contingencia v4: INC-005; Retorno: MT-GAP-001;
// Operaciones Especiales: MT-GAP-001 + autorización AT).
// ─────────────────────────────────────────────────────────────────

import type { DteSpecProfile } from "@/modules/commerce/dte/spec/dte-spec-profile";
import { getDteSpec, type DteSpecKind } from "@/modules/commerce/dte/spec/dte-spec-registry";
import { previewMhTerritory } from "@/modules/commerce/dte/utils/mh-territory-combinations";
import { mh20IssuerCodesError } from "@/modules/commerce/dte/services/mh20-pre-reservation-guard";
import type { MhTestDteTypeCode, MhTestReceptors, MhTestScenarioCode } from "@/modules/commerce/dte/mh-test-runs/mh-test-scenarios";
import type { MhTestRunPlanBlock } from "./mh-test-run.types";
import { MAX_MH_TEST_RUN_ITEMS } from "./mh-test-run.planner";

// ── Escenarios por perfil y readiness ─────────────────────────────

export type MhTestOnboardingKind = "FE" | "CCF" | "NC" | "FEX" | "FSE" | "INVALIDATION" | "CONTINGENCY" | "RETURN" | "SPECIAL_OPS";

export interface MhTestScenarioReadiness {
  kind:      MhTestOnboardingKind;
  specKind:  DteSpecKind;
  label:     string;
  version:   number | null;
  status:    "READY" | "BLOCKED";
  blocker:   string | null;
  /** Documento o evento del que depende (orden lógico). */
  dependsOn: MhTestOnboardingKind[];
}

const KIND_DEF: ReadonlyArray<{ kind: MhTestOnboardingKind; specKind: DteSpecKind; label: string; dependsOn: MhTestOnboardingKind[] }> = [
  { kind: "FE",           specKind: "01",   label: "Factura electrónica",            dependsOn: [] },
  { kind: "CCF",          specKind: "03",   label: "Comprobante de crédito fiscal",  dependsOn: [] },
  { kind: "NC",           specKind: "05",   label: "Nota de crédito",                dependsOn: ["CCF"] },
  { kind: "FEX",          specKind: "11",   label: "Factura de exportación",         dependsOn: [] },
  { kind: "FSE",          specKind: "14",   label: "Factura de sujeto excluido",     dependsOn: [] },
  { kind: "INVALIDATION", specKind: "INV",  label: "Evento de invalidación",         dependsOn: ["FE", "CCF"] },
  { kind: "CONTINGENCY",  specKind: "CONT", label: "Evento de contingencia",         dependsOn: ["FE", "CCF"] },
  { kind: "RETURN",       specKind: "18",   label: "Evento de retorno",              dependsOn: ["FE", "FEX", "FSE"] },
  { kind: "SPECIAL_OPS",  specKind: "17",   label: "Evento de operaciones especiales", dependsOn: [] },
];

/** Readiness por escenario para un perfil (derivada del registro normativo). */
export function listMhTestScenarioReadiness(profile: DteSpecProfile): MhTestScenarioReadiness[] {
  return KIND_DEF.map((d) => {
    const spec = getDteSpec(profile, d.specKind);
    if (!spec) {
      return { ...d, version: null, status: "BLOCKED" as const, blocker: `No existe en el perfil ${profile}.` };
    }
    // Retorno/OE no existen en el motor de pruebas aunque el builder sí:
    // sin endpoint documentado no hay transmisión posible (ni en TEST).
    const blocker = spec.blocked ?? spec.transmissionBlocked ?? null;
    return { ...d, version: spec.version, status: blocker ? "BLOCKED" as const : "READY" as const, blocker };
  });
}

// ── Preset y cantidades ───────────────────────────────────────────

/** Preset MF 2.0 p. 79 (configurable). Eventos: 5 por evento aplicable. */
export const MH20_ONBOARDING_PRESET = Object.freeze({
  FE: 90, CCF: 75, NC: 50, FEX: 90, FSE: 25,
  eventsPerApplicable: 5,
});

export type MhTestDocKind = "FE" | "CCF" | "NC" | "FEX" | "FSE";
export const MH_TEST_DOC_KIND_TYPE: Readonly<Record<MhTestDocKind, MhTestDteTypeCode>> = Object.freeze({
  FE: "01", CCF: "03", NC: "05", FEX: "11", FSE: "14",
});

export interface MhTestQuantityInput {
  profile:         DteSpecProfile;
  /** Documentos que el emisor realmente necesita (no se exigen los demás). */
  applicableDocs:  MhTestDocKind[];
  /** Overrides por tipo; omitido → preset. 0 = no aplica. */
  quantities?:     Partial<Record<MhTestDocKind, number>>;
  /** Eventos por evento aplicable (default preset). */
  eventsPerApplicable?: number;
}

export interface MhTestQuantityPlan {
  profile:       DteSpecProfile;
  docs:          Record<MhTestDocKind, number>;
  invalidations: { FE: number; CCF: number };
  /** Eventos aplicables pero bloqueados (se informan, no se planifican). */
  blockedEvents: Array<{ kind: MhTestOnboardingKind; requested: number; blocker: string }>;
  errors:        string[];
}

export function buildMhTestQuantityPlan(input: MhTestQuantityInput): MhTestQuantityPlan {
  const errors: string[] = [];
  const readiness = new Map(listMhTestScenarioReadiness(input.profile).map((r) => [r.kind, r]));
  const docs: Record<MhTestDocKind, number> = { FE: 0, CCF: 0, NC: 0, FEX: 0, FSE: 0 };
  const applicable = new Set(input.applicableDocs);
  if (applicable.has("NC") && !applicable.has("CCF")) errors.push("NC requiere CCF aplicable (la NC se emite sobre un CCF aceptado).");

  for (const k of Object.keys(docs) as MhTestDocKind[]) {
    if (!applicable.has(k)) continue;
    const r = readiness.get(k);
    if (r?.status === "BLOCKED") { errors.push(`${r.label} (${input.profile}) bloqueado: ${r.blocker}`); continue; }
    const q = input.quantities?.[k] ?? MH20_ONBOARDING_PRESET[k];
    if (!Number.isInteger(q) || q < 0) { errors.push(`Cantidad inválida para ${k}.`); continue; }
    docs[k] = q;
  }
  if (docs.NC > docs.CCF) errors.push(`NC (${docs.NC}) no puede exceder CCF (${docs.CCF}).`);

  const perEvent = input.eventsPerApplicable ?? MH20_ONBOARDING_PRESET.eventsPerApplicable;
  if (!Number.isInteger(perEvent) || perEvent < 0) errors.push("Cantidad de eventos inválida.");
  const invalidations = { FE: 0, CCF: 0 };
  const blockedEvents: MhTestQuantityPlan["blockedEvents"] = [];

  const evApplicable = (k: MhTestOnboardingKind) => (readiness.get(k)?.dependsOn ?? []).some((d) => docs[d as MhTestDocKind] > 0);
  for (const ev of ["INVALIDATION", "CONTINGENCY", "RETURN"] as const) {
    if (perEvent === 0 || !evApplicable(ev)) continue;
    const r = readiness.get(ev)!;
    if (r.status === "BLOCKED") { blockedEvents.push({ kind: ev, requested: perEvent, blocker: r.blocker ?? "bloqueado" }); continue; }
    if (ev === "INVALIDATION") {
      // FE identificado primero; el resto sobre CCF libres de NC.
      invalidations.FE = Math.min(perEvent, docs.FE);
      invalidations.CCF = Math.min(perEvent - invalidations.FE, Math.max(0, docs.CCF - docs.NC));
      if (invalidations.FE + invalidations.CCF < perEvent) errors.push(`No hay documentos suficientes para ${perEvent} invalidaciones.`);
    } else {
      // Contingencia 1.2 se planifica desde el formulario actual (escenarios CONT*).
      blockedEvents.push({ kind: ev, requested: perEvent, blocker: "Se planifica con los escenarios de contingencia del formulario (perfil 1.2)." });
    }
  }
  return { profile: input.profile, docs, invalidations, blockedEvents, errors };
}

// ── Encadenamiento (≤ 200 ítems por corrida) ──────────────────────

export interface MhTestChainSegment {
  index:         number;
  total:         number;
  blocks:        MhTestRunPlanBlock[];
  invalidations: Array<{ targetScenarioCode: MhTestScenarioCode; count: number }>;
  itemCount:     number;
}

type Unit =
  | { t: "FE_INV" } | { t: "FE" } | { t: "CCF_NC" } | { t: "CCF_INV" } | { t: "CCF" } | { t: "FEX" } | { t: "FSE" };

const UNIT_SIZE: Record<Unit["t"], number> = { FE_INV: 2, FE: 1, CCF_NC: 2, CCF_INV: 2, CCF: 1, FEX: 1, FSE: 1 };

/**
 * Reparte el plan de cantidades en segmentos contiguos de ≤ maxItems.
 * Garantías: totales exactos, rangos por tipo contiguos y disjuntos entre
 * segmentos (sin duplicados ni huecos), NC e invalidación en el mismo
 * segmento que su documento objetivo.
 */
export function chainMhTestPlan(
  q: MhTestQuantityPlan,
  firstSequenceByType: Partial<Record<MhTestDteTypeCode, number>>,
  maxItems: number = MAX_MH_TEST_RUN_ITEMS,
): { ok: true; segments: MhTestChainSegment[] } | { ok: false; errors: string[] } {
  if (q.errors.length) return { ok: false, errors: q.errors };
  const errors: string[] = [];
  for (const k of Object.keys(q.docs) as MhTestDocKind[]) {
    const type = MH_TEST_DOC_KIND_TYPE[k];
    if (q.docs[k] > 0 && !(Number.isInteger(firstSequenceByType[type]) && firstSequenceByType[type]! >= 1)) {
      errors.push(`Tipo ${type}: falta el primer correlativo TEST.`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const units: Unit[] = [];
  for (let i = 0; i < q.invalidations.FE; i++) units.push({ t: "FE_INV" });
  for (let i = q.invalidations.FE; i < q.docs.FE; i++) units.push({ t: "FE" });
  for (let i = 0; i < q.docs.NC; i++) units.push({ t: "CCF_NC" });
  for (let i = 0; i < q.invalidations.CCF; i++) units.push({ t: "CCF_INV" });
  for (let i = q.docs.NC + q.invalidations.CCF; i < q.docs.CCF; i++) units.push({ t: "CCF" });
  for (let i = 0; i < q.docs.FEX; i++) units.push({ t: "FEX" });
  for (let i = 0; i < q.docs.FSE; i++) units.push({ t: "FSE" });
  if (units.length === 0) return { ok: false, errors: ["El plan no tiene documentos."] };

  const groups: Unit[][] = [];
  let cur: Unit[] = []; let size = 0;
  for (const u of units) {
    if (size + UNIT_SIZE[u.t] > maxItems) { groups.push(cur); cur = []; size = 0; }
    cur.push(u); size += UNIT_SIZE[u.t];
  }
  if (cur.length) groups.push(cur);

  const next: Partial<Record<MhTestDteTypeCode, number>> = { ...firstSequenceByType };
  const segments = groups.map((g, gi) => {
    const c = (t: Unit["t"]) => g.filter((u) => u.t === t).length;
    const feId = c("FE_INV"), feCf = c("FE"), ccfNc = c("CCF_NC"), ccfInv = c("CCF_INV"), ccf = c("CCF"), fex = c("FEX"), fse = c("FSE");
    const blocks: MhTestRunPlanBlock[] = [];
    const take = (type: MhTestDteTypeCode, scenarios: Array<{ scenarioCode: MhTestScenarioCode; count: number }>) => {
      const s = scenarios.filter((x) => x.count > 0);
      const n = s.reduce((a, b) => a + b.count, 0);
      if (n === 0) return;
      blocks.push({ dteTypeCode: type, firstSequence: next[type]!, scenarios: s });
      next[type] = next[type]! + n;
    };
    // Orden de escenarios = orden del planner: NC i → CCF i; invalidaciones
    // de CCF sobre los CCF posteriores a los usados por NC.
    take("01", [{ scenarioCode: "FE01_IDENTIFICADO", count: feId }, { scenarioCode: "FE01_CONSUMIDOR_FINAL", count: feCf }]);
    take("03", [{ scenarioCode: "CCFE03_ESTANDAR", count: ccfNc + ccfInv + ccf }]);
    take("05", [{ scenarioCode: "NC05_SOBRE_CCFE", count: ccfNc }]);
    take("11", [{ scenarioCode: "FEX11_SERVICIOS", count: fex }]);
    take("14", [{ scenarioCode: "FSE14_SERVICIOS", count: fse }]);
    const invalidations = [
      ...(feId > 0 ? [{ targetScenarioCode: "FE01_IDENTIFICADO" as const, count: feId }] : []),
      ...(ccfInv > 0 ? [{ targetScenarioCode: "CCFE03_ESTANDAR" as const, count: ccfInv }] : []),
    ];
    return { index: gi + 1, total: groups.length, blocks, invalidations, itemCount: g.reduce((a, u) => a + UNIT_SIZE[u.t], 0) };
  });
  return { ok: true, segments };
}

// ── Readiness 2.0 del emisor y receptores (puro) ──────────────────

export interface MhTestIssuerSnapshot {
  cod_estable_mh:     string | null;
  cod_punto_venta_mh: string | null;
  dept_code:          string | null;
  municipality_code:  string | null;
}

/**
 * Validación del perfil de la corrida: con MH_2_0, códigos AT del emisor y
 * territorio proyectable (CAT-012/013/distrito) del emisor y de cada
 * receptor con dirección. Con MH_1_2 no agrega reglas (comportamiento actual).
 */
export function validateMhTestRunProfileReadiness(params: {
  profile:   DteSpecProfile;
  issuer:    MhTestIssuerSnapshot;
  receptors: MhTestReceptors;
}): string[] {
  if (params.profile !== "MH_2_0") return [];
  const errors: string[] = [];
  const codes = mh20IssuerCodesError("MH_2_0", params.issuer);
  if (codes) errors.push(`Emisor: ${codes}`);
  const check = (role: string, dept: string | null | undefined, mun: string | null | undefined, required: boolean) => {
    if (!dept && !mun && !required) return;
    const p = previewMhTerritory({ deptCode: dept, municipalityCode: mun }, "MH_2_0");
    if (p.status !== "OK") errors.push(`${role}: territorio no proyectable a MH 2.0 (${p.status === "INVALID" ? `${p.code}: ${p.message}` : "sin dirección"}).`);
  };
  check("Emisor", params.issuer.dept_code, params.issuer.municipality_code, true);
  const r = params.receptors;
  if (r.identified) check("Receptor identificado", r.identified.deptCode, r.identified.municipalityCode, false);
  if (r.taxpayer) check("Receptor contribuyente", r.taxpayer.deptCode, r.taxpayer.municipalityCode, true);
  if (r.excludedSubject) check("Sujeto excluido", r.excludedSubject.deptCode, r.excludedSubject.municipalityCode, true);
  return errors;
}
