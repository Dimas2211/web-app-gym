// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fex-json.service.ts
//
// generateFexJsonForSale — construye (sin persistir) el json_document
// para Factura de Exportación Electrónica (FEX 11), schema oficial v3
// (schemas/mh/fex-11-v3.schema.json = fe-fex-v3.json, factura.gob.sv
// 2026-08-11). FEX-PROD-0B migró este builder desde v1; no existe un
// builder v1 paralelo. Ver docs/modules/fex11-production-readiness.md.
//
// Esta función:
//   - NO escribe en base de datos.
//   - NO actualiza DteOutgoingDocument.
//   - NO cambia el estado de la venta.
//   - NO reserva correlativos ni genera codigoGeneracion/numeroControl.
//   - NO firma ni transmite.
//   - Solo lee y devuelve el JSON candidato.
//
// Decisiones de mapeo v3 (fuentes: schema v3 + Manual Funcional V2.0 +
// Catálogos v1.2; detalle en fex11-production-readiness.md §16):
//   - receptor.codPais = CAT-020 vigente (ISO alpha-2, modelo `Country`,
//     idéntico a los 249 códigos del catálogo v1.2). Un country_code legado
//     (p. ej. "9540" del catálogo de compatibilidad FEX v1) bloquea la
//     emisión: nunca se convierte automáticamente.
//   - emisor.direccion.distrito = Municipality.district_code (CSV oficial
//     CAT-013 municipios/distritos) del par (dept_code, municipality_code)
//     del emisor. municipio sigue siendo Municipality.code.
//   - emisor.tipoRegimen: sin catálogo oficial publicado. Exportación de
//     servicios (tipoItemExpor=2) → null, igual que recintoFiscal/regimen.
//     Exportación de bienes (1/3) → bloqueada hasta confirmar la fuente.
//   - cuerpo: tipoItem CAT-011 desde product_type_snapshot (mismo mapeo
//     que FE/CCFE ya aceptados por MH); numeroDocumento = null (no hay
//     documentoRelacionado); codTributo = null (Manual §XIV: solo ítems
//     tipoItem 4 "otros tributos"); tributos = ["C3"].
//   - resumen: descuGravada = 0 (Zolvi no maneja descuento global FEX);
//     totalDescu = Σ montoDescu; tributos = [C3 valor 0] (Manual §XIV);
//     totalNoOnerosas = 0; saldoFavor = 0. Fórmulas en fex11-v3-formulas.ts.
//   - documentoRelacionado, compraTercero, ventaTercero, otrosDocumentos,
//     apendice = null (propiedades requeridas y nullable en v3).
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { numeroALetras } from "../utils/numero-a-letras";
import { normalizeNitForDte, normalizeNrcForDte } from "../utils/fiscal-id.utils";
import { resolveDteMunicipality, validateDteAddressCodes } from "../utils/dte-territory.resolver";
import { FEX11_SCHEMA_VERSION } from "../utils/fex11-schema-version";
import { computeFexV3ResumenTotals, r2 } from "../utils/fex11-v3-formulas";
import { FEX_V3_LIMITS, FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR } from "../utils/fex11-v3-rules";
import type {
  FexJsonDocument,
  FexCuerpoItem,
  FexPago,
  FexResumenTributo,
} from "../types/fex-json.types";

const TOLERANCE = 0.01;

// numeroControl v3: DTE-11-(M|B|S|P)NNNPNNN-NNNNNNNNNNNNNNN
const FEX_V3_NUMERO_CONTROL = /^DTE-11-(M|B|S|P)[0-9]{3}P[0-9]{3}-[0-9]{15}$/;

// CAT-015 v1.2 — descripción oficial del tributo C3.
const C3_TRIBUTO: FexResumenTributo = {
  codigo:      "C3",
  descripcion: "Impuesto al Valor Agregado (exportaciones) 0%",
  valor:       0,
};

// ── Tipos de entrada para la función pura ──────────────────────────
// Reflejan exactamente los campos que buildFexJsonFromLoadedData lee de
// los `select` de Prisma en generateFexJsonForSale, para poder probar el
// builder con un fixture in-memory sin PrismaClient real.

