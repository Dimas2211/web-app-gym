// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fse-json.service.ts
//
// generateFseJsonForPurchase — construye (sin persistir) el
// json_document para Factura de Sujeto Excluido Electrónica (FSE 14).
//
// Espejo estructural de generate-fex-json.service.ts, adaptado al
// hecho económico Purchase (compra a proveedor sujeto excluido) en
// lugar de Sale:
//   - NO escribe en base de datos.
//   - NO actualiza DteOutgoingDocument.
//   - NO cambia el estado de la compra.
//   - NO reserva correlativos ni genera codigoGeneracion/numeroControl
//     (ya deben existir en el DteOutgoingDocument, reservados por
//     createPendingDteForPurchase).
//   - NO firma ni transmite.
//   - NO toca inventario — el movimiento PURCHASE_IN ya ocurrió al
//     confirmar la compra.
//   - Solo lee y devuelve el JSON candidato.
//
// Fórmulas del resumen (schema fe-fse-v1.json):
//   subTotal    = suma de cuerpoDocumento[].compra (línea = qty × costo unitario, sin impuesto)
//   totalCompra = subTotal - descu (descuento global; 0 en este flujo — Purchase no maneja descuento de línea)
//   ivaRete1    = Purchase.retention_1pct_amount si retention_1pct_applies, si no 0.00
//   reteRenta   = Purchase.income_tax_withholding_amount si income_tax_withholding_applies, si no 0.00
//   totalPagar  = totalCompra - ivaRete1 - reteRenta
// ivaRete1 y reteRenta son magnitudes fiscales distintas — nunca se
// mezclan ni se derivan una de la otra.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import { numeroALetras } from "../utils/numero-a-letras";
import { normalizeNitForDte, normalizeNrcForDte } from "../utils/fiscal-id.utils";
import { mapSupplierToSujetoExcluido } from "../utils/supplier-to-sujeto-excluido.mapper";
import { mapCancellationTypeToCat017 } from "../utils/purchase-payment-method.mapper";
import { validateDteAddressCodes } from "../utils/dte-territory.resolver";
import type { FseJsonDocument, FseCuerpoItem } from "../types/fse-json.types";

const TOLERANCE = 0.01;

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// America/El_Salvador = UTC-6, sin DST.
function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

function mapAmbiente(env: string): "00" | "01" {
  return env === "PRODUCTION" ? "01" : "00";
}

// tipoItem CAT-018: 1 = Bienes, 2 = Servicios, 3 = Ambos.
// Product solo distingue PRODUCT|SERVICE — no hay caso "ambos" a nivel de línea.
function mapTipoItem(productType: string): 1 | 2 {
  return productType === "SERVICE" ? 2 : 1;
}

// ── Tipos de entrada para la función pura ──────────────────────────

export interface FseLoadedSupplier {
  name:               string;
  legal_name:         string | null;
  taxpayer_type:      string;
  id_type_code:       string | null;
  nit:                string | null;
  dui:                string | null;
  other_document:     string | null;
  activity_code:      string | null;
  activity_name:      string | null;
  dept_code:          string | null;
  municipality_code:  string | null;
  address_complement: string | null;
  phone:              string | null;
  email:              string | null;
}

export interface FseLoadedItem {
  dte_line_number: number | null;
  quantity:        number | string;
  unit_cost:       number | string;
  line_subtotal:   number | string;
  product: {
    product_code: string | null;
    name:         string;
    product_type: string;
    unit: { mh_unit_code: string | null };
  };
}

export interface FseLoadedPurchase {
  tenant_id:                      string;
  status:                         string;
  document_type:                  string | null;
  notes:                          string | null;
  payment_condition:              string | null;
  cancellation_type:               string | null;
  retention_1pct_applies:         boolean;
  retention_1pct_amount:          number | string;
  income_tax_withholding_applies: boolean;
  income_tax_withholding_amount:  number | string;
  supplier:                       FseLoadedSupplier;
  items:                          FseLoadedItem[];
}

