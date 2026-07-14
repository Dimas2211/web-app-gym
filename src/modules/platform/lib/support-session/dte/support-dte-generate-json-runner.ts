// ─────────────────────────────────────────────────────────────────
// platform/lib/support-session/dte — support-dte-generate-json-runner.ts
//
// F2-B1: Runner SERVER-ONLY para generar el json_document preliminar
// (FE 01 o CCFE 03) de un DteOutgoingDocument PENDING_GENERATION y
// validarlo contra el schema oficial MH, en el mismo paso, directamente
// en la base cliente de un PlatformDatabaseProfile.
//
// Replica (sin modificar) la lógica de:
//   - commerce/dte/services/generate-fe-json.service.ts
//   - commerce/dte/services/generate-ccfe-json.service.ts
//   - commerce/dte/services/validate-dte-json-schema.service.ts
// usando el PrismaClient dinámico del perfil en lugar del singleton
// del .env. Los helpers puros (numeroALetras, normalizeNitForDte,
// normalizeNrcForDte, los schemas AJV) se reutilizan sin modificación
// porque no dependen de Prisma.
//
// Garantías:
// - Solo opera sobre dte_status === "PENDING_GENERATION".
// - Solo dte_type_code "01" (FE) y "03" (CCFE).
// - NO firma. NO transmite. NO toca inventario. NO toca DteCorrelative.
// - NO regenera generation_code ni control_number.
// - Persiste json_document y pasa a GENERATED; si el schema AJV valida,
//   pasa además a SCHEMA_VALIDATED en la misma llamada (firma exige
//   SCHEMA_VALIDATED). Si el schema falla, el documento queda en
//   GENERATED con los errores reportados — mismo patrón que el flujo
//   normal de dos pasos.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[support-dte-generate-json-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import Ajv                                        from "ajv";
import addFormats                                 from "ajv-formats";
import { Prisma, PrismaClient }                    from "@prisma/client";
import { numeroALetras }                           from "../../../../commerce/dte/utils/numero-a-letras";
import { normalizeNitForDte, normalizeNrcForDte }  from "../../../../commerce/dte/utils/fiscal-id.utils";
import feSchema   from "../../../../commerce/dte/schemas/mh/fe-01.schema.json";
import ccfeSchema from "../../../../commerce/dte/schemas/mh/ccfe-03.schema.json";
import type {
  GenerateSupportDteJsonResult,
  GenerateSupportDteJsonValidationError,
} from "../../../types/platform.types";

const TOLERANCE = 0.01;

const SCHEMA_MAP: Record<string, object> = {
  "01": feSchema   as object,
  "03": ccfeSchema as object,
};

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

function mapTipoItem(productTypeSnapshot: string | null): number {
  return productTypeSnapshot === "SERVICE" ? 2 : 1;
}

type RunnerResult =
  | { ok: true; result: GenerateSupportDteJsonResult }
  | { ok: false; error: string; field?: string; validation_errors?: GenerateSupportDteJsonValidationError[] };

