// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-ccfe-json.service.ts
//
// generateCcfeJsonForDte — construye el json_document preliminar para
// Comprobante de Crédito Fiscal Electrónico (CCFE 03) y cambia el estado
// del DteOutgoingDocument de PENDING_GENERATION → GENERATED.
//
// Reglas críticas:
//   - Solo acepta dte_type_code === "03".
//   - Solo opera sobre dte_status === "PENDING_GENERATION".
//   - Requiere cliente fiscal completo (NIT, NRC, actividad, dirección).
//   - Requiere taxpayer_type === "REGISTERED_TAXPAYER".
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO toca inventario.
//   - NO toca DteCorrelative.
//   - NO regenera generation_code ni control_number.
//   - NO valida el JSON contra el JSON Schema oficial del MH (Fase 4I-4).
//
// Decisiones de mapeo MVP (idénticas a FE 01 donde aplica):
//   - uniMedida: 59 (Unidades) — UnitOfMeasure no tiene código fiscal MH.
//   - tipoItem:  1 = bien (PRODUCT/null), 2 = servicio (SERVICE).
//   - ambiente:  "00" = TEST, "01" = PRODUCTION.
//   - version:   3 — CCFE 03 usa version 3 según especificación MH.
//   - descuento: por línea en montoDescu / ventaGravada ya neta de descuento.
//   - descuNoSuj/descuExenta/descuGravada del resumen = 0 (header level).
//   - pagos: usa SalePayment.mh_payment_form_code si existe; fallback "99".
//   - ivaPerci1/ivaRete1/reteRenta: 0 en esta fase preliminar.
// ─────────────────────────────────────────────────────────────────

import { Prisma }                               from "@prisma/client";
import { prisma }                               from "@/lib/db/prisma";
import { numeroALetras }                        from "../utils/numero-a-letras";
import { normalizeNitForDte, normalizeNrcForDte } from "../utils/fiscal-id.utils";

const TOLERANCE = 0.01;

class CcfeJsonBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CcfeJsonBusinessError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// America/El_Salvador = UTC-6, sin DST.
// toLocaleString con "sv-SE" produce "YYYY-MM-DD HH:MM:SS".
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

// ── Tipo de resultado público ─────────────────────────────────────

export type GenerateCcfeJsonResult =
  | { ok: true }
  | { ok: false; error: string };

// ── Función principal ─────────────────────────────────────────────

