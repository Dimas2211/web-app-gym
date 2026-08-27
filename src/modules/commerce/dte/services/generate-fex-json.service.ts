// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fex-json.service.ts
//
// generateFexJsonForSale — construye (sin persistir) el json_document
// para Factura de Exportación Electrónica (FEX 11).
//
// Microfase F3-C4 — builder aislado. A diferencia de generate-fe-json
// y generate-ccfe-json, esta función:
//   - NO escribe en base de datos.
//   - NO actualiza DteOutgoingDocument.
//   - NO cambia el estado de la venta.
//   - NO reserva correlativos ni genera codigoGeneracion/numeroControl.
//   - NO firma ni transmite.
//   - Solo lee y devuelve el JSON candidato.
//
// El DteOutgoingDocument debe existir previamente con
// codigoGeneracion/numeroControl ya reservados (mismo patrón que
// dte-outgoing.service.ts usa para FE/CCFE al crear el documento).
//
// Decisiones de mapeo documentadas (ver docs/modules/fex11-data-contract.md):
//   - receptor.codPais/nombrePais se toman de Customer.country_code/
//     country_name (matriz §6 del contrato) — SaleExportDetails también
//     tiene country_code/country_name, pero el contrato designa a
//     Customer como fuente para el receptor.
//   - emisor.codEstableMH/codPuntoVentaMH usan los códigos reales
//     asignados por MH (DteIssuerConfig.cod_estable_mh/cod_punto_venta_mh),
//     no los códigos internos (establishment_code/point_of_sale_code)
//     que FE/CCFE reutilizan para ambos pares — el schema FEX exige
//     los 4 campos y estos son los que representan semánticamente
//     "asignado por el MH".
//   - Toda línea de exportación se asume gravada al 0% (tributo fijo
//     "C3"), con noGravado = 0. TODO FEX FORMULA REVIEW: no hay
//     confirmación de negocio para escenarios con noGravado != 0.
//   - resumen.descuento y resumen.totalDescu se calculan igual (suma de
//     montoDescu de líneas). TODO FEX FORMULA REVIEW: el contrato
//     (§10) marca como no confirmada la diferencia semántica entre
//     ambos campos.
//   - resumen.montoTotalOperacion = total_amount de la venta (sin IVA,
//     ya que exportación es 0%) + seguro + flete de SaleExportDetails.
//   - resumen.totalPagar = montoTotalOperacion. TODO FEX FORMULA REVIEW:
//     el contrato (§10.8) marca como no confirmado si son conceptos
//     distintos.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import { numeroALetras } from "../utils/numero-a-letras";
import { normalizeNitForDte, normalizeNrcForDte } from "../utils/fiscal-id.utils";
import { validateDteAddressCodes } from "../utils/dte-territory.resolver";
import fexSchema from "../schemas/mh/fex-11.schema.json";
import type {
  FexJsonDocument,
  FexCuerpoItem,
  FexPago,
} from "../types/fex-json.types";

const TOLERANCE = 0.01;

// ── F3-C23C/F3-C23D — bloqueo por conflicto CAT-020 (ISO alpha-2) vs schema MH ──
//
// El catálogo oficial CAT-020 v1.2 (10/2025, database/catalogs/Catálogos
// del Sistema de Transmisión V 1.2.xlsx, hoja "CAT-020 País") usa códigos
// ISO 3166-1 alpha-2 ("US", "SV", ...) — catálogo central del sistema
// (modelo `Country`, ver get-countries.ts), vigente y sin cambios.
//
// El Ministerio publicó en julio 2026 schemas nuevos (FEX ahora aparece
// como v3, con receptor.codPais alineado a CAT-020 ISO). Esta versión NO
// migra a esos schemas nuevos — sigue operando sobre el schema local
// vigente `fex-11.schema.json` (copia de `fe-fex-v1.json`, FEX v1,
// fechado 03/2023), que define `receptor.codPais` como un enum cerrado de
// 275 códigos numéricos de 4 dígitos y NO acepta códigos alfabéticos. Es
// una contradicción real entre CAT-020 (fuente más reciente) y el schema
// v1 local (fuente más vieja) — ver
// docs/dte-official/extracts/fex11-catalogs-operational.md (§"F3-C23C"/"F3-C23D").
//
// F3-C23C bloqueaba aquí y dejaba FEX 11 sin forma de operar, porque la
// UI solo ofrecía CAT-020. F3-C23D restaura la operación agregando un
// catálogo de COMPATIBILIDAD separado para receptor.codPais de FEX v1
// (catalog_code "FEX-11-V1-CODPAIS", derivado de este mismo enum — ver
// prisma/seeds/data/fex11-catalog-rows.ts), que /dashboard/sales/export
// ahora usa en vez de CAT-020 para este campo mientras sigamos en v1. La
// guardia se mantiene sin cambios: sigue bloqueando cualquier
// `country_code` fuera de este enum (p. ej. si llegara "US" por datos
// heredados o un cliente creado antes de esta fase) — nunca convierte
// silenciosamente ISO → numérico.
const FEX_COD_PAIS_SCHEMA_ENUM = new Set<string>(
  (fexSchema as unknown as {
    properties: { receptor: { properties: { codPais: { enum: string[] } } } };
  }).properties.receptor.properties.codPais.enum,
);