export interface FexLoadedCustomer {
  id:                   string;
  name:                 string;
  legal_name:           string | null;
  id_type_code:         string | null;
  nit:                  string | null;
  dui:                  string | null;
  activity_name:        string | null;
  address_complement:   string | null;
  phone:                string | null;
  email:                string | null;
  is_foreign:           boolean;
  country_code:         string | null;
  country_name:         string | null;
  customer_person_type: string | null;
}

export interface FexLoadedExportDetails {
  tenant_id:            string;
  item_type_export:     number;
  fiscal_precinct_code: string | null;
  regime_code:          string | null;
  incoterm_code:        string | null;
  incoterm_desc:        string | null;
  insurance_amount:     number | string;
  freight_amount:       number | string;
}

export interface FexLoadedItem {
  line_number:           number;
  product_code_snapshot: string | null;
  product_name_snapshot: string;
  product_type_snapshot: string | null;
  quantity:               number | string;
  unit_price:             number | string;
  discount_amount:        number | string;
  tax_rate_snapshot:      number | string | null;
  line_subtotal:          number | string;
  line_total:             number | string;
  product: {
    unit: { mh_unit_code: string | null };
  };
}

export interface FexLoadedPayment {
  mh_payment_form_code: string | null;
  amount:               number | string;
  reference:            string | null;
}

export interface FexLoadedSale {
  status:                   string;
  inventory_moved:          boolean;
  customer_id:              string | null;
  primary_dte_type_code:    string | null;
  condition_operation_code: string | null;
  payment_method_code:      string | null;
  payment_term_code:        string | null;
  payment_term_value:       number | null;
  total_amount:             number | string;
  notes:                    string | null;
  customer:                 FexLoadedCustomer | null;
  export_details:           FexLoadedExportDetails | null;
  items:                    FexLoadedItem[];
  payments:                 FexLoadedPayment[];
}

export interface FexLoadedIssuerConfig {
  nit:                      string | null;
  nrc:                      string | null;
  name:                     string;
  legal_name:               string | null;
  activity_code:            string | null;
  activity_name:            string | null;
  establishment_code:       string | null;
  point_of_sale_code:       string | null;
  dept_code:                string | null;
  municipality_code:        string | null;
  address_complement:       string | null;
  phone:                    string | null;
  email:                    string | null;
  environment:              string;
}