export async function generateSupportDteJsonRunner(
  client:          PrismaClient,
  tenantId:        string,
  dte_document_id: string,
): Promise<RunnerResult> {
  // ── 1. Cargar DteOutgoingDocument ────────────────────────────────
  const dteDoc = await client.dteOutgoingDocument.findFirst({
    where: { id: dte_document_id, tenant_id: tenantId },
    select: {
      id: true, location_id: true, dte_type_code: true, dte_status: true,
      generation_code: true, control_number: true, environment: true,
      sale_id: true, issuer_config_id: true,
    },
  });
  if (!dteDoc) {
    return { ok: false, field: "dte_document_id", error: "El documento DTE no existe o no pertenece al tenant de este perfil." };
  }

  if (dteDoc.dte_type_code !== "01" && dteDoc.dte_type_code !== "03") {
    return { ok: false, error: `Tipo DTE "${dteDoc.dte_type_code}" no está permitido en F2-B1. Solo se admiten "01" (FE) y "03" (CCFE).` };
  }
  if (dteDoc.dte_status !== "PENDING_GENERATION") {
    return { ok: false, error: `El documento DTE está en estado "${dteDoc.dte_status}". Solo se puede generar JSON desde PENDING_GENERATION.` };
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

  // ── 2. Cargar venta completa ──────────────────────────────────────
  const sale = await client.sale.findFirst({
    where: { id: dteDoc.sale_id, tenant_id: tenantId, location_id: dteDoc.location_id },
    select: {
      id: true, status: true, inventory_moved: true, customer_id: true,
      condition_operation_code: true, payment_method_code: true,
      payment_term_code: true, payment_term_value: true,
      subtotal: true, discount_amount: true, tax_amount: true, total_amount: true,
      customer: {
        select: {
          id: true, name: true, legal_name: true, id_type_code: true,
          taxpayer_type: true, nit: true, nrc: true, dui: true,
          activity_code: true, activity_name: true, dept_code: true,
          municipality_code: true, address_complement: true, phone: true, email: true,
        },
      },
      items: {
        orderBy: { line_number: "asc" },
        select: {
          line_number: true, product_code_snapshot: true, product_name_snapshot: true,
          product_type_snapshot: true, quantity: true, unit_price: true,
          discount_amount: true, tax_rate_snapshot: true, tax_amount: true,
          line_subtotal: true, line_total: true,
        },
      },
      payments: { select: { mh_payment_form_code: true, amount: true, reference: true } },
    },
  });
  if (!sale) {
    return { ok: false, error: "La venta asociada al DTE no existe o no pertenece a esta location." };
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

  if (dteDoc.dte_type_code === "03") {
    if (!sale.customer_id || !sale.customer) {
      return { ok: false, error: "Para CCFE 03 se requiere un cliente asignado a la venta." };
    }
    const c = sale.customer;
    const missingFields: string[] = [];
    if (!c.name)               missingFields.push("nombre");
    if (!c.nit)                missingFields.push("NIT");
    if (!c.nrc)                missingFields.push("NRC");
    if (!c.activity_code)      missingFields.push("código de actividad económica");
    if (!c.activity_name)      missingFields.push("nombre de actividad económica");
    if (!c.dept_code)          missingFields.push("departamento");
    if (!c.municipality_code)  missingFields.push("municipio");
    if (!c.address_complement) missingFields.push("complemento de dirección");
    if (c.taxpayer_type !== "REGISTERED_TAXPAYER") {
      missingFields.push("tipo de contribuyente (debe ser Contribuyente Registrado)");
    }
    if (missingFields.length > 0) {
      return { ok: false, error: `El cliente no está completo para emitir CCFE 03. Campos faltantes o inválidos: ${missingFields.join(", ")}.` };
    }
  }

  const totalAmount    = Number(sale.total_amount);
  const taxAmount      = Number(sale.tax_amount);
  const discountAmount = Number(sale.discount_amount);
  if (totalAmount <= 0) {
    return { ok: false, error: "El total de la venta debe ser mayor a cero para generar el DTE." };
  }
  if (taxAmount < 0 || discountAmount < 0) {
    return { ok: false, error: "Los impuestos y descuentos de la venta no pueden ser negativos." };
  }

  const sumLineTotal = sale.items.reduce((s, i) => s + Number(i.line_total), 0);
  if (Math.abs(r2(sumLineTotal) - r2(totalAmount)) > TOLERANCE) {
    return { ok: false, error: `Inconsistencia de totales: suma de líneas (${r2(sumLineTotal)}) difiere del total_amount (${r2(totalAmount)}) en más de ${TOLERANCE}.` };
  }

  // ── 3. Cargar configuración del emisor ─────────────────────────────
  const issuerConfig = await client.dteIssuerConfig.findFirst({
    where: { id: dteDoc.issuer_config_id, tenant_id: tenantId, location_id: dteDoc.location_id },
    select: {
      nit: true, nrc: true, name: true, legal_name: true, activity_code: true, activity_name: true,
      establishment_code: true, establishment_type_code: true, point_of_sale_code: true,
      dept_code: true, municipality_code: true, address_complement: true,
      phone: true, email: true, environment: true,
    },
  });
  if (!issuerConfig) {
    return { ok: false, error: "La configuración DTE del emisor no existe o no pertenece a esta location." };
  }
  if (!issuerConfig.nit)           return { ok: false, error: "El emisor DTE no tiene NIT configurado." };
  if (!issuerConfig.name)          return { ok: false, error: "El emisor DTE no tiene nombre configurado." };
  if (!issuerConfig.activity_code) return { ok: false, error: "El emisor DTE no tiene código de actividad económica configurado." };
  if (!issuerConfig.activity_name) return { ok: false, error: "El emisor DTE no tiene descripción de actividad económica configurada." };

  const now = new Date();
  const { date: fecEmi, time: horEmi } = svDateTime(now);
  const condicion = sale.condition_operation_code ? parseInt(sale.condition_operation_code, 10) || 1 : 1;

  const hasDireccionEmisor = issuerConfig.dept_code || issuerConfig.municipality_code || issuerConfig.address_complement;
  const emisor = {
    nit:                 normalizeNitForDte(issuerConfig.nit),
    nrc:                 normalizeNrcForDte(issuerConfig.nrc),
    nombre:              issuerConfig.name,
    codActividad:        issuerConfig.activity_code,
    descActividad:       issuerConfig.activity_name,
    nombreComercial:     issuerConfig.legal_name ?? null,
    tipoEstablecimiento: issuerConfig.establishment_type_code ?? "02",
    direccion: hasDireccionEmisor
      ? {
          departamento: issuerConfig.dept_code          ?? null,
          municipio:    issuerConfig.municipality_code  ?? null,
          complemento:  issuerConfig.address_complement ?? null,
        }
      : null,
    telefono:        issuerConfig.phone ?? null,
    correo:          issuerConfig.email ?? null,
    codEstableMH:    issuerConfig.establishment_code ?? null,
    codEstable:      issuerConfig.establishment_code ?? null,
    codPuntoVentaMH: issuerConfig.point_of_sale_code ?? null,
    codPuntoVenta:   issuerConfig.point_of_sale_code ?? null,
  };

  interface PagoItem { codigo: string; montoPago: number; referencia: string | null; plazo: string | null; periodo: number | null; }
  function buildPagos(totalPagar: number): PagoItem[] {
    const validPayments = sale!.payments.filter((p) => p.mh_payment_form_code);
    if (validPayments.length > 0) {
      return validPayments.map((p) => ({
        codigo: p.mh_payment_form_code!, montoPago: r2(Number(p.amount)),
        referencia: p.reference ?? null, plazo: null, periodo: null,
      }));
    }
    return [{
      codigo:     sale!.payment_method_code || "99",
      montoPago:  totalPagar,
      referencia: null,
      plazo:      condicion === 2 ? (sale!.payment_term_code ?? null) : null,
      periodo:    condicion === 2 ? (sale!.payment_term_value ?? null) : null,
    }];
  }

  let jsonDocument: Record<string, unknown>;

  if (dteDoc.dte_type_code === "01") {
    // ── FE 01 ────────────────────────────────────────────────────
    const cuerpoDocumento = sale.items.map((item) => {
      const qty              = Number(item.quantity);
      const unitPriceWithIva = Number(item.unit_price);
      const descuWithIva     = Number(item.discount_amount);
      const taxRate          = Number(item.tax_rate_snapshot ?? 0);
      const hasIva           = taxRate > 0;
      const precioUniLine    = r2(unitPriceWithIva);
      const descuLine        = r2(descuWithIva);
      const lineNetWithIva   = r2(qty * precioUniLine - descuLine);
      const ventaGravadaLine = hasIva ? lineNetWithIva : 0;
      const ventaExentaLine  = hasIva ? 0 : lineNetWithIva;
      const ivaItemLine      = hasIva ? r2(Number(item.tax_amount)) : 0;

      return {
        numItem: item.line_number, tipoItem: mapTipoItem(item.product_type_snapshot),
        numeroDocumento: null, cantidad: qty, codigo: item.product_code_snapshot,
        codTributo: null, uniMedida: 59, descripcion: item.product_name_snapshot,
        precioUni: precioUniLine, montoDescu: descuLine, ventaNoSuj: 0,
        ventaExenta: ventaExentaLine, ventaGravada: ventaGravadaLine,
        tributos: null, psv: 0, noGravado: 0, ivaItem: ivaItemLine,
      };
    });

    let totalGravada = 0, totalExenta = 0, descuGravada = 0, descuExenta = 0, totalIva = 0;
    for (const item of cuerpoDocumento) {
      totalGravada += item.ventaGravada;
      totalExenta  += item.ventaExenta;
      if (item.ventaGravada > 0) descuGravada += item.montoDescu; else descuExenta += item.montoDescu;
      totalIva += item.ivaItem;
    }
    totalGravada = r2(totalGravada); totalExenta = r2(totalExenta);
    descuGravada = r2(descuGravada); descuExenta = r2(descuExenta); totalIva = r2(totalIva);
    const totalDescu = r2(descuGravada + descuExenta);
    const totalNoSuj = 0;
    const subTotalVentas      = r2(totalNoSuj + totalExenta + totalGravada);
    const subTotal            = subTotalVentas;
    const montoTotalOperacion = subTotal;
    const totalPagar          = montoTotalOperacion;

    if (Math.abs(montoTotalOperacion - r2(totalAmount)) > TOLERANCE) {
      return { ok: false, error: `Inconsistencia: montoTotalOperacion calculado (${montoTotalOperacion}) difiere del total_amount de la venta (${r2(totalAmount)}).` };
    }

    const pagos = buildPagos(totalPagar);

    const c = sale.customer;
    let receptor: Record<string, unknown> | null;
    if (c && c.id_type_code && c.id_type_code !== "00") {
      const idTypeCode = c.id_type_code;
      let rawNumDoc: string | null;
      if (idTypeCode === "36") rawNumDoc = c.nit ?? null;
      else if (idTypeCode === "13") rawNumDoc = c.dui ?? null;
      else rawNumDoc = c.dui ?? c.nit ?? null;
      const numDoc = idTypeCode === "36" ? normalizeNitForDte(rawNumDoc) : rawNumDoc;
      const nrcValue = idTypeCode === "36" && c.nrc ? normalizeNrcForDte(c.nrc) : null;
      const hasDireccion = c.dept_code || c.municipality_code || c.address_complement;
      receptor = {
        tipoDocumento: idTypeCode, numDocumento: numDoc, nrc: nrcValue, nombre: c.name,
        codActividad: c.activity_code ?? null, descActividad: c.activity_name ?? null,
        direccion: hasDireccion
          ? { departamento: c.dept_code ?? null, municipio: c.municipality_code ?? null, complemento: c.address_complement ?? null }
          : null,
        telefono: c.phone ?? null, correo: c.email ?? null,
      };
    } else {
      receptor = {
        tipoDocumento: null, numDocumento: null, nrc: null, nombre: "CONSUMIDOR FINAL",
        codActividad: null, descActividad: null, direccion: null, telefono: null, correo: null,
      };
    }

    const identificacion = {
      version: 1, ambiente: mapAmbiente(issuerConfig.environment), tipoDte: "01",
      numeroControl: dteDoc.control_number, codigoGeneracion: dteDoc.generation_code,
      tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null,
      fecEmi, horEmi, tipoMoneda: "USD",
    };

    const resumen = {
      totalNoSuj, totalExenta, totalGravada, subTotalVentas, descuNoSuj: 0,
      descuExenta, descuGravada, porcentajeDescuento: 0, totalDescu, tributos: null,
      subTotal, ivaRete1: 0, reteRenta: 0, montoTotalOperacion, totalNoGravado: 0,
      totalPagar, totalLetras: numeroALetras(totalPagar), totalIva, saldoFavor: 0,
      condicionOperacion: condicion, pagos, numPagoElectronico: null,
    };

    jsonDocument = {
      identificacion, documentoRelacionado: null, emisor, receptor,
      otrosDocumentos: null, ventaTercero: null, cuerpoDocumento, resumen,
      extension: null, apendice: null,
    };

  } else {
    // ── CCFE 03 ──────────────────────────────────────────────────
    const c = sale.customer!;
    const cuerpoDocumento = sale.items.map((item) => {
      const qty       = Number(item.quantity);
      const taxRate   = Number(item.tax_rate_snapshot ?? 0);
      const hasIva    = taxRate > 0;
      const taxFactor = hasIva ? 1 + taxRate / 100 : 1;
      const unitPriceWithIva = Number(item.unit_price);
      const descuWithIva     = Number(item.discount_amount);
      const unitPrice = hasIva ? r2(unitPriceWithIva / taxFactor) : r2(unitPriceWithIva);
      const descu     = hasIva ? r2(descuWithIva / taxFactor)     : r2(descuWithIva);
      const subtotal  = r2(Number(item.line_subtotal));

      return {
        numItem: item.line_number, tipoItem: mapTipoItem(item.product_type_snapshot),
        numeroDocumento: null, cantidad: qty, codigo: item.product_code_snapshot,
        codTributo: null, uniMedida: 59, descripcion: item.product_name_snapshot,
        precioUni: unitPrice, montoDescu: descu, ventaNoSuj: 0,
        ventaExenta: hasIva ? 0 : subtotal, ventaGravada: hasIva ? subtotal : 0,
        tributos: hasIva ? ["20"] : null, psv: 0, noGravado: 0,
      };
    });

    let totalGravada = 0, totalExenta = 0, descuGravada = 0, descuExenta = 0;
    for (const item of cuerpoDocumento) {
      totalGravada += item.ventaGravada;
      totalExenta  += item.ventaExenta;
      if (item.ventaGravada > 0) descuGravada += item.montoDescu; else descuExenta += item.montoDescu;
    }
    totalGravada = r2(totalGravada); totalExenta = r2(totalExenta);
    descuGravada = r2(descuGravada); descuExenta = r2(descuExenta);
    const totalDescu = r2(descuGravada + descuExenta);
    const totalNoSuj = 0;
    const subTotalVentas      = r2(totalNoSuj + totalExenta + totalGravada);
    const subTotal            = subTotalVentas;
    const totalIva            = r2(taxAmount);
    const montoTotalOperacion = r2(totalAmount);
    const totalPagar          = montoTotalOperacion;

    if (Math.abs(subTotalVentas - r2(Number(sale.subtotal))) > TOLERANCE) {
      return { ok: false, error: `Inconsistencia en subTotalVentas: calculado=${subTotalVentas}, esperado=${r2(Number(sale.subtotal))}.` };
    }
    if (Math.abs(subTotal + totalIva - montoTotalOperacion) > TOLERANCE) {
      return { ok: false, error: `Inconsistencia: subTotal(${subTotal}) + totalIva(${totalIva}) = ${r2(subTotal + totalIva)} ≠ montoTotalOperacion(${montoTotalOperacion}).` };
    }

    const pagos = buildPagos(totalPagar);

    const receptor = {
      nit: normalizeNitForDte(c.nit)!, nrc: normalizeNrcForDte(c.nrc)!, nombre: c.name,
      codActividad: c.activity_code!, descActividad: c.activity_name!,
      nombreComercial: c.legal_name ?? null,
      direccion: { departamento: c.dept_code!, municipio: c.municipality_code!, complemento: c.address_complement! },
      telefono: c.phone ?? null, correo: c.email ?? null,
    };

    const identificacion = {
      version: 3, ambiente: mapAmbiente(issuerConfig.environment), tipoDte: "03",
      numeroControl: dteDoc.control_number, codigoGeneracion: dteDoc.generation_code,
      tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null,
      fecEmi, horEmi, tipoMoneda: "USD",
    };

    const resumen = {
      totalNoSuj, totalExenta, totalGravada, subTotalVentas, descuNoSuj: 0,
      descuExenta, descuGravada, porcentajeDescuento: 0, totalDescu,
      tributos: totalIva > 0 ? [{ codigo: "20", descripcion: "Impuesto al Valor Agregado 13%", valor: totalIva }] : null,
      subTotal, ivaPerci1: 0, ivaRete1: 0, reteRenta: 0, montoTotalOperacion, totalNoGravado: 0,
      totalPagar, totalLetras: numeroALetras(totalPagar), saldoFavor: 0,
      condicionOperacion: condicion, pagos, numPagoElectronico: null,
    };

    jsonDocument = {
      identificacion, documentoRelacionado: null, emisor, receptor,
      otrosDocumentos: null, ventaTercero: null, cuerpoDocumento, resumen,
      extension: null, apendice: null,
    };
  }

  // ── 4. Persistir json_document → GENERATED ─────────────────────
  await client.dteOutgoingDocument.update({
    where: { id: dte_document_id },
    data: {
      json_document: jsonDocument as unknown as Prisma.InputJsonValue,
      dte_status:    "GENERATED",
      generated_at:  now,
    },
  });

  // ── 5. Validar contra schema AJV oficial MH ─────────────────────
  const schema = SCHEMA_MAP[dteDoc.dte_type_code];
  const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(jsonDocument);

  if (!valid && validate.errors && validate.errors.length > 0) {
    const leafErrors = validate.errors.filter((e) => e.keyword !== "if");
    const errorsToShow = leafErrors.length > 0 ? leafErrors : validate.errors;
    const validation_errors: GenerateSupportDteJsonValidationError[] = errorsToShow.map((err) => {
      let message = err.message ?? "Error de validación desconocido";
      if (err.keyword === "additionalProperties" && typeof (err.params as Record<string, unknown>).additionalProperty === "string") {
        const extra = (err.params as Record<string, unknown>).additionalProperty as string;
        message = `propiedad adicional no permitida: "${extra}"`;
      }
      return { path: err.instancePath || "(raíz)", message };
    });

    return {
      ok: false,
      error: "El JSON generado no cumple el schema oficial MH. El documento quedó en estado GENERATED — corrige los datos de origen y reintenta.",
      validation_errors,
    };
  }

  // ── 6. Validado → SCHEMA_VALIDATED ──────────────────────────────
  const schemaValidatedAt = new Date();
  await client.dteOutgoingDocument.update({
    where: { id: dte_document_id },
    data:  { dte_status: "SCHEMA_VALIDATED", schema_validated_at: schemaValidatedAt },
  });

  return {
    ok: true,
    result: {
      dte_document_id,
      dte_status:          "SCHEMA_VALIDATED",
      generated_at:        now.toISOString(),
      schema_validated_at: schemaValidatedAt.toISOString(),
    },
  };
}
