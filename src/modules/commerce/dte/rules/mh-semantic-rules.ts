// ─────────────────────────────────────────────────────────────────
// commerce/dte — rules/mh-semantic-rules.ts
//
// MH20 (IMP20-020) — motor de reglas semánticas MH 2.0 (después de AJV).
//
// Ejecuta solo las reglas del catálogo (mh-semantic-rules.catalog.ts):
//   VIGENTE_CONFIRMADA / MODIFICADA → errores (bloquean SCHEMA_VALIDATED).
//   PENDIENTE_ACLARACION            → advertencias (no bloquean), salvo la
//                                     blockCondition de las reglas clasificadas
//                                     BLOCK_EMISSION (Fase 5.1C: PEND-01/07/08).
//   ELIMINADA_CONFIRMADA            → no se ejecutan (el schema 2.0 ya
//                                     rechaza la propiedad eliminada).
//
// Función pura sobre el JSON: no lee base de datos. La correspondencia
// distrito ⊂ municipio (CAT-008) se garantiza en la generación con la
// proyección territorial canónica sobre Municipality.
// ─────────────────────────────────────────────────────────────────

import { CAT013_V2_0, normalizeCat013Name } from "../utils/cat013-municipalities";
import { isValidMh20TerritoryCombination } from "../utils/mh-territory-combinations";
import { MH_SEMANTIC_RULES, type MhSemanticKind } from "./mh-semantic-rules.catalog";

export interface MhSemanticIssue {
  ruleId:  string;
  path:    string;
  message: string;
}

export interface MhSemanticResult {
  errors:   MhSemanticIssue[];
  warnings: MhSemanticIssue[];
}

/** Holgura ±0.01 (Normativa 2.0 tabla de validaciones, campos 150.7/151.3/153.8). */
const HOLGURA = 0.01 + 1e-9;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const differs = (a: number, b: number): boolean => Math.abs(a - b) > HOLGURA;

const SEMANTIC_KINDS = new Set<string>(["01", "03", "05", "14"]);

function ruleApplies(ruleId: string, kind: MhSemanticKind): boolean {
  const def = MH_SEMANTIC_RULES.find((r) => r.id === ruleId);
  return Boolean(def && def.kinds.includes(kind) && def.status !== "ELIMINADA_CONFIRMADA");
}

// ── Reglas ejecutables ────────────────────────────────────────────

function checkTerritory(kind: MhSemanticKind, doc: Obj, out: MhSemanticResult): void {
  const roles: Array<[string, unknown]> = [["emisor", doc.emisor], ["receptor", doc.receptor]];
  for (const [role, party] of roles) {
    if (!isObj(party) || !isObj(party.direccion)) continue;
    const d = party.direccion;
    const base = `/${role}/direccion`;
    const dep = d.departamento, mun = d.municipio, dis = d.distrito;
    if (typeof dep !== "string" || !/^[0-9]{2}$/.test(dep)) {
      out.errors.push({ ruleId: "R20-TERR-01", path: `${base}/departamento`, message: "departamento CAT-012 de 2 dígitos requerido" });
      continue;
    }
    if (typeof dis !== "string" || !/^[0-9]{2}$/.test(dis)) {
      out.errors.push({ ruleId: "R20-TERR-01", path: `${base}/distrito`, message: "distrito CAT-008 de 2 dígitos requerido" });
    }
    const row = CAT013_V2_0.find((m) => m.departmentCode === dep && m.municipalityCode === mun);
    if (!row) {
      out.errors.push({
        ruleId: "R20-TERR-01", path: `${base}/municipio`,
        message: `municipio "${String(mun)}" no pertenece a CAT-013 2.0 del departamento "${dep}"`,
      });
    } else if (typeof dis === "string" && /^[0-9]{2}$/.test(dis) && !isValidMh20TerritoryCombination(dep, mun as string, dis)) {
      // Fase 6.1: jerarquía completa dep → municipio CAT-013 2.0 → distrito.
      out.errors.push({
        ruleId: "R20-TERR-01", path: `${base}/distrito`,
        message: `el distrito "${dis}" no pertenece al municipio ${normalizeCat013Name(row.municipalityName)} (${dep}/${String(mun)}) según CAT-013 2.0`,
      });
    }
  }
  void kind;
}