export interface FexLoadedData {
  tenant_id:    string;
  dteDoc:       { control_number: string; generation_code: string };
  sale:         FexLoadedSale;
  issuerConfig: FexLoadedIssuerConfig;
  // Resueltos por generateFexJsonForSale contra catálogos del sistema:
  // Municipality.district_code del emisor y fila CAT-020 (Country) del
  // country_code del receptor (null si no existe/activo en CAT-020).
  emisorDistrictCode: string | null;
  receptorCountry:    { code: string; name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────

// America/El_Salvador = UTC-6, sin DST.
function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

function mapAmbiente(env: string): string {
  return env === "PRODUCTION" ? "01" : "00";
}

// CAT-011 — mismo mapeo que FE/CCFE: SERVICE → 2 (Servicios), resto → 1 (Bienes).
function mapTipoItem(productTypeSnapshot: string | null): number {
  return productTypeSnapshot === "SERVICE" ? 2 : 1;
}

function blankToNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

const VALID_RECEPTOR_ID_TYPES = new Set(["36", "13", "02", "03", "37"]);

// ── Tipo de resultado público ─────────────────────────────────────

export type GenerateFexJsonResult =
  | { ok: true; json: FexJsonDocument }
  | { ok: false; error: string };

// ── Función principal ─────────────────────────────────────────────

export async function generateFexJsonForSale(
  params: {
    tenant_id:        string;
    location_id:      string;
    dte_document_id:  string;
  },
  db: PrismaClient = prisma,
): Promise<GenerateFexJsonResult> {
  const { tenant_id, location_id, dte_document_id } = params;

  // ── 1. Cargar DteOutgoingDocument ────────────────────────────────
  const dteDoc = await db.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id, location_id },
    select: {
      id:               true,
      dte_type_code:    true,
      generation_code:  true,
      control_number:   true,
      environment:      true,
      sale_id:          true,
      issuer_config_id: true,
    },
  });

  if (!dteDoc) {
    return { ok: false, error: "El documento DTE no existe o no pertenece a la location activa." };
  }

  // ── 2. Validar tipo: solo FEX 11 ─────────────────────────────────
  if (dteDoc.dte_type_code !== "11") {
    return {
      ok:    false,
      error: `Este builder solo genera JSON para Factura de Exportación (11). El documento es tipo "${dteDoc.dte_type_code}".`,
    };
  }

  // ── 3. Validar identidad fiscal reservada ────────────────────────
  if (!dteDoc.generation_code) {
    return { ok: false, error: "El documento DTE no tiene codigoGeneracion asignado. Datos internos inconsistentes." };
  }
  if (!dteDoc.control_number) {
    return { ok: false, error: "El documento DTE no tiene numeroControl asignado. Datos internos inconsistentes." };
  }
  if (!dteDoc.issuer_config_id) {
    return { ok: false, error: "El documento DTE no tiene configuración de emisor vinculada." };
  }
  if (!dteDoc.sale_id) {
    return { ok: false, error: "El documento DTE no está asociado a ninguna venta." };
  }

  // ── 4. Cargar venta completa ──────────────────────────────────────
  const sale = await db.sale.findFirst({
    where: { id: dteDoc.sale_id, tenant_id, location_id },
    select: {
      id:                       true,
      location_id:              true,
      status:                   true,
      inventory_moved:          true,
      customer_id:              true,
      primary_dte_type_code:    true,
      condition_operation_code: true,
      payment_method_code:      true,
      payment_term_code:        true,
      payment_term_value:       true,
      total_amount:             true,
      notes:                    true,
      customer: {
        select: {
          id:                   true,
          name:                 true,
          legal_name:           true,
          id_type_code:         true,
          nit:                  true,
          dui:                  true,
          activity_name:        true,
          address_complement:   true,
          phone:                true,
          email:                true,
          is_foreign:           true,
          country_code:         true,
          country_name:         true,
          customer_person_type: true,
        },
      },
      export_details: {
        select: {
          tenant_id:            true,
          item_type_export:     true,
          fiscal_precinct_code: true,
          regime_code:          true,
          incoterm_code:        true,
          incoterm_desc:        true,
          insurance_amount:     true,
          freight_amount:       true,
        },
      },
      items: {
        orderBy: { line_number: "asc" },
        select: {
          line_number:           true,
          product_code_snapshot: true,
          product_name_snapshot: true,
          product_type_snapshot: true,
          quantity:              true,
          unit_price:            true,
          discount_amount:       true,
          tax_rate_snapshot:     true,
          line_subtotal:         true,
          line_total:            true,
          product: {
            select: {
              unit: { select: { mh_unit_code: true } },
            },
          },
        },
      },
      payments: {
        select: {
          mh_payment_form_code: true,
          amount:               true,
          reference:            true,
        },
      },
    },
  });

  if (!sale) {
    return { ok: false, error: "La venta asociada al DTE no existe o no pertenece a la location activa." };
  }

  const issuerConfig = await db.dteIssuerConfig.findFirst({
    where: { id: dteDoc.issuer_config_id, tenant_id, location_id },
    select: {
      nit:                true,
      nrc:                true,
      name:               true,
      legal_name:         true,
      activity_code:      true,
      activity_name:      true,
      establishment_code: true,
      point_of_sale_code: true,
      dept_code:          true,
      municipality_code:  true,
      address_complement: true,
      phone:              true,
      email:              true,
      environment:        true,
    },
  });

  if (!issuerConfig) {
    return { ok: false, error: "La configuración DTE del emisor no existe o no pertenece a esta location." };
  }
  // FEX-PROD-1: identificacion.ambiente sale del emisor — debe coincidir
  // con el ambiente del documento (sin mezcla TEST/PRODUCTION).
  if (issuerConfig.environment !== dteDoc.environment) {
    return { ok: false, error: "El ambiente del emisor no coincide con el ambiente del documento DTE." };
  }

  // ── Validación territorial del emisor (resolver único) ───────────
  // FEX 11 no incluye dirección en el receptor (extranjero, usa
  // codPais/nombrePais) — solo el emisor requiere esta validación.
  const emisorAddrCheck = await validateDteAddressCodes({
    role:             "emisor",
    deptCode:         issuerConfig.dept_code,
    municipalityCode: issuerConfig.municipality_code,
  }, db);
  if (!emisorAddrCheck.ok) return { ok: false, error: emisorAddrCheck.error };

  // Distrito v3: del mismo registro Municipality del emisor.
  const emisorTerritory = await resolveDteMunicipality({
    deptCode:         issuerConfig.dept_code,
    municipalityCode: issuerConfig.municipality_code,
  }, db);

  // País del receptor: CAT-020 vigente (modelo Country). Solo se busca
  // por el código tal como está guardado — sin normalización ni mapeo.
  const countryCode = sale.customer?.country_code ?? null;
  const receptorCountry = countryCode
    ? await db.country.findFirst({
        where:  { code: countryCode, status: "active" },
        select: { code: true, name: true },
      })
    : null;

  return buildFexJsonFromLoadedData({
    tenant_id,
    dteDoc: {
      control_number:  dteDoc.control_number,
      generation_code: dteDoc.generation_code,
    },
    sale:               sale as unknown as FexLoadedSale,
    issuerConfig:       issuerConfig as unknown as FexLoadedIssuerConfig,
    emisorDistrictCode: emisorTerritory?.districtCode ?? null,
    receptorCountry:    receptorCountry ?? null,
  });
}

