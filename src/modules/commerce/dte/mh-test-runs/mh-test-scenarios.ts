// ─────────────────────────────────────────────────────────────────
// commerce/dte/mh-test-runs — mh-test-scenarios.ts
//
// DTE-MH-TEST-RUNS — catálogo de escenarios de pruebas de Hacienda (TEST)
// y armado SINTÉTICO de los datos de entrada de los builders puros
// existentes (FE 01, CCFE 03, FEX 11, FSE 14). NC 05 se genera con el
// servicio real (generateNcJsonForDte) sobre el CCFE aceptado.
//
// Reglas:
//   - NO crea ni modifica Sale, Purchase, Customer, Supplier, inventario,
//     caja, cuentas ni contabilidad: los datos del receptor vienen del plan
//     de la corrida (perfiles editables por el operador).
//   - NO inventa identificaciones fiscales: todo campo requerido del
//     receptor debe ingresarlo el operador; si falta, la validación falla
//     antes de reservar correlativos.
//   - Las funciones de armado son puras (sin base de datos). Las
//     validaciones territoriales/catálogo se resuelven aparte
//     (resolveMhTestBuildContext) contra la base runtime.
// ─────────────────────────────────────────────────────────────────

import { Prisma, type PrismaClient } from "@prisma/client";
import { buildFeJsonFromLoadedData, type FeBuildSale, type FeBuildIssuer } from "../services/generate-fe-json.service";
import { buildCcfeJsonFromLoadedData, type CcfeBuildSale, type CcfeBuildIssuer } from "../services/generate-ccfe-json.service";
import { buildFexJsonFromLoadedData, resolveFexEmisorTerritory, type FexLoadedData } from "../services/generate-fex-json.service";
import { buildFseJsonFromLoadedData, type FseLoadedData } from "../services/generate-fse-json.service";
import { validateDteJsonAgainstOfficialSchema } from "../services/validate-dte-json-schema.service";
import { normalizeNitForDte, normalizeNrcForDte } from "../utils/fiscal-id.utils";
import { validateDteAddressCodes } from "../utils/dte-territory.resolver";
import { buildControlNumber } from "../utils/dte-control-number";
import type { DteBuildProfileOptions } from "../utils/mh20-builder-helpers";
import type { DteSpecProfile } from "../spec/dte-spec-profile";
import { previewMhTerritory } from "../utils/mh-territory-combinations";

// ── Catálogo ──────────────────────────────────────────────────────

export const MH_TEST_SCENARIOS = {
  FE01_CONSUMIDOR_FINAL: { dteTypeCode: "01", label: "FE 01 — consumidor final (sin receptor identificado)", receptor: null,        contingency: false, invalidable: false },
  FE01_IDENTIFICADO:     { dteTypeCode: "01", label: "FE 01 — receptor identificado (DUI/NIT)",              receptor: "identified", contingency: false, invalidable: true  },
  CCFE03_ESTANDAR:       { dteTypeCode: "03", label: "CCFE 03 — contribuyente registrado",                   receptor: "taxpayer",   contingency: false, invalidable: true  },
  NC05_SOBRE_CCFE:       { dteTypeCode: "05", label: "NC 05 — nota de crédito total sobre un CCFE aceptado", receptor: "taxpayer",   contingency: false, invalidable: false },
  FEX11_SERVICIOS:       { dteTypeCode: "11", label: "FEX 11 — exportación de servicios",                    receptor: "foreign",    contingency: false, invalidable: false },
  FSE14_SERVICIOS:       { dteTypeCode: "14", label: "FSE 14 — servicios de persona natural (retención renta)", receptor: "excluded", contingency: false, invalidable: false },
  CONT01_FE:             { dteTypeCode: "01", label: "FE 01 — emitida en contingencia (consumidor final)",   receptor: null,        contingency: true,  invalidable: false },
  CONT03_CCFE:           { dteTypeCode: "03", label: "CCFE 03 — emitido en contingencia",                    receptor: "taxpayer",   contingency: true,  invalidable: false },
} as const;

export type MhTestScenarioCode = keyof typeof MH_TEST_SCENARIOS;
export type MhTestDteTypeCode  = "01" | "03" | "05" | "11" | "14";
export const MH_TEST_DTE_TYPE_CODES: readonly MhTestDteTypeCode[] = ["01", "03", "05", "11", "14"];

export function isMhTestScenarioCode(v: unknown): v is MhTestScenarioCode {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(MH_TEST_SCENARIOS, v);
}