export async function generateCcfeJsonForDte(
  dte_document_id: string,
  tenant_id:       string,
  location_id:     string,
  user_id:         string,
): Promise<GenerateCcfeJsonResult> {
  try {
    // ── 1. Cargar DteOutgoingDocument ──────────────────────────────
    const dteDoc = await prisma.dteOutgoingDocument.findFirst({
      where: { id: dte_document_id, tenant_id, location_id },
      select: {
        id:               true,
        dte_type_code:    true,
        dte_status:       true,
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

    // ── 2. Validar tipo: solo CCFE 03 ─────────────────────────────
    if (dteDoc.dte_type_code !== "03") {
      return {
        ok:    false,
        error: `Esta operación genera JSON preliminar solo para Comprobante de Crédito Fiscal (03). El documento es tipo "${dteDoc.dte_type_code}".`,
      };
    }

    // ── 3. Validar estado ─────────────────────────────────────────
    if (dteDoc.dte_status !== "PENDING_GENERATION") {
      return {
        ok:    false,
        error: `El documento DTE está en estado "${dteDoc.dte_status}". Solo se puede generar JSON desde PENDING_GENERATION.`,
      };
    }

    // ── 4. Validar identidad fiscal reservada ─────────────────────
    if (!dteDoc.generation_code) {
      return { ok: false, error: "El documento DTE no tiene codigoGeneracion asignado. Datos internos inconsistentes." };
    }
    if (!dteDoc.control_number) {
      return { ok: false, error: "El documento DTE no tiene numeroControl asignado. Datos internos inconsistentes." };
    }
    if (!dteDoc.issuer_config_id) {
      return { ok: false, error: "El documento DTE no tiene configuración de emisor vinculada." };
    }

    // ── 5. Cargar venta completa ──────────────────────────────────
    const sale = await prisma.sale.findFirst({
      where: { id: dteDoc.sale_id, tenant_id, location_id },
      select: {
        id:                       true,
        sale_date:                true,
        status:                   true,
        inventory_moved:          true,
        customer_id:              true,
        condition_operation_code: true,
        payment_method_code:      true,
        payment_term_code:        true,
        payment_term_value:       true,
        subtotal:                 true,
        discount_amount:          true,
        tax_amount:               true,
        total_amount:             true,
        customer: {
          select: {
            id:                 true,
            name:               true,
            legal_name:         true,
            taxpayer_type:      true,
            nit:                true,
            nrc:                true,
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
            tax_amount:            true,
            line_subtotal:         true,
            line_total:            true,
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

    // ── 6. Validar precondiciones de la venta ─────────────────────
    if (sale.status !== "CONFIRMED") {
      return { ok: false, error: "Solo se puede generar JSON DTE para ventas confirmadas." };
    }
    if (!sale.inventory_moved) {
      return { ok: false, error: "La venta aún no ha aplicado inventario. Aplica el inventario primero." };
    }
    if (sale.items.length === 0) {
      return { ok: false, error: "La venta no tiene líneas de detalle. No se puede generar DTE sin productos." };
    }

    // ── 7. CCFE exige cliente con datos fiscales completos ─────────
    if (!sale.customer_id || !sale.customer) {
      return { ok: false, error: "Para CCFE 03 se requiere un cliente asignado a la venta." };
    }

    // ── 8. Validar completitud fiscal del cliente para CCFE ────────
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
      return {
        ok:    false,
        error: `El cliente no está completo para emitir CCFE 03. Campos faltantes o inválidos: ${missingFields.join(", ")}.`,
      };
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

    // ── 9. Validar totales internos ───────────────────────────────
    const sumLineTotal = sale.items.reduce((s, i) => s + Number(i.line_total), 0);
    if (Math.abs(r2(sumLineTotal) - r2(totalAmount)) > TOLERANCE) {
      return {
        ok:    false,
        error: `Inconsistencia de totales: suma de líneas (${r2(sumLineTotal)}) difiere del total_amount (${r2(totalAmount)}) en más de ${TOLERANCE}.`,
      };
    }

    // ── 10. Cargar configuración del emisor ───────────────────────
    const issuerConfig = await prisma.dteIssuerConfig.findFirst({
      where: { id: dteDoc.issuer_config_id, tenant_id, location_id },
      select: {
        nit:                     true,
        nrc:                     true,
        name:                    true,
        legal_name:              true,
        activity_code:           true,
        activity_name:           true,
        establishment_code:      true,
        establishment_type_code: true,
        point_of_sale_code:      true,
        dept_code:               true,
        municipality_code:       true,
        address_complement:      true,
        phone:                   true,
        email:                   true,
        environment:             true,
      },
    });

    if (!issuerConfig) {
      return { ok: false, error: "La configuración DTE del emisor no existe o no pertenece a esta location." };
    }

    if (!issuerConfig.nit)           return { ok: false, error: "El emisor DTE no tiene NIT configurado." };
    if (!issuerConfig.name)          return { ok: false, error: "El emisor DTE no tiene nombre configurado." };
    if (!issuerConfig.activity_code) return { ok: false, error: "El emisor DTE no tiene código de actividad económica configurado." };
    if (!issuerConfig.activity_name) return { ok: false, error: "El emisor DTE no tiene descripción de actividad económica configurada." };

    // ── 11. Construir cuerpoDocumento ─────────────────────────────

    type LineaTributo = string[];

    // CCFE-03: ivaItem NO existe en el schema oficial MH para cuerpoDocumento.
    // El IVA va solo en resumen.tributos y resumen.ivaPerci1/ivaRete1.
    interface CuerpoItem {
      numItem:         number;
      tipoItem:        number;
      numeroDocumento: null;
      cantidad:        number;
      codigo:          string;
      codTributo:      null;
      uniMedida:       number;
      descripcion:     string;
      precioUni:       number;
      montoDescu:      number;
      ventaNoSuj:      number;
      ventaExenta:     number;
      ventaGravada:    number;
      tributos:        LineaTributo | null;
      psv:             number;
      noGravado:       number;
    }

    const cuerpoDocumento: CuerpoItem[] = sale.items.map((item) => {
      const qty       = Number(item.quantity);
      const unitPrice = r2(Number(item.unit_price));
      const descu     = r2(Number(item.discount_amount));
      const subtotal  = r2(Number(item.line_subtotal));
      const ivaAmount = r2(Number(item.tax_amount));
      const hasIva    = Number(item.tax_rate_snapshot) > 0 && ivaAmount > 0;

      return {
        numItem:         item.line_number,
        tipoItem:        mapTipoItem(item.product_type_snapshot),
        numeroDocumento: null,
        cantidad:        qty,
        codigo:          item.product_code_snapshot,
        codTributo:      null,
        uniMedida:       59, // CAT-014 "Unidades" — MVP: UnitOfMeasure no tiene código fiscal MH
        descripcion:     item.product_name_snapshot,
        precioUni:       unitPrice,
        montoDescu:      descu,
        ventaNoSuj:      0,
        ventaExenta:     hasIva ? 0 : subtotal,
        ventaGravada:    hasIva ? subtotal : 0,
        tributos:        hasIva ? ["20"] : null,
        psv:             0,
        noGravado:       0,
      };
    });

    // ── 12. Calcular totales del resumen ──────────────────────────

    let totalGravada = 0;
    let totalExenta  = 0;
    let descuGravada = 0;
    let descuExenta  = 0;

    for (const item of cuerpoDocumento) {
      totalGravada += item.ventaGravada;
      totalExenta  += item.ventaExenta;
      if (item.ventaGravada > 0) {
        descuGravada += item.montoDescu;
      } else {
        descuExenta += item.montoDescu;
      }
    }
    totalGravada = r2(totalGravada);
    totalExenta  = r2(totalExenta);
    descuGravada = r2(descuGravada);
    descuExenta  = r2(descuExenta);
    const totalDescu = r2(descuGravada + descuExenta);

    const totalNoSuj          = 0;
    const subTotalVentas      = r2(totalNoSuj + totalExenta + totalGravada);
    const subTotal            = subTotalVentas;
    const totalIva            = r2(taxAmount);
    const montoTotalOperacion = r2(totalAmount);
    const totalPagar          = montoTotalOperacion;

    if (Math.abs(subTotalVentas - r2(Number(sale.subtotal))) > TOLERANCE) {
      return {
        ok:    false,
        error: `Inconsistencia en subTotalVentas: calculado=${subTotalVentas}, esperado=${r2(Number(sale.subtotal))}.`,
      };
    }
    if (Math.abs(subTotal + totalIva - montoTotalOperacion) > TOLERANCE) {
      return {
        ok:    false,
        error: `Inconsistencia: subTotal(${subTotal}) + totalIva(${totalIva}) = ${r2(subTotal + totalIva)} ≠ montoTotalOperacion(${montoTotalOperacion}).`,
      };
    }

    // ── 13. Construir pagos ───────────────────────────────────────

    interface PagoItem {
      codigo:     string;
      montoPago:  number;
      referencia: string | null;
      plazo:      string | null;
      periodo:    number | null;
    }

    let pagos: PagoItem[];

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
        codigo:     sale.payment_method_code || "99", // CAT-017: usa código de venta si existe; fallback "99" (Otros)
        montoPago:  totalPagar,
        referencia: null,
        plazo:      condicion === "2" ? (sale.payment_term_code ?? null) : null,
        periodo:    condicion === "2" ? (sale.payment_term_value ?? null) : null,
      }];
    }

    // ── 14. Construir receptor (CCFE: NIT + NRC obligatorios) ──────
    // A diferencia de FE 01, CCFE no usa tipoDocumento/numDocumento.
    // El receptor siempre es un contribuyente registrado con NIT y NRC.
    const receptor = {
      nit:             normalizeNitForDte(c.nit)!,
      nrc:             normalizeNrcForDte(c.nrc)!,
      nombre:          c.name,
      codActividad:    c.activity_code!,
      descActividad:   c.activity_name!,
      nombreComercial: c.legal_name ?? null,
      direccion: {
        departamento: c.dept_code!,
        municipio:    c.municipality_code!,
        complemento:  c.address_complement!,
      },
      telefono: c.phone ?? null,
      correo:   c.email ?? null,
    };

    // ── 15. Construir identificacion ──────────────────────────────
    const now                          = new Date();
    const { date: fecEmi, time: horEmi } = svDateTime(now);
    const condicion = sale.condition_operation_code
      ? parseInt(sale.condition_operation_code, 10) || 1
      : 1;

    const identificacion = {
      version:          3,    // CCFE 03 usa version 3 según especificación MH El Salvador
      ambiente:         mapAmbiente(issuerConfig.environment),
      tipoDte:          "03",
      numeroControl:    dteDoc.control_number,
      codigoGeneracion: dteDoc.generation_code,
      tipoModelo:       1,    // CAT-003: Modelo Facturación Normal
      tipoOperacion:    1,    // CAT-004: Transmisión Normal
      tipoContingencia: null,
      motivoContin:     null,
      fecEmi,
      horEmi,
      tipoMoneda:       "USD",
    };

    // ── 16. Construir emisor ──────────────────────────────────────
    const hasDireccionEmisor =
      issuerConfig.dept_code || issuerConfig.municipality_code || issuerConfig.address_complement;

    const emisor = {
      nit:                 normalizeNitForDte(issuerConfig.nit),
      nrc:                 normalizeNrcForDte(issuerConfig.nrc),
      nombre:              issuerConfig.name,
      codActividad:        issuerConfig.activity_code,
      descActividad:       issuerConfig.activity_name,
      nombreComercial:     issuerConfig.legal_name ?? null,
      tipoEstablecimiento: issuerConfig.establishment_type_code ?? "02",
      direccion:           hasDireccionEmisor
        ? {
            departamento: issuerConfig.dept_code          ?? null,
            municipio:    issuerConfig.municipality_code  ?? null,
            complemento:  issuerConfig.address_complement ?? null,
          }
        : null,
      telefono:        issuerConfig.phone  ?? null,
      correo:          issuerConfig.email  ?? null,
      codEstableMH:    issuerConfig.establishment_code  ?? null,
      codEstable:      issuerConfig.establishment_code  ?? null,
      codPuntoVentaMH: issuerConfig.point_of_sale_code  ?? null,
      codPuntoVenta:   issuerConfig.point_of_sale_code  ?? null,
    };

    // ── 17. Construir resumen ─────────────────────────────────────
    const resumen = {
      totalNoSuj:           totalNoSuj,
      totalExenta:          totalExenta,
      totalGravada:         totalGravada,
      subTotalVentas:       subTotalVentas,
      descuNoSuj:           0,
      descuExenta:          descuExenta,
      descuGravada:         descuGravada,
      porcentajeDescuento:  0,
      totalDescu:           totalDescu,
      tributos:             totalIva > 0
        ? [{ codigo: "20", descripcion: "Impuesto al Valor Agregado 13%", valor: totalIva }]
        : null,
      subTotal:             subTotal,
      ivaPerci1:            0,
      ivaRete1:             0,
      reteRenta:            0,
      montoTotalOperacion:  montoTotalOperacion,
      totalNoGravado:       0,
      totalPagar:           totalPagar,
      totalLetras:          numeroALetras(totalPagar),
      saldoFavor:           0,
      condicionOperacion:   condicion,
      pagos,
      numPagoElectronico:   null,
    };

    // ── 18. Ensamblar json_document completo ──────────────────────
    const jsonDocument = {
      identificacion,
      documentoRelacionado: null,
      emisor,
      receptor,
      otrosDocumentos: null,
      ventaTercero:    null,
      cuerpoDocumento,
      resumen,
      extension:  null,
      apendice:   null,
    };

    // ── 19. Persistir: guardar JSON y cambiar estado ──────────────
    await prisma.dteOutgoingDocument.update({
      where: { id: dte_document_id },
      data:  {
        json_document: jsonDocument as unknown as Prisma.InputJsonValue,
        dte_status:    "GENERATED",
        generated_at:  now,
        updated_by:    user_id,
      },
    });

    return { ok: true };

  } catch (error) {
    if (error instanceof CcfeJsonBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