// ── Función pura ───────────────────────────────────────────────────
// Construye el json_document FEX 11 v3 a partir de datos ya cargados.
// No accede a Prisma ni a ningún recurso externo.

export function buildFexJsonFromLoadedData(loaded: FexLoadedData): GenerateFexJsonResult {
  const { tenant_id, dteDoc, sale, issuerConfig, emisorDistrictCode, receptorCountry } = loaded;

  // ── 5. Validar precondiciones de la venta ─────────────────────────
  if (sale.primary_dte_type_code !== "11") {
    return { ok: false, error: "La venta no tiene tipo de DTE principal 11 (Factura de Exportación)." };
  }
  if (sale.status !== "CONFIRMED") {
    return { ok: false, error: "Solo se puede generar JSON DTE para ventas confirmadas." };
  }
  if (!sale.inventory_moved) {
    return { ok: false, error: "La venta aún no ha aplicado inventario. Aplica el inventario primero." };
  }
  if (sale.items.length === 0) {
    return { ok: false, error: "La venta no tiene líneas de detalle. No se puede generar DTE sin productos." };
  }
  if (!FEX_V3_NUMERO_CONTROL.test(dteDoc.control_number)) {
    return {
      ok:    false,
      error: `El número de control "${dteDoc.control_number}" no cumple el formato de Factura de Exportación ` +
             `(DTE-11-M001P001-000000000000001). Revise cod_estable_mh/cod_punto_venta_mh del emisor.`,
    };
  }

  const totalAmount = Number(sale.total_amount);
  if (totalAmount <= 0) {
    return { ok: false, error: "El total de la venta debe ser mayor a cero para generar el DTE." };
  }

  // ── 6. Validar cliente extranjero ──────────────────────────────────
  if (!sale.customer_id || !sale.customer) {
    return { ok: false, error: "Para FEX 11 se requiere un cliente asignado a la venta." };
  }

  const c = sale.customer;
  const missingCustomerFields: string[] = [];

  if (!c.is_foreign)                missingCustomerFields.push("marcado como cliente extranjero (is_foreign)");
  if (!c.country_code)              missingCustomerFields.push("código de país (country_code)");
  if (!c.name)                      missingCustomerFields.push("nombre");
  if (!c.id_type_code || !VALID_RECEPTOR_ID_TYPES.has(c.id_type_code)) {
    missingCustomerFields.push("tipo de documento de identificación válido (36, 13, 02, 03 o 37)");
  }
  if (!c.address_complement?.trim()) missingCustomerFields.push("complemento de dirección");
  if (!c.activity_name?.trim())      missingCustomerFields.push("descripción de actividad económica");
  if (c.customer_person_type !== "1" && c.customer_person_type !== "2") {
    missingCustomerFields.push("tipo de persona (1=jurídica, 2=natural)");
  }

  if (missingCustomerFields.length > 0) {
    return {
      ok:    false,
      error: `El cliente no está completo para emitir FEX 11. Campos faltantes o inválidos: ${missingCustomerFields.join(", ")}.`,
    };
  }

  // País: debe existir en CAT-020 vigente. Un código legado (numérico del
  // catálogo de compatibilidad FEX v1) no se convierte: se corrige el
  // cliente explícitamente.
  if (!receptorCountry) {
    return {
      ok:    false,
      error: /^[0-9]+$/.test(c.country_code!)
        ? `El país del cliente ("${c.country_code}") usa un código de la versión anterior de la Factura de ` +
          `Exportación. Actualice el país del cliente con el catálogo de países vigente (CAT-020) antes de emitir.`
        : `El país del cliente ("${c.country_code}") no existe en el catálogo de países vigente (CAT-020).`,
    };
  }
  if (receptorCountry.code === "SV") {
    return { ok: false, error: "El país destino de una Factura de Exportación no puede ser El Salvador." };
  }

  const numDoc = c.id_type_code === "36"
    ? normalizeNitForDte(c.nit)
    : (c.id_type_code === "13" ? c.dui : (c.dui ?? c.nit));

  if (!numDoc) {
    return { ok: false, error: "El cliente no tiene número de documento (NIT/DUI) para el tipo de documento configurado." };
  }

  const receptorComplement = c.address_complement!.trim();
  const receptorActivity   = c.activity_name!.trim();
  const receptorPhone      = blankToNull(c.phone);
  const receptorEmail      = blankToNull(c.email);
  const receptorErrors: string[] = [];
  if (receptorComplement.length > FEX_V3_LIMITS.receptorComplementMax) {
    receptorErrors.push(`el complemento de dirección tiene ${receptorComplement.length} caracteres (máximo ${FEX_V3_LIMITS.receptorComplementMax})`);
  }
  if (receptorActivity.length < FEX_V3_LIMITS.receptorActivityMin || receptorActivity.length > FEX_V3_LIMITS.receptorActivityMax) {
    receptorErrors.push(`la actividad económica debe tener entre ${FEX_V3_LIMITS.receptorActivityMin} y ${FEX_V3_LIMITS.receptorActivityMax} caracteres`);
  }
  if (numDoc.length > FEX_V3_LIMITS.receptorDocumentMax) {
    receptorErrors.push(`el número de documento excede ${FEX_V3_LIMITS.receptorDocumentMax} caracteres`);
  }
  if (receptorPhone && (receptorPhone.length < FEX_V3_LIMITS.phoneMin || receptorPhone.length > FEX_V3_LIMITS.phoneMax)) {
    receptorErrors.push(`el teléfono debe tener entre ${FEX_V3_LIMITS.phoneMin} y ${FEX_V3_LIMITS.phoneMax} caracteres`);
  }
  if (receptorEmail && (receptorEmail.length < FEX_V3_LIMITS.emailMin || receptorEmail.length > FEX_V3_LIMITS.emailMax)) {
    receptorErrors.push(`el correo debe tener entre ${FEX_V3_LIMITS.emailMin} y ${FEX_V3_LIMITS.emailMax} caracteres`);
  }
  if (receptorErrors.length > 0) {
    return { ok: false, error: `Datos del cliente no válidos para la Factura de Exportación: ${receptorErrors.join("; ")}.` };
  }

  // ── 7. Validar SaleExportDetails ──────────────────────────────────
  const exportDetails = sale.export_details;
  if (!exportDetails) {
    return { ok: false, error: "La venta no tiene detalle de exportación (SaleExportDetails) registrado." };
  }
  if (exportDetails.tenant_id !== tenant_id) {
    return { ok: false, error: "El detalle de exportación de la venta no pertenece al tenant activo." };
  }
  if (![1, 2, 3].includes(exportDetails.item_type_export)) {
    return { ok: false, error: "El tipo de ítem de exportación (item_type_export) debe ser 1 (bienes), 2 (servicios) o 3 (ambos)." };
  }
  if (exportDetails.item_type_export !== 2) {
    // emisor.tipoRegimen es requerido por el schema v3, pero ningún
    // catálogo oficial vigente (Catálogos v1.2, Manual Funcional V2.0)
    // define sus valores. No se infiere desde CAT-028 ni se inventa.
    return { ok: false, error: FEX_GOODS_TIPO_REGIMEN_BLOCKED_ERROR };
  }
  if (exportDetails.fiscal_precinct_code || exportDetails.regime_code) {
    return { ok: false, error: "Para exportación de servicios (item_type_export=2), recinto fiscal y régimen deben quedar vacíos." };
  }

  const insuranceAmount = Number(exportDetails.insurance_amount);
  const freightAmount   = Number(exportDetails.freight_amount);
  if (insuranceAmount < 0 || freightAmount < 0) {
    return { ok: false, error: "Seguro y flete no pueden ser negativos." };
  }

  const descIncoterms = blankToNull(exportDetails.incoterm_desc);
  if (descIncoterms && descIncoterms.length > FEX_V3_LIMITS.descIncotermsMax) {
    return { ok: false, error: `La descripción INCOTERMS excede ${FEX_V3_LIMITS.descIncotermsMax} caracteres.` };
  }
  const observaciones = blankToNull(sale.notes);
  if (observaciones && observaciones.length > FEX_V3_LIMITS.observacionesMax) {
    return { ok: false, error: `Las observaciones exceden ${FEX_V3_LIMITS.observacionesMax} caracteres.` };
  }

  // ── 8. Validar configuración del emisor (ya cargada por el caller) ─
  const missingIssuerFields: string[] = [];
  if (!issuerConfig.nit)                 missingIssuerFields.push("NIT");
  if (!issuerConfig.nrc)                 missingIssuerFields.push("NRC");
  if (!issuerConfig.name)                missingIssuerFields.push("nombre");
  if (!issuerConfig.activity_code)       missingIssuerFields.push("código de actividad económica");
  if (!issuerConfig.activity_name)       missingIssuerFields.push("descripción de actividad económica");
  if (!issuerConfig.dept_code)           missingIssuerFields.push("departamento");
  if (!issuerConfig.municipality_code)   missingIssuerFields.push("municipio");
  if (!emisorDistrictCode)               missingIssuerFields.push("distrito (código de distrito del municipio configurado)");
  if (!issuerConfig.address_complement)  missingIssuerFields.push("complemento de dirección");
  if (!issuerConfig.phone)               missingIssuerFields.push("teléfono");
  if (!issuerConfig.email)               missingIssuerFields.push("correo electrónico");

  if (missingIssuerFields.length > 0) {
    return {
      ok:    false,
      error: `La configuración del emisor no está completa para FEX 11. Campos faltantes: ${missingIssuerFields.join(", ")}.`,
    };
  }

  const issuerErrors: string[] = [];
  if (issuerConfig.address_complement!.length > FEX_V3_LIMITS.emisorComplementMax) {
    issuerErrors.push(`complemento de dirección excede ${FEX_V3_LIMITS.emisorComplementMax} caracteres`);
  }
  if (issuerConfig.phone!.length < FEX_V3_LIMITS.phoneMin || issuerConfig.phone!.length > FEX_V3_LIMITS.phoneMax) {
    issuerErrors.push(`teléfono debe tener entre ${FEX_V3_LIMITS.phoneMin} y ${FEX_V3_LIMITS.phoneMax} caracteres`);
  }
  if (issuerErrors.length > 0) {
    return { ok: false, error: `La configuración del emisor no es válida para FEX 11: ${issuerErrors.join("; ")}.` };
  }

  // ── 9. Validar totales internos ───────────────────────────────────
  const sumLineTotal = sale.items.reduce((s, i) => s + Number(i.line_total), 0);
  if (Math.abs(r2(sumLineTotal) - r2(totalAmount)) > TOLERANCE) {
    return {
      ok:    false,
      error: `Inconsistencia de totales: suma de líneas (${r2(sumLineTotal)}) difiere del total_amount (${r2(totalAmount)}) en más de ${TOLERANCE}.`,
    };
  }

  // ── 10. Construir cuerpoDocumento ─────────────────────────────────

  const lineErrors: string[] = [];

  const cuerpoDocumento: FexCuerpoItem[] = sale.items.map((item) => {
    const n   = item.line_number;
    const qty = Number(item.quantity);
    if (qty <= 0) lineErrors.push(`línea ${n}: cantidad inválida (debe ser mayor a cero)`);

    const mhUnitCode = item.product.unit.mh_unit_code;
    if (!mhUnitCode || !Number.isInteger(Number(mhUnitCode))) {
      lineErrors.push(`línea ${n}: la unidad de medida no tiene código MH configurado (UnitOfMeasure.mh_unit_code)`);
    }

    // Exportación gravada al 0% (C3): la línea no puede traer IVA.
    if (Number(item.tax_rate_snapshot ?? 0) !== 0) {
      lineErrors.push(`línea ${n}: la exportación se factura al 0% (C3) y la línea tiene tasa ${Number(item.tax_rate_snapshot)}%`);
    }

    const codigo = blankToNull(item.product_code_snapshot);
    if (codigo && codigo.length > FEX_V3_LIMITS.itemCodeMax) {
      lineErrors.push(`línea ${n}: el código de producto "${codigo}" tiene ${codigo.length} caracteres (máximo ${FEX_V3_LIMITS.itemCodeMax})`);
    }
    if (item.product_name_snapshot.length > FEX_V3_LIMITS.itemDescriptionMax) {
      lineErrors.push(`línea ${n}: la descripción excede ${FEX_V3_LIMITS.itemDescriptionMax} caracteres`);
    }

    const tipoItem = mapTipoItem(item.product_type_snapshot);
    if (exportDetails.item_type_export === 2 && tipoItem !== 2) {
      lineErrors.push(`línea ${n}: "${item.product_name_snapshot}" es un bien y la exportación está declarada como servicios`);
    }

    // line_subtotal es la base gravada persistida (precio×cantidad − descuento).
    const ventaGravada = r2(Number(item.line_subtotal));
    if (ventaGravada <= 0) {
      // Una línea sin valor sería una transferencia no onerosa, que Zolvi
      // no modela (resumen.totalNoOnerosas se emite en 0).
      lineErrors.push(`línea ${n}: el valor de venta debe ser mayor a cero`);
    }

    return {
      numItem:         n,
      tipoItem,
      numeroDocumento: null,
      cantidad:        qty,
      codigo,
      codTributo:      null,
      uniMedida:       mhUnitCode ? Number(mhUnitCode) : 0,
      descripcion:     item.product_name_snapshot,
      precioUni:       r2(Number(item.unit_price)),
      montoDescu:      r2(Number(item.discount_amount)),
      ventaGravada,
      tributos:        ["C3"],
      noGravado:       0,
    };
  });

  if (lineErrors.length > 0) {
    return { ok: false, error: `Líneas no válidas para la Factura de Exportación: ${lineErrors.join("; ")}.` };
  }

  // ── 11. Calcular totales del resumen (fex11-v3-formulas.ts) ────────

  const seguro = r2(insuranceAmount);
  const flete  = r2(freightAmount);
  const resumenTributos: FexResumenTributo[] = [C3_TRIBUTO];

  const totals = computeFexV3ResumenTotals({
    lines:         cuerpoDocumento,
    seguro,
    flete,
    descuGravada:  0,
    tributosValor: resumenTributos.reduce((s, t) => s + t.valor, 0),
    saldoFavor:    0,
  });

  if (Math.abs(totals.totalGravada - r2(totalAmount)) > TOLERANCE) {
    return {
      ok:    false,
      error: `Inconsistencia de totales: total gravado (${totals.totalGravada}) difiere del total de la venta (${r2(totalAmount)}).`,
    };
  }

  // Regla de negocio Zolvi (heredada de v1; el schema v3 ya no la exige):
  // correo del receptor obligatorio si montoTotalOperacion >= 10000.
  if (totals.montoTotalOperacion >= 10000 && !receptorEmail) {
    return { ok: false, error: "El cliente debe tener correo electrónico configurado: el monto total de la operación (incluye seguro y flete) es igual o mayor a $10,000." };
  }

  // ── 12. Construir pagos ────────────────────────────────────────────

  let pagos: FexPago[];
  const validPayments = sale.payments.filter((p) => p.mh_payment_form_code);
  if (validPayments.length > 0) {
    const longRef = validPayments.find((p) => (p.reference?.length ?? 0) > FEX_V3_LIMITS.paymentReferenceMax);
    if (longRef) {
      return { ok: false, error: `La referencia de pago "${longRef.reference}" excede ${FEX_V3_LIMITS.paymentReferenceMax} caracteres.` };
    }
    pagos = validPayments.map((p) => ({
      codigo:     p.mh_payment_form_code!,
      montoPago:  r2(Number(p.amount)),
      referencia: blankToNull(p.reference),
      plazo:      null,
      periodo:    null,
    }));
  } else {
    const condicion = sale.condition_operation_code ?? "1";
    pagos = [{
      codigo:     sale.payment_method_code || "99",
      montoPago:  totals.totalPagar,
      referencia: null,
      plazo:      condicion === "2" ? (sale.payment_term_code ?? null) : null,
      periodo:    condicion === "2" ? (sale.payment_term_value ?? null) : null,
    }];
  }

  // ── 13. Construir receptor ─────────────────────────────────────────

  const receptor = {
    nombre:          c.name,
    tipoDocumento:   c.id_type_code!,
    numDocumento:    numDoc,
    nombreComercial: blankToNull(c.legal_name),
    codPais:         receptorCountry.code,
    nombrePais:      receptorCountry.name,
    complemento:     receptorComplement,
    tipoPersona:     Number(c.customer_person_type),
    descActividad:   receptorActivity,
    telefono:        receptorPhone,
    correo:          receptorEmail,
  };

  // ── 14. Construir identificacion ───────────────────────────────────

  const now = new Date();
  const { date: fecEmi, time: horEmi } = svDateTime(now);
  const condicion = sale.condition_operation_code
    ? parseInt(sale.condition_operation_code, 10) || 1
    : 1;

  const identificacion = {
    version:          FEX11_SCHEMA_VERSION,
    ambiente:         mapAmbiente(issuerConfig.environment),
    tipoDte:          "11" as const,
    numeroControl:    dteDoc.control_number,
    codigoGeneracion: dteDoc.generation_code,
    tipoModelo:       1,
    tipoOperacion:    1,
    tipoContingencia: null,
    motivoContin:     null,
    fecEmi,
    horEmi,
    tipoMoneda:       "USD" as const,
  };

  // ── 15. Construir emisor ────────────────────────────────────────────
  // Sin tipoEstablecimiento/codEstableMH/codPuntoVentaMH: v3 los eliminó
  // (siguen existiendo en DteIssuerConfig para FE/CCFE/NC/FSE).

  const emisor = {
    nit:             normalizeNitForDte(issuerConfig.nit)!,
    nrc:             normalizeNrcForDte(issuerConfig.nrc)!,
    nombre:          issuerConfig.name,
    codActividad:    issuerConfig.activity_code!,
    descActividad:   issuerConfig.activity_name!,
    nombreComercial: blankToNull(issuerConfig.legal_name),
    direccion: {
      departamento: issuerConfig.dept_code!,
      municipio:    issuerConfig.municipality_code!,
      distrito:     emisorDistrictCode!,
      complemento:  issuerConfig.address_complement!,
    },
    telefono:      issuerConfig.phone!,
    correo:        issuerConfig.email!,
    codEstable:    issuerConfig.establishment_code ?? null,
    codPuntoVenta: issuerConfig.point_of_sale_code ?? null,
    tipoItemExpor: exportDetails.item_type_export,
    recintoFiscal: null,
    tipoRegimen:   null,
    regimen:       null,
  };

  // ── 16. Construir resumen ────────────────────────────────────────────

  const resumen = {
    totalGravada:        totals.totalGravada,
    descuGravada:        totals.descuGravada,
    porcentajeDescuento: 0,
    totalDescu:          totals.totalDescu,
    seguro,
    flete,
    tributos:            resumenTributos,
    montoTotalOperacion: totals.montoTotalOperacion,
    totalNoGravado:      totals.totalNoGravado,
    totalNoOnerosas:     0,
    totalPagar:          totals.totalPagar,
    totalLetras:         numeroALetras(totals.totalPagar),
    saldoFavor:          0,
    condicionOperacion:  condicion,
    pagos,
    codIncoterms:        blankToNull(exportDetails.incoterm_code),
    descIncoterms,
    numPagoElectronico:  null,
    observaciones,
  };

  // ── 17. Ensamblar json_document (sin persistir) ───────────────────
  const jsonDocument: FexJsonDocument = {
    identificacion,
    documentoRelacionado: null,
    emisor,
    receptor,
    otrosDocumentos:      null,
    ventaTercero:         null,
    compraTercero:        null,
    cuerpoDocumento,
    resumen,
    apendice:             null,
  };

  return { ok: true, json: jsonDocument };
}