/** Escenarios que pueden ser objetivo de una invalidación (OBS-1: FE sin receptor no). */
export const MH_TEST_INVALIDATION_TARGETS: readonly MhTestScenarioCode[] = ["FE01_IDENTIFICADO", "CCFE03_ESTANDAR"];

// ── Perfiles de receptor (editables, sin valores inventados) ──────

export interface MhTestIdentifiedReceptor {
  idTypeCode:        "13" | "36";
  documentNumber:    string;
  name:              string;
  email?:            string | null;
  phone?:            string | null;
  deptCode?:         string | null;
  municipalityCode?: string | null;
  addressComplement?: string | null;
}

export interface MhTestTaxpayerReceptor {
  nit:               string;
  nrc:               string;
  name:              string;
  legalName?:        string | null;
  activityCode:      string;
  activityName:      string;
  deptCode:          string;
  municipalityCode:  string;
  addressComplement: string;
  phone?:            string | null;
  email:             string;
}

export interface MhTestForeignReceptor {
  name:              string;
  idTypeCode:        "36" | "13" | "02" | "03" | "37";
  documentNumber:    string;
  countryCode:       string;
  addressComplement: string;
  activityName:      string;
  personType:        "1" | "2";
  email:             string;
  phone?:            string | null;
}

export interface MhTestExcludedSubject {
  idTypeCode:        "36" | "13" | "02" | "03" | "37";
  documentNumber:    string;
  name:              string;
  activityCode?:     string | null;
  activityName?:     string | null;
  deptCode:          string;
  municipalityCode:  string;
  addressComplement: string;
  phone?:            string | null;
  email?:            string | null;
}

export interface MhTestReceptors {
  identified?:      MhTestIdentifiedReceptor | null;
  taxpayer?:        MhTestTaxpayerReceptor | null;
  foreign?:         MhTestForeignReceptor | null;
  excludedSubject?: MhTestExcludedSubject | null;
}

/** Responsable/solicitante de eventos (invalidación y contingencia). */
export interface MhTestResponsible {
  name:           string;
  docTypeCode:    "13" | "36" | "02" | "03" | "37";
  documentNumber: string;
}

export interface MhTestContingencySettings {
  /** CAT-005: 1..5 */
  contingencyTypeCode: "1" | "2" | "3" | "4" | "5";
  reason:              string | null;
}

// ── Validación pura de perfiles ───────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blank(v: string | null | undefined): boolean {
  return !v || !v.trim();
}

function digits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function checkIdNumber(prefix: string, idTypeCode: string, value: string, errors: string[]) {
  const d = digits(value);
  if (idTypeCode === "36" && !(d.length === 9 || d.length === 14)) {
    errors.push(`${prefix}: el NIT debe tener 9 o 14 dígitos.`);
  } else if (idTypeCode === "13" && d.length !== 9) {
    errors.push(`${prefix}: el DUI debe tener 9 dígitos.`);
  } else if (blank(value)) {
    errors.push(`${prefix}: número de documento requerido.`);
  }
}

function checkEmail(prefix: string, v: string | null | undefined, required: boolean, errors: string[]) {
  if (blank(v)) {
    if (required) errors.push(`${prefix}: correo electrónico requerido.`);
    return;
  }
  if (!EMAIL_RE.test(v!.trim())) errors.push(`${prefix}: correo electrónico inválido.`);
}

/**
 * Valida (puro) los perfiles requeridos por los escenarios elegidos. No
 * completa ni inventa datos: devuelve la lista de errores por campo.
 */