function checkEstablishmentCode(doc: Obj, out: MhSemanticResult): void {
  const ident = isObj(doc.identificacion) ? doc.identificacion : null;
  const nc = ident?.numeroControl;
  if (typeof nc !== "string") return; // el schema ya exige numeroControl
  const section3 = nc.split("-")[2] ?? "";
  if (!/^[MSBP][0-9]{3}P[0-9]{3}$/.test(section3)) {
    out.errors.push({
      ruleId: "R20-EST-01", path: "/identificacion/numeroControl",
      message: `sección 3 "${section3}" no sigue la codificación AT (M|S|B|P + 3 dígitos, P + 3 dígitos)`,
    });
  }
}

function checkNc(doc: Obj, out: MhSemanticResult): void {
  const rel = Array.isArray(doc.documentoRelacionado) ? doc.documentoRelacionado : [];
  if (rel.length === 0) {
    out.errors.push({ ruleId: "R20-NC-01", path: "/documentoRelacionado", message: "la NCE requiere al menos un documento relacionado (03-CCF o 07-CR)" });
  }
  rel.forEach((r, i) => {
    const t = isObj(r) ? r.tipoDocumento : undefined;
    if (t !== "03" && t !== "07") {
      out.errors.push({ ruleId: "R20-NC-01", path: `/documentoRelacionado/${i}/tipoDocumento`, message: `tipo "${String(t)}" no admitido (03 o 07)` });
    }
  });

  const res = isObj(doc.resumen) ? doc.resumen : null;
  const items = Array.isArray(doc.cuerpoDocumento) ? doc.cuerpoDocumento.filter(isObj) : [];
  if (!res) return;
  const sum = (k: string) => items.reduce((s, it) => s + num(it[k]), 0);
  const pairs: Array<[string, string]> = [["totalIva", "totalIva"], ["ivaPerci", "ivaPerci"], ["ivaRete", "ivaRete"], ["totalNoGravado", "noGravado"]];
  for (const [resKey, itemKey] of pairs) {
    if (differs(num(res[resKey]), sum(itemKey))) {
      out.errors.push({
        ruleId: "R20-NC-02", path: `/resumen/${resKey}`,
        message: `${resKey} (${num(res[resKey])}) ≠ Σ cuerpoDocumento.${itemKey} (${Math.round(sum(itemKey) * 100) / 100})`,
      });
    }
  }
  const expected = num(res.montoTotalOperacion) + num(res.ivaPerci) - num(res.ivaRete) + num(res.totalNoGravado);
  if (differs(num(res.totalPagar), Math.max(0, expected))) {
    out.errors.push({
      ruleId: "R20-NC-02", path: "/resumen/totalPagar",
      message: `totalPagar (${num(res.totalPagar)}) ≠ montoTotalOperacion + ivaPerci − ivaRete ± totalNoGravado (${Math.round(expected * 100) / 100})`,
    });
  }
  const relatesCcf = rel.some((r) => isObj(r) && r.tipoDocumento === "03");
  if (relatesCcf && res.codigoRetencionMH !== null) {
    out.errors.push({ ruleId: "R20-NC-03", path: "/resumen/codigoRetencionMH", message: "debe ser null cuando el documento a ajustar es 03-CCFE" });
  }
}

function checkTotalPagar(kind: MhSemanticKind, doc: Obj, out: MhSemanticResult): void {
  const res = isObj(doc.resumen) ? doc.resumen : null;
  if (!res) return;
  let expected: number;
  let formula: string;
  if (kind === "01") {
    expected = num(res.montoTotalOperacion) - num(res.ivaRete) + num(res.totalNoGravado);
    formula = "montoTotalOperacion − ivaRete ± totalNoGravado";
  } else if (kind === "03") {
    expected = num(res.montoTotalOperacion) + num(res.ivaPerci) - num(res.ivaRete) + num(res.totalNoGravado);
    formula = "montoTotalOperacion + ivaPerci − ivaRete ± totalNoGravado";
  } else if (kind === "14") {
    expected = num(res.subTotal) - num(res.reteRenta);
    formula = "subTotal − reteRenta";
  } else {
    return;
  }
  if (differs(num(res.totalPagar), Math.max(0, expected))) {
    out.errors.push({
      ruleId: "R20-TOT-01", path: "/resumen/totalPagar",
      message: `totalPagar (${num(res.totalPagar)}) ≠ ${formula} (${Math.round(Math.max(0, expected) * 100) / 100})`,
    });
  }
}