// Detección best-effort de un código con "forma" ISO alpha-2 (2 letras),
// solo para dar un mensaje de error más claro cuando el valor bloqueado
// viene evidentemente de CAT-020 — no valida que exista en CAT-020 real.
const ISO_ALPHA2_LIKE = /^[A-Z]{2}$/;

// ── Tipos de entrada para la función pura ──────────────────────────
// Reflejan exactamente los campos que buildFexJsonFromLoadedData lee de
// los `select` de Prisma en generateFexJsonForSale. Se extraen aquí para
// permitir probar el builder con un objeto ya cargado (fixture), sin
// depender de PrismaClient real (Microfase F3-C6).

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
  establishment_type_code:  string | null;
  point_of_sale_code:       string | null;
  cod_estable_mh:           string | null;
  cod_punto_venta_mh:       string | null;
  dept_code:                string | null;
  municipality_code:        string | null;
  address_complement:       string | null;
  phone:                    string | null;
  email:                    string | null;
  environment:              string;
}

export interface FexLoadedData {
  tenant_id:      string;
  dteDoc:         { control_number: string; generation_code: string };
  sale:           FexLoadedSale;
  issuerConfig:   FexLoadedIssuerConfig;
}

// ── Helpers ───────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// America/El_Salvador = UTC-6, sin DST.
function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

function mapAmbiente(env: string): string {
  return env === "PRODUCTION" ? "01" : "00";
}

const VALID_RECEPTOR_ID_TYPES = new Set(["36", "13", "02", "03", "37"]);

// ── Tipo de resultado público ─────────────────────────────────────

export type GenerateFexJsonResult =
  | { ok: true; json: FexJsonDocument }
  | { ok: false; error: string };

// ── Función principal ─────────────────────────────────────────────