export function validateMhTestReceptors(
  scenarios: ReadonlySet<MhTestScenarioCode>,
  receptors: MhTestReceptors,
  responsible: MhTestResponsible | null,
  needsResponsible: boolean,
  contingency: MhTestContingencySettings | null,
): string[] {
  const errors: string[] = [];
  const needs = new Set<string>();
  for (const s of scenarios) {
    const r = MH_TEST_SCENARIOS[s].receptor;
    if (r) needs.add(r);
  }

  if (needs.has("identified")) {
    const r = receptors.identified;
    const p = "Receptor identificado (FE 01)";
    if (!r) errors.push(`${p}: perfil requerido.`);
    else {
      if (r.idTypeCode !== "13" && r.idTypeCode !== "36") errors.push(`${p}: tipo de documento debe ser 13 (DUI) o 36 (NIT).`);
      checkIdNumber(p, r.idTypeCode, r.documentNumber, errors);
      if (blank(r.name)) errors.push(`${p}: nombre requerido.`);
      checkEmail(p, r.email, false, errors);
      if (Boolean(r.deptCode) !== Boolean(r.municipalityCode)) errors.push(`${p}: departamento y municipio van juntos.`);
    }
  }

  if (needs.has("taxpayer")) {
    const r = receptors.taxpayer;
    const p = "Contribuyente (CCFE 03 / NC 05)";
    if (!r) errors.push(`${p}: perfil requerido.`);
    else {
      checkIdNumber(p, "36", r.nit, errors);
      const nrc = digits(r.nrc);
      if (nrc.length < 1 || nrc.length > 8) errors.push(`${p}: NRC requerido (1 a 8 dígitos).`);
      if (blank(r.name)) errors.push(`${p}: nombre requerido.`);
      if (!/^\d{5,6}$/.test(r.activityCode ?? "")) errors.push(`${p}: código de actividad económica (CAT-019) requerido.`);
      if (blank(r.activityName)) errors.push(`${p}: descripción de actividad requerida.`);
      if (blank(r.deptCode) || blank(r.municipalityCode)) errors.push(`${p}: departamento y municipio requeridos.`);
      if (blank(r.addressComplement)) errors.push(`${p}: complemento de dirección requerido.`);
      checkEmail(p, r.email, true, errors);
    }
  }

  if (needs.has("foreign")) {
    const r = receptors.foreign;
    const p = "Receptor extranjero (FEX 11)";
    if (!r) errors.push(`${p}: perfil requerido.`);
    else {
      if (!["36", "13", "02", "03", "37"].includes(r.idTypeCode)) errors.push(`${p}: tipo de documento inválido.`);
      if (blank(r.documentNumber)) errors.push(`${p}: número de documento requerido.`);
      if (blank(r.name)) errors.push(`${p}: nombre requerido.`);
      if (blank(r.countryCode)) errors.push(`${p}: país (CAT-020) requerido.`);
      if (blank(r.addressComplement)) errors.push(`${p}: dirección requerida.`);
      if (blank(r.activityName)) errors.push(`${p}: descripción de actividad requerida.`);
      if (r.personType !== "1" && r.personType !== "2") errors.push(`${p}: tipo de persona debe ser 1 (natural) o 2 (jurídica).`);
      checkEmail(p, r.email, true, errors);
    }
  }

  if (needs.has("excluded")) {
    const r = receptors.excludedSubject;
    const p = "Sujeto excluido (FSE 14)";
    if (!r) errors.push(`${p}: perfil requerido.`);
    else {
      if (!["36", "13", "02", "03", "37"].includes(r.idTypeCode)) errors.push(`${p}: tipo de documento inválido.`);
      if (r.idTypeCode === "36" || r.idTypeCode === "13") checkIdNumber(p, r.idTypeCode, r.documentNumber, errors);
      else if (blank(r.documentNumber)) errors.push(`${p}: número de documento requerido.`);
      if (blank(r.name)) errors.push(`${p}: nombre requerido.`);
      if (blank(r.deptCode) || blank(r.municipalityCode)) errors.push(`${p}: departamento y municipio requeridos.`);
      if (blank(r.addressComplement)) errors.push(`${p}: complemento de dirección requerido.`);
      checkEmail(p, r.email, false, errors);
    }
  }

  if (needsResponsible) {
    const p = "Responsable de eventos (invalidación/contingencia)";
    if (!responsible) errors.push(`${p}: requerido.`);
    else {
      if (!responsible.name || responsible.name.trim().length < 5) errors.push(`${p}: nombre de al menos 5 caracteres.`);
      if (!["13", "36", "02", "03", "37"].includes(responsible.docTypeCode)) errors.push(`${p}: tipo de documento inválido.`);
      if (!responsible.documentNumber || responsible.documentNumber.trim().length < 5) errors.push(`${p}: número de documento de al menos 5 caracteres.`);
    }
  }

  const usesContingency = [...scenarios].some((s) => MH_TEST_SCENARIOS[s].contingency);
  if (usesContingency) {
    const p = "Contingencia";
    if (!contingency) errors.push(`${p}: configuración requerida.`);
    else {
      if (!["1", "2", "3", "4", "5"].includes(contingency.contingencyTypeCode)) errors.push(`${p}: tipo de contingencia (CAT-005) inválido.`);
      if (contingency.contingencyTypeCode === "5" && blank(contingency.reason)) errors.push(`${p}: el tipo 5 exige motivo.`);
      if (contingency.reason && contingency.reason.length > 500) errors.push(`${p}: el motivo no puede superar 500 caracteres.`);
    }
  }
  return errors;
}