// ── Advertencias (PENDIENTE_ACLARACION) ───────────────────────────

/** Fase 5.1C: blockCondition de una regla BLOCK_EMISSION → error; resto → advertencia. */
function pendingBlocks(ruleId: string): boolean {
  return MH_SEMANTIC_RULES.find((r) => r.id === ruleId)?.classification === "BLOCK_EMISSION";
}

const UUID_UPPER = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/;

function warnIdentification(doc: Obj, out: MhSemanticResult): void {
  const id = isObj(doc.identificacion) ? doc.identificacion : null;
  if (!id) return;
  const op = id.tipoOperacion, modelo = id.tipoModelo, tc = id.tipoContingencia, mc = id.motivoContin;
  const w = (path: string, message: string) => out.warnings.push({ ruleId: "R20-PEND-01", path: `/identificacion/${path}`, message });
  // blockCondition (5.1C): DTE en contingencia con MH_2_0 (INC-005, IMP20-019).
  if (pendingBlocks("R20-PEND-01") && (op === 2 || (tc !== null && tc !== undefined))) {
    out.errors.push({
      ruleId: "R20-PEND-01", path: "/identificacion/tipoOperacion",
      message: "emisión en contingencia no disponible con MH 2.0 (Evento de Contingencia 2.0 bloqueado: INC-005)",
    });
  }
  if (op === 1) {
    if (modelo !== 1) w("tipoModelo", "tipoOperacion 1 con tipoModelo distinto de 1");
    if (mc !== null) w("motivoContin", "tipoOperacion 1 con motivoContin no nulo");
  } else if (op === 2) {
    if (modelo !== 2) w("tipoModelo", "tipoOperacion 2 con tipoModelo distinto de 2");
  }
  if (tc === 5 && typeof mc !== "string") w("motivoContin", "tipoContingencia 5 sin motivoContin");
}

function warnReceptorDocument(kind: MhSemanticKind, doc: Obj, out: MhSemanticResult): void {
  const r = isObj(doc.receptor) ? doc.receptor : null;
  if (!r) return;
  const t = r.tipoDocumento, n = r.numDocumento;
  if (typeof n !== "string") return;
  if (t === "36" && !/^([0-9]{14}|[0-9]{9})$/.test(n)) {
    out.warnings.push({ ruleId: "R20-PEND-02", path: "/receptor/numDocumento", message: "NIT (36) sin formato de 9 o 14 dígitos" });
  }
  if (t === "13" && kind === "01" && !/^[0-9]{8}-[0-9]$/.test(n)) {
    out.warnings.push({ ruleId: "R20-PEND-02", path: "/receptor/numDocumento", message: "DUI (13) sin formato ########-#" });
  }
}

function warnRetentions(doc: Obj, out: MhSemanticResult): void {
  const res = isObj(doc.resumen) ? doc.resumen : null;
  if (!res || num(res.totalGravada) > 0) return;
  for (const k of ["ivaRete", "ivaPerci"]) {
    if (num(res[k]) > 0) out.warnings.push({ ruleId: "R20-PEND-03", path: `/resumen/${k}`, message: `${k} > 0 con totalGravada = 0` });
  }
}

function warnPayments(doc: Obj, out: MhSemanticResult): void {
  const res = isObj(doc.resumen) ? doc.resumen : null;
  if (!res) return;
  if (res.condicionOperacion === 2 && Array.isArray(res.pagos)) {
    res.pagos.forEach((p, i) => {
      if (isObj(p) && (typeof p.plazo !== "string" || typeof p.periodo !== "number")) {
        out.warnings.push({ ruleId: "R20-PEND-04", path: `/resumen/pagos/${i}`, message: "condicionOperacion 2 sin plazo/periodo" });
      }
    });
  }
  if (num(res.totalPagar) === 0 && res.condicionOperacion !== undefined && res.condicionOperacion !== 1) {
    out.warnings.push({ ruleId: "R20-PEND-04", path: "/resumen/condicionOperacion", message: "totalPagar 0 con condicionOperacion distinta de 1" });
  }
}

