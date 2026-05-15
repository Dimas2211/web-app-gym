// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-fe-json.service.ts
//
// generateFeJsonForDte — construye el json_document preliminar para
// Factura Electrónica (FE 01) y cambia el estado del DteOutgoingDocument
// de PENDING_GENERATION → GENERATED.
//
// Reglas críticas:
//   - Solo acepta dte_type_code === "01".
//   - Solo opera sobre dte_status === "PENDING_GENERATION".
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO toca inventario.
//   - NO toca DteCorrelative.
//   - NO regenera generation_code ni control_number.
//   - NO valida el JSON contra el JSON Schema oficial del MH (Fase 4I-4).
//
// Decisiones de mapeo MVP documentadas:
//   - uniMedida: 59 (Unidades) — UnitOfMeasure no tiene código fiscal MH.
//   - tipoItem:  1 = bien (PRODUCT/null), 2 = servicio (SERVICE).
//   - ambiente:  "00" = TEST, "01" = PRODUCTION.
//   - descuento: por línea en montoDescu / ventaGravada ya neta de descuento.
//   - descuNoSuj/descuExenta/descuGravada del resumen = 0 (header level).
//   - pagos: usa SalePayment.mh_payment_form_code si existe; fallback "99".
// ─────────────────────────────────────────────────────────────────

import { Prisma }                               from "@prisma/client";
import { prisma }                               from "@/lib/db/prisma";
import { numeroALetras }                        from "../utils/numero-a-letras";
import { normalizeNitForDte, normalizeNrcForDte } from "../utils/fiscal-id.utils";

const TOLERANCE = 0.01;

// Error de negocio distinguido de errores técnicos inesperados
class FeJsonBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeJsonBusinessError";
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

export type GenerateFeJsonResult =
  | { ok: true }
  | { ok: false; error: string };

// ── Función principal ─────────────────────────────────────────────