export interface FseLoadedIssuerConfig {
  nit:                     string | null;
  nrc:                     string | null;
  name:                    string;
  activity_code:           string | null;
  activity_name:           string | null;
  establishment_code:      string | null;
  point_of_sale_code:      string | null;
  cod_estable_mh:          string | null;
  cod_punto_venta_mh:      string | null;
  dept_code:               string | null;
  municipality_code:       string | null;
  address_complement:      string | null;
  phone:                   string | null;
  email:                   string | null;
  environment:             string;
}

export interface FseLoadedData {
  dteDoc:       { control_number: string; generation_code: string };
  purchase:     FseLoadedPurchase;
  issuerConfig: FseLoadedIssuerConfig;
}

export type GenerateFseJsonResult =
  | { ok: true; json: FseJsonDocument }
  | { ok: false; error: string };

// ── Función principal ─────────────────────────────────────────────

export async function generateFseJsonForPurchase(params: {
  tenant_id:       string;
  location_id:     string;
  dte_document_id: string;
}): Promise<GenerateFseJsonResult> {
  const { tenant_id, location_id, dte_document_id } = params;

  const dteDoc = await prisma.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id, location_id },
    select: {
      id:               true,
      dte_type_code:    true,
      generation_code:  true,
      control_number:   true,
      environment:      true,
      purchase_id:      true,
      issuer_config_id: true,
    },
  });

  if (!dteDoc) {
    return { ok: false, error: "El documento DTE no existe o no pertenece a la location activa." };
  }
  if (dteDoc.dte_type_code !== "14") {
    return {
      ok:    false,
      error: `Este builder solo genera JSON para Factura de Sujeto Excluido (14). El documento es tipo "${dteDoc.dte_type_code}".`,
    };
  }
  if (!dteDoc.purchase_id) {
    return { ok: false, error: "El documento DTE no está asociado a ninguna compra." };
  }
  if (!dteDoc.generation_code) {
    return { ok: false, error: "El documento DTE no tiene codigoGeneracion asignado. Datos internos inconsistentes." };
  }
  if (!dteDoc.control_number) {
    return { ok: false, error: "El documento DTE no tiene numeroControl asignado. Datos internos inconsistentes." };
  }
  if (!dteDoc.issuer_config_id) {
    return { ok: false, error: "El documento DTE no tiene configuración de emisor vinculada." };
  }

  const purchase = await prisma.purchase.findFirst({
    where: { id: dteDoc.purchase_id, tenant_id, location_id },
    select: {
      tenant_id:                      true,
      status:                         true,
      document_type:                  true,
      notes:                          true,
      payment_condition:              true,
      cancellation_type:               true,
      retention_1pct_applies:         true,
      retention_1pct_amount:          true,
      income_tax_withholding_applies: true,
      income_tax_withholding_amount:  true,
      supplier: {
        select: {
          name:               true,
          legal_name:         true,
          taxpayer_type:      true,
          id_type_code:       true,
          nit:                true,
          dui:                true,
          other_document:     true,
          activity_code:      true,
          activity_name:      true,
          dept_code:          true,
          municipality_code:  true,
          address_complement: true,
          phone:              true,
          email:              true,
        },
      },
      items: {
        orderBy: { created_at: "asc" },
        select: {
          dte_line_number: true,
          quantity:        true,
          unit_cost:       true,
          line_subtotal:   true,
          product: {
            select: {
              product_code: true,
              name:         true,
              product_type: true,
              unit: { select: { mh_unit_code: true } },
            },
          },
        },
      },
    },
  });

  if (!purchase) {
    return { ok: false, error: "La compra asociada al DTE no existe o no pertenece a la location activa." };
  }

  const issuerConfig = await prisma.dteIssuerConfig.findFirst({
    where: { id: dteDoc.issuer_config_id, tenant_id, location_id },
    select: {
      nit:                true,
      nrc:                true,
      name:               true,
      activity_code:      true,
      activity_name:      true,
      establishment_code: true,
      point_of_sale_code: true,
      cod_estable_mh:     true,
      cod_punto_venta_mh: true,
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

  // ── Validación territorial (resolver único — ver dte-territory.resolver.ts) ──
  const emisorAddrCheck = await validateDteAddressCodes({
    role:             "emisor",
    deptCode:         issuerConfig.dept_code,
    municipalityCode: issuerConfig.municipality_code,
  });
  if (!emisorAddrCheck.ok) return { ok: false, error: emisorAddrCheck.error };

  const sujetoExcluidoAddrCheck = await validateDteAddressCodes({
    role:             "sujeto excluido",
    deptCode:         purchase.supplier.dept_code,
    municipalityCode: purchase.supplier.municipality_code,
  });
  if (!sujetoExcluidoAddrCheck.ok) return { ok: false, error: sujetoExcluidoAddrCheck.error };

  return buildFseJsonFromLoadedData({
    dteDoc: {
      control_number:  dteDoc.control_number,
      generation_code: dteDoc.generation_code,
    },
    purchase:     purchase as unknown as FseLoadedPurchase,
    issuerConfig: issuerConfig as unknown as FseLoadedIssuerConfig,
  });
}

// ── Función pura ───────────────────────────────────────────────────
// Construye el json_document FSE 14 a partir de datos ya cargados.
// No accede a Prisma — permite pruebas aisladas con un fixture in-memory.

export function buildFseJsonFromLoadedData(loaded: FseLoadedData): GenerateFseJsonResult {
  const { dteDoc, purchase, issuerConfig } = loaded;

  // ── Precondiciones de la compra ───────────────────────────────────
  if (purchase.status !== "CONFIRMED") {
    return { ok: false, error: "Solo se puede generar JSON FSE para compras confirmadas." };
  }
  if (purchase.items.length === 0) {
    return { ok: false, error: "La compra no tiene líneas de detalle. No se puede generar FSE sin productos." };
  }

  // ── Sujeto excluido (proveedor) ───────────────────────────────────
  if (purchase.supplier.taxpayer_type !== "EXCLUDED_SUBJECT") {
    return {
      ok:    false,
      error: `El proveedor no está clasificado como sujeto excluido (taxpayer_type actual: ${purchase.supplier.taxpayer_type}). Solo proveedores EXCLUDED_SUBJECT pueden facturarse con FSE 14.`,
    };
  }

  const sujetoExcluidoResult = mapSupplierToSujetoExcluido(purchase.supplier);
  if (!sujetoExcluidoResult.ok) {
    return {
      ok:    false,
      error: `El proveedor no tiene todos los datos fiscales requeridos para FSE 14. Campos faltantes o inválidos: ${sujetoExcluidoResult.missingFields.join(", ")}.`,
    };
  }

  // ── Emisor (nuestra empresa, configuración DTE activa) ────────────
  const missingIssuerFields: string[] = [];
  if (!issuerConfig.nit)                 missingIssuerFields.push("NIT");
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
      error: `La configuración del emisor no está completa para FSE 14. Campos faltantes: ${missingIssuerFields.join(", ")}.`,
    };
  }

  // ── Cuerpo del documento ───────────────────────────────────────────

  const missingUnitLines: number[] = [];
  const invalidQtyLines: number[] = [];

  const cuerpoDocumento: FseCuerpoItem[] = purchase.items.map((item, idx) => {
    const numItem = item.dte_line_number ?? idx + 1;
    const qty = Number(item.quantity);
    if (qty <= 0) invalidQtyLines.push(numItem);

    const mhUnitCode = item.product.unit.mh_unit_code;
    if (!mhUnitCode || !Number.isInteger(Number(mhUnitCode))) {
      missingUnitLines.push(numItem);
    }

    const unitCost   = r2(Number(item.unit_cost));
    const lineCompra = r2(Number(item.line_subtotal));

    return {
      numItem,
      tipoItem:    mapTipoItem(item.product.product_type),
      cantidad:    qty,
      codigo:      item.product.product_code ?? null,
      uniMedida:   mhUnitCode ? Number(mhUnitCode) : 0,
      descripcion: item.product.name,
      precioUni:   unitCost,
      montoDescu:  0, // Purchase no maneja descuento de línea en este flujo
      compra:      lineCompra,
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

  // ── Resumen y totales ──────────────────────────────────────────────

  const subTotal = r2(cuerpoDocumento.reduce((s, i) => s + i.compra, 0));
  const descu    = 0;
  const totalCompra = r2(subTotal - descu);

  const ivaRete1 = purchase.retention_1pct_applies
    ? r2(Number(purchase.retention_1pct_amount))
    : 0;
  const reteRenta = purchase.income_tax_withholding_applies
    ? r2(Number(purchase.income_tax_withholding_amount))
    : 0;

  const totalPagar = r2(totalCompra - ivaRete1 - reteRenta);
  if (totalPagar < 0 - TOLERANCE) {
    return {
      ok:    false,
      error: `El total a pagar resultó negativo (${totalPagar}). Revise las retenciones configuradas en la compra.`,
    };
  }

  // condicionOperacion CAT-013: 1 = Contado, 2 = Crédito, 3 = Otro.
  const condicionOperacion: 1 | 2 | 3 =
    purchase.payment_condition === "CRE" ? 2 : purchase.payment_condition === "OTR" ? 3 : 1;

  const pagos = [{
    // CAT-017: se deriva de Purchase.cancellation_type (forma de pago real
    // capturada en la compra) — ver purchase-payment-method.mapper.ts.
    // Fallback "99" (Otros) solo si cancellation_type no está informado.
    codigo:     mapCancellationTypeToCat017(purchase.cancellation_type),
    montoPago:  totalPagar,
    referencia: null,
    plazo:      null,
    periodo:    null,
  }];

  // ── Identificación ───────────────────────────────────────────────

  const now = new Date();
  const { date: fecEmi, time: horEmi } = svDateTime(now);

  const identificacion = {
    version:          1 as const,
    ambiente:         mapAmbiente(issuerConfig.environment),
    tipoDte:          "14" as const,
    numeroControl:    dteDoc.control_number,
    codigoGeneracion: dteDoc.generation_code,
    tipoModelo:       1 as const,
    tipoOperacion:    1 as const,
    tipoContingencia: null,
    motivoContin:     null,
    fecEmi,
    horEmi,
    tipoMoneda:       "USD" as const,
  };

  // ── Emisor ──────────────────────────────────────────────────────────

  const emisor = {
    nit:             normalizeNitForDte(issuerConfig.nit)!,
    nrc:             normalizeNrcForDte(issuerConfig.nrc),
    nombre:          issuerConfig.name,
    codActividad:    issuerConfig.activity_code!,
    descActividad:   issuerConfig.activity_name!,
    direccion: {
      departamento: issuerConfig.dept_code!,
      municipio:    issuerConfig.municipality_code!,
      complemento:  issuerConfig.address_complement!,
    },
    telefono:        issuerConfig.phone!,
    codEstableMH:    issuerConfig.cod_estable_mh     ?? null,
    codEstable:      issuerConfig.establishment_code ?? null,
    codPuntoVentaMH: issuerConfig.cod_punto_venta_mh ?? null,
    codPuntoVenta:   issuerConfig.point_of_sale_code ?? null,
    correo:          issuerConfig.email!,
  };

  // ── Resumen ───────────────────────────────────────────────────────

  const resumen = {
    totalCompra,
    descu,
    totalDescu:          descu,
    subTotal,
    ivaRete1,
    reteRenta,
    totalPagar,
    totalLetras:         numeroALetras(totalPagar),
    condicionOperacion,
    pagos,
    observaciones:       purchase.notes ?? null,
  };

  // ── Ensamblar json_document (sin persistir) ───────────────────────

  const jsonDocument: FseJsonDocument = {
    identificacion,
    emisor,
    sujetoExcluido: sujetoExcluidoResult.sujetoExcluido,
    cuerpoDocumento,
    resumen,
    apendice: null,
  };

  return { ok: true, json: jsonDocument };
}