// ── Contexto de armado (resuelto contra la base runtime) ──────────

export const MH_TEST_ISSUER_SELECT = {
  id:                      true,
  tenant_id:               true,
  location_id:             true,
  environment:             true,
  is_active:               true,
  nit:                     true,
  nrc:                     true,
  name:                    true,
  legal_name:              true,
  activity_code:           true,
  activity_name:           true,
  establishment_code:      true,
  establishment_type_code: true,
  point_of_sale_code:      true,
  cod_estable_mh:          true,
  cod_punto_venta_mh:      true,
  dept_code:               true,
  municipality_code:       true,
  address_complement:      true,
  phone:                   true,
  email:                   true,
} as const satisfies Prisma.DteIssuerConfigSelect;

export type MhTestIssuer = Prisma.DteIssuerConfigGetPayload<{ select: typeof MH_TEST_ISSUER_SELECT }>;

export interface MhTestBuildContext {
  issuer:             MhTestIssuer;
  receptors:          MhTestReceptors;
  emisorFexTerritory: FexLoadedData["emisorFexTerritory"];
  foreignCountry:     { code: string; name: string } | null;
}

/**
 * Validaciones que requieren catálogos de la base runtime (territorio
 * CAT-012/013, proyección FEX v3, país CAT-020). Solo lectura.
 */