function warnObservaciones(doc: Obj, out: MhSemanticResult): void {
  const res = isObj(doc.resumen) ? doc.resumen : null;
  const o = res?.observaciones;
  if (typeof o === "string" && o.length > 3000) {
    out.warnings.push({ ruleId: "R20-PEND-05", path: "/resumen/observaciones", message: `longitud ${o.length} > 3000` });
  }
}

function warnItems(doc: Obj, out: MhSemanticResult): void {
  const items = Array.isArray(doc.cuerpoDocumento) ? doc.cuerpoDocumento : [];
  items.forEach((it, i) => {
    if (!isObj(it)) return;
    if (num(it.ventaGravada) <= 0 && it.tributos !== null && it.tributos !== undefined) {
      out.warnings.push({ ruleId: "R20-PEND-06", path: `/cuerpoDocumento/${i}/tributos`, message: "ventaGravada 0 con tributos no nulos" });
    }
    if (it.tipoItem === 4 && it.uniMedida !== 99) {
      out.warnings.push({ ruleId: "R20-PEND-06", path: `/cuerpoDocumento/${i}/uniMedida`, message: "tipoItem 4 con uniMedida distinta de 99" });
    }
  });
}

function warnRelated(doc: Obj, out: MhSemanticResult): void {
  const rel = Array.isArray(doc.documentoRelacionado) ? doc.documentoRelacionado : [];
  rel.forEach((r, i) => {
    if (!isObj(r) || typeof r.numeroDocumento !== "string") return;
    if (r.tipoGeneracion === 2 && !UUID_UPPER.test(r.numeroDocumento)) {
      const issue = { ruleId: "R20-PEND-07", path: `/documentoRelacionado/${i}/numeroDocumento`, message: "tipoGeneracion 2 sin código de generación UUID en mayúsculas" };
      if (pendingBlocks("R20-PEND-07")) out.errors.push(issue);
      else out.warnings.push(issue);
    }
  });
}

/** R20-PEND-08 (FE 01): receptor identificado desde $1,095.00 (restricción FE v1 conservada). */
function checkReceptorThreshold(kind: MhSemanticKind, doc: Obj, out: MhSemanticResult): void {
  if (kind !== "01") return;
  const res = isObj(doc.resumen) ? doc.resumen : null;
  if (!res || num(res.montoTotalOperacion) < 1095) return;
  const r = isObj(doc.receptor) ? doc.receptor : null;
  const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  if (r && filled(r.tipoDocumento) && filled(r.numDocumento) && filled(r.nombre)) return;
  const issue = {
    ruleId: "R20-PEND-08", path: "/receptor",
    message: "FE con montoTotalOperacion ≥ 1095.00 requiere receptor identificado (tipoDocumento, numDocumento y nombre)",
  };
  if (pendingBlocks("R20-PEND-08")) out.errors.push(issue);
  else out.warnings.push(issue);
}

// ── Punto de entrada ──────────────────────────────────────────────

export function runMhSemanticRules(kind: string, documentData: unknown): MhSemanticResult {
  const out: MhSemanticResult = { errors: [], warnings: [] };
  if (!SEMANTIC_KINDS.has(kind) || !isObj(documentData)) return out;
  const k = kind as MhSemanticKind;
  const doc = documentData;

  if (ruleApplies("R20-TERR-01", k)) checkTerritory(k, doc, out);
  if (ruleApplies("R20-EST-01", k))  checkEstablishmentCode(doc, out);
  if (k === "05")                    checkNc(doc, out);
  if (ruleApplies("R20-TOT-01", k))  checkTotalPagar(k, doc, out);

  if (ruleApplies("R20-PEND-01", k)) warnIdentification(doc, out);
  if (ruleApplies("R20-PEND-02", k)) warnReceptorDocument(k, doc, out);
  if (ruleApplies("R20-PEND-03", k)) warnRetentions(doc, out);
  if (ruleApplies("R20-PEND-04", k)) warnPayments(doc, out);
  if (ruleApplies("R20-PEND-05", k)) warnObservaciones(doc, out);
  if (ruleApplies("R20-PEND-06", k)) warnItems(doc, out);
  if (ruleApplies("R20-PEND-07", k)) warnRelated(doc, out);
  if (ruleApplies("R20-PEND-08", k)) checkReceptorThreshold(k, doc, out);

  return out;
}