export async function generateFeJsonForDte(
  dte_document_id: string,
  tenant_id:       string,
  location_id:     string,
  user_id:         string,
): Promise<GenerateFeJsonResult> {
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

    // ── 2. Validar tipo: solo FE 01 ───────────────────────────────
    if (dteDoc.dte_type_code !== "01") {
      return {
        ok:    false,
        error: "Esta fase solo genera JSON preliminar para Factura Electrónica 01. CCFE 03 queda para la Fase 4I-3.",
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
            id_type_code:       true,
            nit:                true,
            nrc:                true,
            dui:                true,
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

    const totalAmount    = Number(sale.total_amount);
    const taxAmount      = Number(sale.tax_amount);
    const discountAmount = Number(sale.discount_amount);

    if (totalAmount <= 0) {
      return { ok: false, error: "El total de la venta debe ser mayor a cero para generar el DTE." };
    }
    if (taxAmount < 0 || discountAmount < 0) {
      return { ok: false, error: "Los impuestos y descuentos de la venta no pueden ser negativos." };
    }

    // ── 7. Validar totales internos ───────────────────────────────
    const sumLineTotal = sale.items.reduce((s, i) => s + Number(i.line_total), 0);
    if (Math.abs(r2(sumLineTotal) - r2(totalAmount)) > TOLERANCE) {
      return {
        ok:    false,
        error: `Inconsistencia de totales: suma de líneas (${r2(sumLineTotal)}) difiere del total_amount (${r2(totalAmount)}) en más de ${TOLERANCE}.`,
      };
    }

    // ── 8. Cargar configuración del emisor ────────────────────────
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

    // Validar campos obligatorios del emisor
    if (!issuerConfig.nit)           return { ok: false, error: "El emisor DTE no tiene NIT configurado." };
    if (!issuerConfig.name)          return { ok: false, error: "El emisor DTE no tiene nombre configurado." };
    if (!issuerConfig.activity_code) return { ok: false, error: "El emisor DTE no tiene código de actividad económica configurado." };
    if (!issuerConfig.activity_name) return { ok: false, error: "El emisor DTE no tiene descripción de actividad económica configurada." };

    // ── 9. Construir cuerpoDocumento ──────────────────────────────

    type LineaTributo = string[];

    interface CuerpoItem {
      numItem:        number;
      tipoItem:       number;
      numeroDocumento: null;
      cantidad:       number;
      codigo:         string;
      codTributo:     null;
      uniMedida:      number;
      descripcion:    string;
      precioUni:      number;
      montoDescu:     number;
      ventaNoSuj:     number;
      ventaExenta:    number;
      ventaGravada:   number;
      tributos:       LineaTributo | null;
      psv:            number;
      noGravado:      number;
      ivaItem:        number | null;
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
        // FE-01: tributos no incluye "20" (IVA); el IVA por línea va en ivaItem.
        tributos:        null,
        psv:             0,
        noGravado:       0,
        ivaItem:         hasIva ? ivaAmount : null,
      };
    });

    // ── 10. Calcular totales del resumen ──────────────────────────

    let totalGravada = 0;
    let totalExenta  = 0;
    let descuGravada = 0;
    let descuExenta  = 0;

    for (const item of cuerpoDocumento) {
      totalGravada += item.ventaGravada;
      totalExenta  += item.ventaExenta;
      // Acumular descuentos por tipo de línea (gravada vs exenta)
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

    const totalNoSuj       = 0;
    const subTotalVentas   = r2(totalNoSuj + totalExenta + totalGravada);
    const subTotal         = subTotalVentas;
    const totalIva         = r2(taxAmount);
    const montoTotalOperacion = r2(totalAmount);
    const totalPagar       = montoTotalOperacion;

    // Validar coherencia resumen vs totales DB
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

    // ── 11. Construir pagos ───────────────────────────────────────

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

    // ── 12. Construir receptor ────────────────────────────────────

    interface Direccion {
      departamento: string | null;
      municipio:    string | null;
      complemento:  string | null;
    }

    interface Receptor {
      tipoDocumento: string | null;
      numDocumento:  string | null;
      nrc:           string | null;
      nombre:        string | null;
      codActividad:  string | null;
      descActividad: string | null;
      direccion:     Direccion | null;
      telefono:      string | null;
      correo:        string | null;
    }

    const c = sale.customer;
    let receptor: Receptor | null;

    if (c && c.id_type_code && c.id_type_code !== "00") {
      const idTypeCode = c.id_type_code;

      // Seleccionar número de documento según tipo:
      // "36" (NIT) → c.nit; "13" (DUI) → c.dui; otros → dui ?? nit ?? null
      let rawNumDoc: string | null;
      if (idTypeCode === "36") {
        rawNumDoc = c.nit ?? null;
      } else if (idTypeCode === "13") {
        rawNumDoc = c.dui ?? null;
      } else {
        rawNumDoc = c.dui ?? c.nit ?? null;
      }

      const numDoc = idTypeCode === "36"
        ? normalizeNitForDte(rawNumDoc)
        : rawNumDoc;

      // FE-01 schema: nrc solo puede tener valor si tipoDocumento === "36";
      // para cualquier otro tipo el schema exige nrc = null.
      const nrcValue = idTypeCode === "36" && c.nrc
        ? normalizeNrcForDte(c.nrc)
        : null;

      const hasDireccion = c.dept_code || c.municipality_code || c.address_complement;

      receptor = {
        tipoDocumento: idTypeCode,
        numDocumento:  numDoc,
        nrc:           nrcValue,
        nombre:        c.name,
        codActividad:  c.activity_code ?? null,
        descActividad: c.activity_name ?? null,
        direccion:     hasDireccion
          ? { departamento: c.dept_code ?? null, municipio: c.municipality_code ?? null, complemento: c.address_complement ?? null }
          : null,
        telefono:      c.phone ?? null,
        correo:        c.email ?? null,
      };
    } else {
      // Sin cliente, sin tipo de documento, o "00" (consumidor final) → receptor null
      receptor = null;
    }

    // ── 13. Construir identificacion ──────────────────────────────

    const now                    = new Date();
    const { date: fecEmi, time: horEmi } = svDateTime(now);
    const condicion    = sale.condition_operation_code
      ? parseInt(sale.condition_operation_code, 10) || 1
      : 1;

    const identificacion = {
      version:         1,
      ambiente:        mapAmbiente(issuerConfig.environment),
      tipoDte:         "01",
      numeroControl:   dteDoc.control_number,
      codigoGeneracion: dteDoc.generation_code,
      tipoModelo:      1,   // CAT-003: Modelo Facturación Normal
      tipoOperacion:   1,   // CAT-004: Transmisión Normal
      tipoContingencia: null,
      motivoContin:    null,
      fecEmi,
      horEmi,
      tipoMoneda:      "USD",
    };

    // ── 14. Construir emisor ──────────────────────────────────────

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
            departamento: issuerConfig.dept_code         ?? null,
            municipio:    issuerConfig.municipality_code ?? null,
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

    // ── 15. Construir resumen ─────────────────────────────────────

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
      // FE-01: resumen.tributos no acepta código "20"; el IVA total va en totalIva.
      tributos:             null,
      subTotal:             subTotal,
      ivaRete1:             0,
      reteRenta:            0,
      montoTotalOperacion:  montoTotalOperacion,
      totalNoGravado:       0,
      totalPagar:           totalPagar,
      totalLetras:          numeroALetras(totalPagar),
      totalIva:             totalIva,
      saldoFavor:           0,
      condicionOperacion:   condicion,
      pagos,
      numPagoElectronico:   null,
    };

    // ── 16. Ensamblar json_document completo ──────────────────────

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

    // ── 17. Persistir: guardar JSON y cambiar estado ──────────────
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
    if (error instanceof FeJsonBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