export async function resolveMhTestBuildContext(
  db: PrismaClient,
  issuer: MhTestIssuer,
  scenarios: ReadonlySet<MhTestScenarioCode>,
  receptors: MhTestReceptors,
  // MH20 (Fase 8): perfil de la corrida (default MH_1_2 = comportamiento previo).
  profile: DteSpecProfile = "MH_1_2",
): Promise<{ ok: true; context: MhTestBuildContext } | { ok: false; errors: string[] }> {
  const errors: string[] = [];
  if (issuer.environment !== "TEST") errors.push("El emisor de las pruebas debe ser del ambiente TEST.");
  if (!issuer.cod_estable_mh || !issuer.cod_punto_venta_mh) errors.push("El emisor TEST no tiene cod_estable_mh / cod_punto_venta_mh configurados.");
  if (!issuer.activity_code || !issuer.activity_name) errors.push("El emisor TEST no tiene actividad económica configurada.");

  const emisorAddr = await validateDteAddressCodes({ role: "emisor", deptCode: issuer.dept_code, municipalityCode: issuer.municipality_code }, db);
  if (!emisorAddr.ok) errors.push(emisorAddr.error);

  const needs = new Set([...scenarios].map((s) => MH_TEST_SCENARIOS[s].receptor));
  if (needs.has("identified") && receptors.identified?.deptCode) {
    const r = await validateDteAddressCodes({ role: "receptor", deptCode: receptors.identified.deptCode, municipalityCode: receptors.identified.municipalityCode }, db);
    if (!r.ok) errors.push(r.error);
  }
  if (needs.has("taxpayer") && receptors.taxpayer) {
    const r = await validateDteAddressCodes({ role: "receptor", deptCode: receptors.taxpayer.deptCode, municipalityCode: receptors.taxpayer.municipalityCode }, db);
    if (!r.ok) errors.push(r.error);
  }
  if (needs.has("excluded") && receptors.excludedSubject) {
    const r = await validateDteAddressCodes({ role: "sujeto excluido", deptCode: receptors.excludedSubject.deptCode, municipalityCode: receptors.excludedSubject.municipalityCode }, db);
    if (!r.ok) errors.push(r.error);
  }

  let emisorFexTerritory: FexLoadedData["emisorFexTerritory"] = null;
  let foreignCountry: { code: string; name: string } | null = null;
  if (needs.has("foreign")) {
    const projected = await resolveFexEmisorTerritory({ deptCode: issuer.dept_code, municipalityCode: issuer.municipality_code }, db, profile);
    if (!projected.ok) errors.push(projected.error);
    else emisorFexTerritory = projected.territory;
    const code = receptors.foreign?.countryCode?.trim();
    if (code) {
      foreignCountry = await db.country.findFirst({ where: { code, status: "active" }, select: { code: true, name: true } });
      if (!foreignCountry) errors.push(`El país "${code}" no existe o no está vigente en CAT-020.`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, context: { issuer, receptors, emisorFexTerritory, foreignCountry } };
}

// ── Montos sintéticos deterministas ───────────────────────────────

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Base gravada sin IVA por índice: 10.00, 11.00, ... (montos de prueba, no comerciales). */
export function mhTestBaseAmount(index: number): number {
  return 10 + (index % 50);
}

const D = (n: number) => new Prisma.Decimal(r2(n).toFixed(2));

export interface MhTestDocumentIdentity {
  control_number:         string;
  generation_code:        string;
  transmission_type_code: string;
  contingency_type_code:  string | null;
  contingency_reason:     string | null;
}

export type MhTestBuildResult = { ok: true; json: Record<string, unknown> } | { ok: false; error: string };

function feIssuer(i: MhTestIssuer): FeBuildIssuer & CcfeBuildIssuer {
  return {
    nit: i.nit, nrc: i.nrc, name: i.name, legal_name: i.legal_name,
    activity_code: i.activity_code, activity_name: i.activity_name,
    establishment_code: i.establishment_code, establishment_type_code: i.establishment_type_code,
    point_of_sale_code: i.point_of_sale_code, dept_code: i.dept_code, municipality_code: i.municipality_code,
    address_complement: i.address_complement, phone: i.phone, email: i.email, environment: i.environment,
  } as FeBuildIssuer & CcfeBuildIssuer;
}

function syntheticSaleCore(index: number, now: Date) {
  const base  = mhTestBaseAmount(index);
  const iva   = r2(base * 0.13);
  const total = r2(base + iva);
  return {
    base, iva, total,
    core: {
      id:                       `mh-test-${index}`,
      sale_date:                now,
      status:                   "CONFIRMED" as const,
      inventory_moved:          true,
      condition_operation_code: "1",
      payment_method_code:      "01",
      payment_term_code:        null,
      payment_term_value:       null,
      subtotal:                 D(base),
      discount_amount:          D(0),
      tax_amount:               D(iva),
      total_amount:             D(total),
      items: [{
        line_number:           1,
        product_code_snapshot: "MHTEST-SRV",
        product_name_snapshot: "SERVICIO DE PRUEBA DE CERTIFICACION MH",
        product_type_snapshot: "SERVICE",
        quantity:              new Prisma.Decimal("1"),
        unit_price:            D(total),
        discount_amount:       D(0),
        tax_rate_snapshot:     new Prisma.Decimal("13"),
        tax_amount:            D(iva),
        line_subtotal:         D(base),
        line_total:            D(total),
      }],
      payments: [{ mh_payment_form_code: "01", amount: D(total), reference: null }],
    },
  };
}

function buildFe(ctx: MhTestBuildContext, scenario: MhTestScenarioCode, doc: MhTestDocumentIdentity, index: number, now: Date, options: DteBuildProfileOptions): MhTestBuildResult {
  const { core } = syntheticSaleCore(index, now);
  const r = scenario === "FE01_IDENTIFICADO" ? ctx.receptors.identified : null;
  const sale = {
    ...core,
    customer_id: r ? "mh-test-receptor" : null,
    customer: r
      ? {
          id: "mh-test-receptor", name: r.name.trim(), id_type_code: r.idTypeCode,
          nit: r.idTypeCode === "36" ? digits(r.documentNumber) : null, nrc: null,
          dui: r.idTypeCode === "13" ? formatDui(r.documentNumber) : null,
          activity_code: null, activity_name: null,
          dept_code: r.deptCode ?? null, municipality_code: r.municipalityCode ?? null,
          address_complement: r.addressComplement ?? null, phone: r.phone ?? null, email: r.email ?? null,
        }
      : null,
  } as unknown as FeBuildSale;
  return buildFeJsonFromLoadedData({ dteDoc: doc, sale, issuerConfig: feIssuer(ctx.issuer) }, now, options);
}

function buildCcfe(ctx: MhTestBuildContext, doc: MhTestDocumentIdentity, index: number, now: Date, options: DteBuildProfileOptions): MhTestBuildResult {
  const { core } = syntheticSaleCore(index, now);
  const r = ctx.receptors.taxpayer;
  if (!r) return { ok: false, error: "Falta el perfil del contribuyente receptor." };
  const sale = {
    ...core,
    customer_id: "mh-test-receptor",
    customer: {
      id: "mh-test-receptor", name: r.name.trim(), legal_name: r.legalName ?? null, taxpayer_type: "REGISTERED_TAXPAYER",
      nit: normalizeNitForDte(r.nit), nrc: normalizeNrcForDte(r.nrc),
      activity_code: r.activityCode, activity_name: r.activityName,
      dept_code: r.deptCode, municipality_code: r.municipalityCode, address_complement: r.addressComplement,
      phone: r.phone ?? null, email: r.email,
    },
  } as unknown as CcfeBuildSale;
  return buildCcfeJsonFromLoadedData({ dteDoc: doc, sale, issuerConfig: feIssuer(ctx.issuer) }, now, options);
}

function buildFex(ctx: MhTestBuildContext, doc: MhTestDocumentIdentity, index: number): MhTestBuildResult {
  const r = ctx.receptors.foreign;
  if (!r) return { ok: false, error: "Falta el perfil del receptor extranjero." };
  const total = mhTestBaseAmount(index) * 10;
  const loaded: FexLoadedData = {
    tenant_id: ctx.issuer.tenant_id,
    dteDoc: { control_number: doc.control_number, generation_code: doc.generation_code },
    sale: {
      status: "CONFIRMED", inventory_moved: true, customer_id: "mh-test-receptor", primary_dte_type_code: "11",
      condition_operation_code: "1", payment_method_code: "01", payment_term_code: null, payment_term_value: null,
      total_amount: total, notes: null,
      customer: {
        id: "mh-test-receptor", name: r.name.trim(), legal_name: null, id_type_code: r.idTypeCode,
        nit: r.idTypeCode === "36" ? digits(r.documentNumber) : null,
        dui: r.idTypeCode === "36" ? null : r.documentNumber.trim(),
        activity_name: r.activityName, address_complement: r.addressComplement, phone: r.phone ?? null, email: r.email,
        is_foreign: true, country_code: ctx.foreignCountry?.code ?? r.countryCode, country_name: ctx.foreignCountry?.name ?? null,
        customer_person_type: r.personType,
      },
      export_details: {
        tenant_id: ctx.issuer.tenant_id, item_type_export: 2, fiscal_precinct_code: null, regime_code: null,
        incoterm_code: null, incoterm_desc: null, insurance_amount: 0, freight_amount: 0,
      },
      items: [{
        line_number: 1, product_code_snapshot: "MHTEST-SRV", product_name_snapshot: "SERVICIO DE PRUEBA DE CERTIFICACION MH",
        product_type_snapshot: "SERVICE", quantity: 1, unit_price: total, discount_amount: 0, tax_rate_snapshot: 0,
        line_subtotal: total, line_total: total, product: { unit: { mh_unit_code: "59" } },
      }],
      payments: [{ mh_payment_form_code: "01", amount: total, reference: null }],
    },
    issuerConfig: {
      nit: ctx.issuer.nit, nrc: ctx.issuer.nrc, name: ctx.issuer.name, legal_name: ctx.issuer.legal_name,
      activity_code: ctx.issuer.activity_code, activity_name: ctx.issuer.activity_name,
      establishment_code: ctx.issuer.establishment_code, point_of_sale_code: ctx.issuer.point_of_sale_code,
      dept_code: ctx.issuer.dept_code, municipality_code: ctx.issuer.municipality_code,
      address_complement: ctx.issuer.address_complement, phone: ctx.issuer.phone, email: ctx.issuer.email,
      environment: ctx.issuer.environment,
    },
    emisorFexTerritory: ctx.emisorFexTerritory,
    receptorCountry:    ctx.foreignCountry,
  };
  const res = buildFexJsonFromLoadedData(loaded);
  return res.ok ? { ok: true, json: res.json as unknown as Record<string, unknown> } : { ok: false, error: res.error };
}

function buildFse(ctx: MhTestBuildContext, doc: MhTestDocumentIdentity, index: number, options: DteBuildProfileOptions): MhTestBuildResult {
  const r = ctx.receptors.excludedSubject;
  if (!r) return { ok: false, error: "Falta el perfil del sujeto excluido." };
  const subtotal = mhTestBaseAmount(index) * 10;
  // Servicios de persona natural → Retención de Renta 10 % (misma regla que
  // computeIncomeTaxWithholding: SERVICES + NATURAL_PERSON).
  const withholding = r2(subtotal * 0.10);
  const loaded: FseLoadedData = {
    dteDoc: { control_number: doc.control_number, generation_code: doc.generation_code },
    purchase: {
      tenant_id: ctx.issuer.tenant_id, status: "CONFIRMED", document_type: "FSE", notes: null,
      payment_condition: "CASH", cancellation_type: null,
      retention_1pct_applies: false, retention_1pct_amount: 0,
      income_tax_withholding_applies: true, income_tax_withholding_amount: withholding,
      supplier: {
        name: r.name.trim(), legal_name: null, taxpayer_type: "EXCLUDED_SUBJECT", id_type_code: r.idTypeCode === "36" ? "00" : r.idTypeCode,
        nit: r.idTypeCode === "36" ? digits(r.documentNumber) : null,
        dui: r.idTypeCode === "13" ? formatDui(r.documentNumber) : null,
        other_document: r.idTypeCode === "36" || r.idTypeCode === "13" ? null : r.documentNumber.trim(),
        activity_code: r.activityCode ?? null, activity_name: r.activityName ?? null,
        dept_code: r.deptCode, municipality_code: r.municipalityCode, address_complement: r.addressComplement,
        phone: r.phone ?? null, email: r.email ?? null,
      },
      items: [{
        dte_line_number: 1, quantity: 1, unit_cost: subtotal, line_subtotal: subtotal,
        product: { product_code: "MHTEST-SRV", name: "SERVICIO DE PRUEBA DE CERTIFICACION MH", product_type: "SERVICE", unit: { mh_unit_code: "59" } },
      }],
    },
    issuerConfig: {
      nit: ctx.issuer.nit, nrc: ctx.issuer.nrc, name: ctx.issuer.name,
      activity_code: ctx.issuer.activity_code, activity_name: ctx.issuer.activity_name,
      establishment_code: ctx.issuer.establishment_code, point_of_sale_code: ctx.issuer.point_of_sale_code,
      cod_estable_mh: ctx.issuer.cod_estable_mh, cod_punto_venta_mh: ctx.issuer.cod_punto_venta_mh,
      dept_code: ctx.issuer.dept_code, municipality_code: ctx.issuer.municipality_code,
      address_complement: ctx.issuer.address_complement, phone: ctx.issuer.phone, email: ctx.issuer.email,
      environment: ctx.issuer.environment,
    },
  };
  const res = buildFseJsonFromLoadedData(loaded, options);
  return res.ok ? { ok: true, json: res.json as unknown as Record<string, unknown> } : { ok: false, error: res.error };
}

function formatDui(v: string): string {
  const d = digits(v);
  return d.length === 9 ? `${d.slice(0, 8)}-${d.slice(8)}` : v.trim();
}

/**
 * Arma (puro) el json_document de un escenario. NC 05 no se arma aquí:
 * depende del CCFE aceptado y usa generateNcJsonForDte.
 */
export function buildMhTestScenarioJson(
  ctx:      MhTestBuildContext,
  scenario: MhTestScenarioCode,
  doc:      MhTestDocumentIdentity,
  index:    number,
  now:      Date,
  // MH20: opciones de perfil para los builders puros (default = MH_1_2,
  // salida histórica byte a byte). FEX v3 es igual en ambos perfiles.
  options:  DteBuildProfileOptions = {},
): MhTestBuildResult {
  try {
    switch (scenario) {
      case "FE01_CONSUMIDOR_FINAL":
      case "FE01_IDENTIFICADO":
      case "CONT01_FE":
        return buildFe(ctx, scenario, doc, index, now, options);
      case "CCFE03_ESTANDAR":
      case "CONT03_CCFE":
        return buildCcfe(ctx, doc, index, now, options);
      case "FEX11_SERVICIOS":
        return buildFex(ctx, doc, index);
      case "FSE14_SERVICIOS":
        return buildFse(ctx, doc, index, options);
      case "NC05_SOBRE_CCFE":
        return { ok: false, error: "NC 05 se genera sobre el CCFE aceptado (generateNcJsonForDte)." };
    }
  } catch (err) {
    // Los builders pueden lanzar errores de negocio del módulo.
    return { ok: false, error: err instanceof Error ? err.message : "Error al armar el JSON del escenario." };
  }
}

export const MH_TEST_PLACEHOLDER_GENERATION_CODE = "00000000-0000-4000-8000-000000000000";

/** Escenarios que con MH_2_0 quedan BLOCKED (contingencia 2.0: INC-005 + R20-PEND-01). */
export const MH20_BLOCKED_SCENARIOS: readonly MhTestScenarioCode[] = ["CONT01_FE", "CONT03_CCFE"];

/**
 * MH20 (Fase 8) — opciones de builder 2.0 para un escenario: territorios
 * proyectados con la proyección canónica pura (misma fuente que siembra
 * Municipality). Perfil 1.2 → {} (salida histórica byte a byte).
 */
export function mhTestBuildOptionsForProfile(
  ctx: MhTestBuildContext,
  scenario: MhTestScenarioCode,
  profile: DteSpecProfile,
): { ok: true; options: DteBuildProfileOptions } | { ok: false; error: string } {
  if (profile !== "MH_2_0") return { ok: true, options: {} };
  const project = (role: string, dept: string | null | undefined, mun: string | null | undefined) => {
    const p = previewMhTerritory({ deptCode: dept, municipalityCode: mun }, "MH_2_0");
    if (p.status === "OK") return { ok: true as const, territory: p.territory };
    if (p.status === "NO_ADDRESS") return { ok: true as const, territory: null };
    return { ok: false as const, error: `${role}: ${p.message}` };
  };
  const e = project("Emisor", ctx.issuer.dept_code, ctx.issuer.municipality_code);
  if (!e.ok) return e;
  if (!e.territory) return { ok: false, error: "Emisor: sin dirección para MH 2.0." };
  const kind = MH_TEST_SCENARIOS[scenario].receptor;
  const r = ctx.receptors;
  const addr =
    kind === "identified" ? r.identified :
    kind === "taxpayer"   ? r.taxpayer :
    kind === "excluded"   ? r.excludedSubject : null;
  const rr = addr ? project("Receptor", addr.deptCode, addr.municipalityCode) : { ok: true as const, territory: null };
  if (!rr.ok) return rr;
  return { ok: true, options: { profile: "MH_2_0", territories: { emisor: e.territory, receptor: rr.territory } } };
}

/**
 * Dry-run: arma cada escenario con un número de control/código de
 * marcador y valida contra el schema oficial MH. NO reserva correlativos
 * ni escribe nada.
 */
export function dryRunMhTestScenarios(
  ctx:         MhTestBuildContext,
  scenarios:   ReadonlySet<MhTestScenarioCode>,
  contingency: MhTestContingencySettings | null,
  now:         Date,
  // MH20 (Fase 8): perfil de la corrida; el schema oficial se elige por la
  // versión del propio JSON (v1/v3 → 1.2, v2/v4 → 2.0).
  profile:     DteSpecProfile = "MH_1_2",
): string[] {
  const errors: string[] = [];
  for (const scenario of scenarios) {
    const def = MH_TEST_SCENARIOS[scenario];
    if (scenario === "NC05_SOBRE_CCFE") continue;
    if (profile === "MH_2_0" && MH20_BLOCKED_SCENARIOS.includes(scenario)) {
      errors.push(`${def.label}: bloqueado con MH 2.0 (INC-005 / R20-PEND-01).`);
      continue;
    }
    const opts = mhTestBuildOptionsForProfile(ctx, scenario, profile);
    if (!opts.ok) { errors.push(`${def.label}: ${opts.error}`); continue; }
    const doc: MhTestDocumentIdentity = {
      control_number:         buildControlNumber({ dte_type_code: def.dteTypeCode, cod_estable_mh: ctx.issuer.cod_estable_mh, cod_punto_venta_mh: ctx.issuer.cod_punto_venta_mh, sequence: 1 }),
      generation_code:        MH_TEST_PLACEHOLDER_GENERATION_CODE,
      transmission_type_code: def.contingency ? "2" : "1",
      contingency_type_code:  def.contingency ? contingency?.contingencyTypeCode ?? null : null,
      contingency_reason:     def.contingency ? contingency?.reason ?? null : null,
    };
    const built = buildMhTestScenarioJson(ctx, scenario, doc, 0, now, opts.options);
    if (!built.ok) {
      errors.push(`${def.label}: ${built.error}`);
      continue;
    }
    const check = validateDteJsonAgainstOfficialSchema(def.dteTypeCode, built.json);
    if (!check.ok) {
      const detail = (check.validation_errors ?? []).slice(0, 5).map((e) => `${e.path} ${e.message}`).join("; ");
      errors.push(`${def.label}: ${check.error}${detail ? ` (${detail})` : ""}`);
    }
  }
  return errors;
}