export async function generateFexJsonForSale(params: {
  tenant_id:        string;
  location_id:      string;
  dte_document_id:  string;
}): Promise<GenerateFexJsonResult> {
  const { tenant_id, location_id, dte_document_id } = params;

  // ── 1. Cargar DteOutgoingDocument ────────────────────────────────
  const dteDoc = await prisma.dteOutgoingDocument.findFirst({
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
  const sale = await prisma.sale.findFirst({
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

  const issuerConfig = await prisma.dteIssuerConfig.findFirst({
    where: { id: dteDoc.issuer_config_id, tenant_id, location_id },
    select: {
      nit:                true,
      nrc:                true,
      name:               true,
      legal_name:         true,
      activity_code:      true,
      activity_name:      true,
      establishment_code:      true,
      establishment_type_code: true,
      point_of_sale_code:      true,
      cod_estable_mh:          true,
      cod_punto_venta_mh:      true,
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

  // ── Validación territorial del emisor (resolver único) ───────────
  // FEX 11 no incluye dept/municipio en el receptor (extranjero, usa
  // codPais/nombrePais) — solo el emisor requiere esta validación.
  const emisorAddrCheck = await validateDteAddressCodes({
    role:             "emisor",
    deptCode:         issuerConfig.dept_code,
    municipalityCode: issuerConfig.municipality_code,
  });
  if (!emisorAddrCheck.ok) return { ok: false, error: emisorAddrCheck.error };

  return buildFexJsonFromLoadedData({
    tenant_id,
    dteDoc: {
      control_number:  dteDoc.control_number,
      generation_code: dteDoc.generation_code,
    },
    sale:         sale as unknown as FexLoadedSale,
    issuerConfig: issuerConfig as unknown as FexLoadedIssuerConfig,
  });
}

// ── Función pura ───────────────────────────────────────────────────
// Construye el json_document FEX 11 a partir de datos ya cargados.
// No accede a Prisma ni a ningún recurso externo — permite pruebas
// aisladas con un fixture in-memory (Microfase F3-C6).

export function buildFexJsonFromLoadedData(loaded: FexLoadedData): GenerateFexJsonResult {
  const { tenant_id, dteDoc, sale, issuerConfig } = loaded;

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
  if (!c.country_name)              missingCustomerFields.push("nombre de país (country_name)");
  if (!c.name)                      missingCustomerFields.push("nombre");
  if (!c.id_type_code || !VALID_RECEPTOR_ID_TYPES.has(c.id_type_code)) {
    missingCustomerFields.push("tipo de documento de identificación válido (36, 13, 02, 03 o 37)");
  }
  if (!c.address_complement)        missingCustomerFields.push("complemento de dirección");
  if (!c.activity_name)             missingCustomerFields.push("descripción de actividad económica");
  if (c.customer_person_type !== "1" && c.customer_person_type !== "2") {
    missingCustomerFields.push("tipo de persona (1=jurídica, 2=natural)");
  }

  if (missingCustomerFields.length > 0) {
    return {
      ok:    false,
      error: `El cliente no está completo para emitir FEX 11. Campos faltantes o inválidos: ${missingCustomerFields.join(", ")}.`,
    };
  }

  // F3-C23D — c.country_code debe venir del catálogo de compatibilidad
  // FEX v1 (FEX-11-V1-CODPAIS, códigos numéricos legados), no de CAT-020
  // (ISO alpha-2). Ver nota junto a FEX_COD_PAIS_SCHEMA_ENUM arriba.
  if (!FEX_COD_PAIS_SCHEMA_ENUM.has(c.country_code!)) {
    const isIsoAlpha2 = ISO_ALPHA2_LIKE.test(c.country_code!);
    return {
      ok: false,
      error: isIsoAlpha2
        ? `El país "${c.country_code}" pertenece al catálogo CAT-020 ISO actualizado, pero la ` +
          `versión actual de FEX 11 usa códigos numéricos compatibles con el schema v1 ` +
          `(catálogo de compatibilidad FEX-11-V1-CODPAIS, no CAT-020). Seleccione el país desde ` +
          `el catálogo FEX v1 en /dashboard/sales/export.`
        : `No se puede generar el JSON de FEX 11: el país del cliente ("${c.country_code}") ` +
          `no es compatible con el schema de validación MH vigente (fex-11.schema.json). ` +
          `Seleccione un país válido del catálogo de compatibilidad FEX v1 (FEX-11-V1-CODPAIS) ` +
          `— ver docs/dte-official/extracts/fex11-catalogs-operational.md (sección F3-C23D).`,
    };
  }

  const numDoc = c.id_type_code === "36"
    ? normalizeNitForDte(c.nit)
    : (c.id_type_code === "13" ? c.dui : (c.dui ?? c.nit));

  if (!numDoc) {
    return { ok: false, error: "El cliente no tiene número de documento (NIT/DUI) para el tipo de documento configurado." };
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
  if (exportDetails.item_type_export === 2) {
    if (exportDetails.fiscal_precinct_code || exportDetails.regime_code) {
      return { ok: false, error: "Para exportación de servicios (item_type_export=2), recinto fiscal y régimen deben quedar vacíos." };
    }
  } else if (!exportDetails.fiscal_precinct_code || !exportDetails.regime_code) {
    return { ok: false, error: "Para exportación de bienes, recinto fiscal y régimen son obligatorios." };
  }

  const insuranceAmount = Number(exportDetails.insurance_amount);
  const freightAmount   = Number(exportDetails.freight_amount);
  if (insuranceAmount < 0 || freightAmount < 0) {
    return { ok: false, error: "Seguro y flete no pueden ser negativos." };
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
  if (!issuerConfig.address_complement)  missingIssuerFields.push("complemento de dirección");
  if (!issuerConfig.phone)               missingIssuerFields.push("teléfono");
  if (!issuerConfig.email)               missingIssuerFields.push("correo electrónico");

  if (missingIssuerFields.length > 0) {
    return {
      ok:    false,
      error: `La configuración del emisor no está completa para FEX 11 (el schema exige dirección/teléfono/correo/NRC obligatorios). Campos faltantes: ${missingIssuerFields.join(", ")}.`,
    };
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

  const missingUnitLines: number[] = [];
  const invalidQtyLines: number[] = [];

  const cuerpoDocumento: FexCuerpoItem[] = sale.items.map((item) => {
    const qty = Number(item.quantity);
    if (qty <= 0) invalidQtyLines.push(item.line_number);

    const mhUnitCode = item.product.unit.mh_unit_code;
    if (!mhUnitCode || !Number.isInteger(Number(mhUnitCode))) {
      missingUnitLines.push(item.line_number);
    }

    // FEX asume exportación gravada al 0% (tributo C3) — precioUni/montoDescu
    // sin IVA. Si tax_rate_snapshot != 0, se extrae la base defensivamente
    // (mismo patrón que CCFE), aunque el negocio no ha confirmado ese caso.
    const taxRate    = Number(item.tax_rate_snapshot ?? 0);
    const hasIva     = taxRate > 0;
    const taxFactor  = hasIva ? 1 + taxRate / 100 : 1;

    const unitPriceWithIva = Number(item.unit_price);
    const descuWithIva     = Number(item.discount_amount);
    const precioUni = hasIva ? r2(unitPriceWithIva / taxFactor) : r2(unitPriceWithIva);
    const montoDescu = hasIva ? r2(descuWithIva / taxFactor) : r2(descuWithIva);

    // line_subtotal es la base gravada sin IVA persistida — fuente de verdad de ventaGravada.
    const ventaGravada = r2(Number(item.line_subtotal));

    return {
      numItem:      item.line_number,
      cantidad:     qty,
      codigo:       item.product_code_snapshot ?? null,
      uniMedida:    mhUnitCode ? Number(mhUnitCode) : 0,
      descripcion:  item.product_name_snapshot,
      precioUni,
      montoDescu,
      ventaGravada,
      tributos:     ["C3"],
      noGravado:    0, // TODO FEX FORMULA REVIEW: sin confirmación de negocio para cargos/abonos no gravados
    };
  });

  if (invalidQtyLines.length > 0) {
    return { ok: false, error: `Las líneas ${invalidQtyLines.join(", ")} tienen cantidad inválida (debe ser mayor a cero).` };
  }
  if (missingUnitLines.length > 0) {
    return {
      ok:    false,
      error: `Las líneas ${missingUnitLines.join(", ")} usan una unidad de medida sin código MH configurado (UnitOfMeasure.mh_unit_code).`,
    };
  }

  // ── 11. Calcular totales del resumen ──────────────────────────────

  const totalGravada  = r2(cuerpoDocumento.reduce((s, i) => s + i.ventaGravada, 0));
  const totalDescuento = r2(cuerpoDocumento.reduce((s, i) => s + i.montoDescu, 0));
  const totalNoGravado = r2(cuerpoDocumento.reduce((s, i) => s + i.noGravado, 0));

  const seguro = r2(insuranceAmount);
  const flete  = r2(freightAmount);

  // montoTotalOperacion = total de la venta (sin IVA, exportación 0%) + seguro + flete.
  const montoTotalOperacion = r2(totalAmount + seguro + flete);
  const totalPagar          = montoTotalOperacion; // TODO FEX FORMULA REVIEW: ver contrato §10.8

  // Regla condicional del schema (allOf raíz): correo obligatorio si
  // resumen.montoTotalOperacion >= 10000 (no basta con validar total_amount,
  // ya que montoTotalOperacion suma seguro + flete).
  if (montoTotalOperacion >= 10000 && !c.email) {
    return { ok: false, error: "El cliente debe tener correo electrónico configurado: el monto total de la operación (incluye seguro y flete) es igual o mayor a $10,000." };
  }

  // ── 12. Construir pagos ────────────────────────────────────────────

  let pagos: FexPago[];
  const validPayments = sale.payments.filter((p) => p.mh_payment_form_code);
  if (validPayments.length > 0) {
    pagos = validPayments.map((p) => ({
      codigo:     p.mh_payment_form_code!,
      montoPago:  r2(Number(p.amount)),
      referencia: p.reference ?? null,
      plazo:      null,
      periodo:    null,
    }));
  } else {
    const condicion = sale.condition_operation_code ?? "1";
    pagos = [{
      codigo:     sale.payment_method_code || "99",
      montoPago:  totalPagar,
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
    nombreComercial: c.legal_name ?? null,
    codPais:         c.country_code!,
    nombrePais:      c.country_name!,
    complemento:     c.address_complement!,
    tipoPersona:     Number(c.customer_person_type),
    descActividad:   c.activity_name!,
    telefono:        c.phone ?? null,
    correo:          c.email ?? null,
  };

  // ── 14. Construir identificacion ───────────────────────────────────

  const now = new Date();
  const { date: fecEmi, time: horEmi } = svDateTime(now);
  const condicion = sale.condition_operation_code
    ? parseInt(sale.condition_operation_code, 10) || 1
    : 1;

  const identificacion = {
    version:           1 as const,
    ambiente:          mapAmbiente(issuerConfig.environment),
    tipoDte:           "11" as const,
    numeroControl:     dteDoc.control_number,
    codigoGeneracion:  dteDoc.generation_code,
    tipoModelo:        1,
    tipoOperacion:     1,
    tipoContingencia:  null,
    motivoContigencia: null,
    fecEmi,
    horEmi,
    tipoMoneda:        "USD" as const,
  };

  // ── 15. Construir emisor ────────────────────────────────────────────

  const emisor = {
    nit:                 normalizeNitForDte(issuerConfig.nit),
    nrc:                 normalizeNrcForDte(issuerConfig.nrc),
    nombre:              issuerConfig.name,
    codActividad:        issuerConfig.activity_code!,
    descActividad:       issuerConfig.activity_name!,
    nombreComercial:     issuerConfig.legal_name ?? null,
    tipoEstablecimiento: issuerConfig.establishment_type_code ?? "02",
    direccion: {
      departamento: issuerConfig.dept_code!,
      municipio:    issuerConfig.municipality_code!,
      complemento:  issuerConfig.address_complement!,
    },
    telefono:        issuerConfig.phone!,
    correo:          issuerConfig.email!,
    codEstableMH:    issuerConfig.cod_estable_mh     ?? null,
    codEstable:      issuerConfig.establishment_code ?? null,
    codPuntoVentaMH: issuerConfig.cod_punto_venta_mh ?? null,
    codPuntoVenta:   issuerConfig.point_of_sale_code ?? null,
    tipoItemExpor:   exportDetails.item_type_export,
    recintoFiscal:   exportDetails.item_type_export === 2 ? null : (exportDetails.fiscal_precinct_code ?? null),
    regimen:         exportDetails.item_type_export === 2 ? null : (exportDetails.regime_code ?? null),
  };

  // ── 16. Construir resumen ────────────────────────────────────────────

  const resumen = {
    totalGravada,
    descuento:           totalDescuento, // TODO FEX FORMULA REVIEW: ver contrato §10 (descuento vs totalDescu)
    porcentajeDescuento: 0,
    totalDescu:          totalDescuento,
    seguro,
    flete,
    montoTotalOperacion,
    totalNoGravado,
    totalPagar,
    totalLetras:         numeroALetras(totalPagar),
    condicionOperacion:  condicion,
    pagos,
    codIncoterms:        exportDetails.incoterm_code ?? null,
    descIncoterms:       exportDetails.incoterm_desc ?? null,
    numPagoElectronico:  null,
    observaciones:       sale.notes ?? null,
  };

  // ── 17. Ensamblar json_document (sin persistir) ───────────────────
  // Raíz sin "documentoRelacionado" ni "extension": el schema FEX 11
  // (additionalProperties=false) no los define en el nivel raíz.
  const jsonDocument: FexJsonDocument = {
    identificacion,
    emisor,
    receptor,
    otrosDocumentos: null,
    ventaTercero:    null,
    cuerpoDocumento,
    resumen,
    apendice:        null,
  };

  return { ok: true, json: jsonDocument };
}
