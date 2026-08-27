// ─────────────────────────────────────────────────────────────────
// commerce/dte — generate-nc-json.service.ts
//
// generateNcJsonForDte — construye el json_document para una Nota
// de Crédito Electrónica (NC 05) ya creada en PENDING_GENERATION y
// cambia dte_status de PENDING_GENERATION → GENERATED.
//
// Reglas críticas:
//   - Solo acepta dte_type_code === "05".
//   - Solo opera sobre dte_status === "PENDING_GENERATION".
//   - La NC 05 V1 es una nota de crédito TOTAL sobre el CCFE 03.
//   - Carga el json_document del CCFE 03 original (ACCEPTED).
//   - Todos los montos son POSITIVOS.
//   - emisor NO incluye codEstableMH/codEstable/codPuntoVentaMH/codPuntoVenta.
//   - cuerpoDocumento[].numeroDocumento = generation_code del CCFE original.
//   - documentoRelacionado.numeroDocumento = generation_code del CCFE original.
//   - NO incluye: ivaItem, psv, noGravado, totalIva, totalPagar, pagos.
//   - NO valida schema JSON contra MH.
//   - NO firma el documento.
//   - NO transmite a Hacienda.
//   - NO toca inventario, caja ni Sale.status.
//   - NO regenera generation_code ni control_number.
// ─────────────────────────────────────────────────────────────────

import { Prisma }                                   from "@prisma/client";
import { prisma }                                   from "@/lib/db/prisma";
import { numeroALetras }                            from "../utils/numero-a-letras";
import { normalizeNitForDte, normalizeNrcForDte }   from "../utils/fiscal-id.utils";
import { validateDteAddressCodes }                  from "../utils/dte-territory.resolver";

class NcJsonBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NcJsonBusinessError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

function mapAmbiente(env: string): string {
  return env === "PRODUCTION" ? "01" : "00";
}

function mapTipoItem(productTypeSnapshot: string | null | undefined): number {
  return productTypeSnapshot === "SERVICE" ? 2 : 1;
}

// ── Tipo interno del cuerpoDocumento del CCFE ─────────────────────

interface CcfeCuerpoItem {
  numItem?:              number;
  tipoItem?:             number;
  cantidad?:             number;
  codigo?:               string | null;
  uniMedida?:            number;
  descripcion?:          string | null;
  precioUni?:            number;
  montoDescu?:           number;
  ventaNoSuj?:           number;
  ventaExenta?:          number;
  ventaGravada?:         number;
  tributos?:             string[] | null;
  product_type_snapshot?: string | null;
}

// ── Tipo de resultado público ─────────────────────────────────────

export type GenerateNcJsonResult =
  | {
      ok:             true;
      dteStatus:      "GENERATED";
      dteDocumentId:  string;
      controlNumber:  string;
      generationCode: string;
    }
  | { ok: false; message: string };

// ── Función principal ─────────────────────────────────────────────

export async function generateNcJsonForDte(params: {
  dteDocumentId: string;
  userId:        string;
  tenantId:      string;
  locationId:    string;
}): Promise<GenerateNcJsonResult> {
  const { dteDocumentId, userId, tenantId, locationId } = params;

  try {
    // ── 1. Cargar DteOutgoingDocument NC 05 ───────────────────────
    const ncDoc = await prisma.dteOutgoingDocument.findFirst({
      where: { id: dteDocumentId, tenant_id: tenantId, location_id: locationId },
      select: {
        id:               true,
        dte_type_code:    true,
        dte_status:       true,
        generation_code:  true,
        control_number:   true,
        environment:      true,
        issuer_config_id: true,
        json_document:    true,
      },
    });

    if (!ncDoc) {
      return { ok: false, message: "El documento DTE no existe o no pertenece a la location activa." };
    }

    // ── 2. Validar tipo: solo NC 05 ───────────────────────────────
    if (ncDoc.dte_type_code !== "05") {
      return {
        ok:      false,
        message: `Esta operación genera JSON solo para Nota de Crédito (05). El documento es tipo "${ncDoc.dte_type_code}".`,
      };
    }

    // ── 3. Validar estado ─────────────────────────────────────────
    if (ncDoc.dte_status !== "PENDING_GENERATION") {
      return {
        ok:      false,
        message: `El documento DTE está en estado "${ncDoc.dte_status}". Solo se puede generar JSON desde PENDING_GENERATION.`,
      };
    }

    // ── 4. Validar identidad fiscal ───────────────────────────────
    if (!ncDoc.generation_code) {
      return { ok: false, message: "El documento DTE no tiene codigoGeneracion asignado." };
    }
    if (!ncDoc.control_number) {
      return { ok: false, message: "El documento DTE no tiene numeroControl asignado." };
    }
    if (ncDoc.json_document !== null) {
      return { ok: false, message: "El documento DTE ya tiene json_document generado." };
    }
    if (!ncDoc.issuer_config_id) {
      return { ok: false, message: "El documento DTE no tiene configuración de emisor vinculada." };
    }

    // ── 5. Cargar relación CREDIT_NOTE_OF ─────────────────────────
    const ncRelation = await prisma.dteDocumentRelation.findFirst({
      where: {
        source_dte_document_id: dteDocumentId,
        relation_type:          "CREDIT_NOTE_OF",
      },
      select: {
        related_dte_document_id: true,
      },
    });

    if (!ncRelation) {
      return { ok: false, message: "No existe relación CREDIT_NOTE_OF para esta Nota de Crédito. Datos internos inconsistentes." };
    }

    // ── 6. Cargar CCFE 03 original ────────────────────────────────
    const originalCcfe = await prisma.dteOutgoingDocument.findFirst({
      where: {
        id:          ncRelation.related_dte_document_id,
        tenant_id:   tenantId,
        location_id: locationId,
      },
      select: {
        id:              true,
        dte_type_code:   true,
        dte_status:      true,
        generation_code: true,
        control_number:  true,
        reception_stamp: true,
        json_document:   true,
      },
    });

    if (!originalCcfe) {
      return { ok: false, message: "El CCFE 03 original no existe o no pertenece a la location activa." };
    }
    if (originalCcfe.dte_type_code !== "03") {
      return { ok: false, message: `El documento relacionado no es un CCFE 03 (es tipo "${originalCcfe.dte_type_code}").` };
    }
    if (originalCcfe.dte_status !== "ACCEPTED") {
      return { ok: false, message: `El CCFE 03 original debe estar ACCEPTED. Estado actual: "${originalCcfe.dte_status}".` };
    }
    if (!originalCcfe.generation_code) {
      return { ok: false, message: "El CCFE 03 original no tiene codigoGeneracion." };
    }
    if (!originalCcfe.control_number) {
      return { ok: false, message: "El CCFE 03 original no tiene numeroControl." };
    }
    if (!originalCcfe.reception_stamp) {
      return { ok: false, message: "El CCFE 03 original no tiene sello de recepción MH." };
    }
    if (!originalCcfe.json_document) {
      return { ok: false, message: "El CCFE 03 original no tiene json_document registrado." };
    }

    // ── 7. Leer json_document del CCFE original ───────────────────
    const ccfeJson = originalCcfe.json_document as Record<string, unknown>;
    const ccfeIdentificacion = ccfeJson.identificacion as Record<string, unknown> | undefined;
    const ccfeEmisor         = ccfeJson.emisor         as Record<string, unknown> | undefined;
    const ccfeReceptor       = ccfeJson.receptor       as Record<string, unknown> | undefined;
    const ccfeCuerpo         = ccfeJson.cuerpoDocumento as CcfeCuerpoItem[] | undefined;

    if (!ccfeIdentificacion || !ccfeEmisor || !ccfeReceptor || !ccfeCuerpo || ccfeCuerpo.length === 0) {
      return { ok: false, message: "El json_document del CCFE original no tiene la estructura esperada." };
    }

    // ── 8. Validar receptor del CCFE (CCFE receptor = NIT + NRC) ──
    const rcpNit  = ccfeReceptor.nit  as string | undefined;
    const rcpNrc  = ccfeReceptor.nrc  as string | undefined;
    const rcpNombre = ccfeReceptor.nombre as string | undefined;
    const rcpCodActividad  = ccfeReceptor.codActividad  as string | undefined;
    const rcpDescActividad = ccfeReceptor.descActividad as string | undefined;
    const rcpDireccion     = ccfeReceptor.direccion     as Record<string, string> | undefined;

    const missingRcp: string[] = [];
    if (!rcpNit)           missingRcp.push("nit receptor");
    if (!rcpNrc)           missingRcp.push("nrc receptor");
    if (!rcpNombre)        missingRcp.push("nombre receptor");
    if (!rcpCodActividad)  missingRcp.push("codActividad receptor");
    if (!rcpDescActividad) missingRcp.push("descActividad receptor");
    if (!rcpDireccion)     missingRcp.push("direccion receptor");

    if (missingRcp.length > 0) {
      return { ok: false, message: `El CCFE original tiene datos de receptor incompletos: ${missingRcp.join(", ")}.` };
    }

    // ── 9. Cargar configuración del emisor ────────────────────────
    const issuerConfig = await prisma.dteIssuerConfig.findFirst({
      where: { id: ncDoc.issuer_config_id, tenant_id: tenantId, location_id: locationId },
      select: {
        nit:                     true,
        nrc:                     true,
        name:                    true,
        legal_name:              true,
        activity_code:           true,
        activity_name:           true,
        establishment_type_code: true,
        dept_code:               true,
        municipality_code:       true,
        address_complement:      true,
        phone:                   true,
        email:                   true,
        environment:             true,
      },
    });

    if (!issuerConfig) {
      return { ok: false, message: "La configuración DTE del emisor no existe o no pertenece a esta location." };
    }
    if (!issuerConfig.nit)           return { ok: false, message: "El emisor DTE no tiene NIT configurado." };
    if (!issuerConfig.name)          return { ok: false, message: "El emisor DTE no tiene nombre configurado." };
    if (!issuerConfig.activity_code) return { ok: false, message: "El emisor DTE no tiene código de actividad económica configurado." };
    if (!issuerConfig.activity_name) return { ok: false, message: "El emisor DTE no tiene descripción de actividad económica configurada." };

    // ── 9b. Validación territorial del emisor (resolver único) ─────
    // El receptor de NC 05 se copia del CCFE original ya ACCEPTED
    // (su dirección ya fue validada al construir/transmitir ese CCFE),
    // por eso aquí solo se revalida el emisor, que se recarga en vivo.
    const emisorAddrCheck = await validateDteAddressCodes({
      role:             "emisor",
      deptCode:         issuerConfig.dept_code,
      municipalityCode: issuerConfig.municipality_code,
    });
    if (!emisorAddrCheck.ok) return { ok: false, message: emisorAddrCheck.error };

    // ── 10. Construir identificacion ──────────────────────────────
    const now                            = new Date();
    const { date: fecEmi, time: horEmi } = svDateTime(now);

    const identificacion = {
      version:          3,
      ambiente:         mapAmbiente(issuerConfig.environment),
      tipoDte:          "05",
      numeroControl:    ncDoc.control_number,
      codigoGeneracion: ncDoc.generation_code,
      tipoModelo:       1,
      tipoOperacion:    1,
      tipoContingencia: null,
      motivoContin:     null,
      fecEmi,
      horEmi,
      tipoMoneda:       "USD",
    };

    // ── 11. Construir documentoRelacionado ────────────────────────
    // numeroDocumento = generation_code del CCFE (tipoGeneracion=2 → UUID)
    const ccfeFecEmi = ccfeIdentificacion.fecEmi as string | undefined ?? fecEmi;

    const documentoRelacionado = [
      {
        tipoDocumento:  "03",
        tipoGeneracion: 2,
        numeroDocumento: originalCcfe.generation_code,
        fechaEmision:    ccfeFecEmi,
      },
    ];

    // ── 12. Construir emisor (NC 05 NO incluye códigos de establecimiento) ──
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
      telefono: issuerConfig.phone  ?? null,
      correo:   issuerConfig.email  ?? null,
      // codEstableMH, codEstable, codPuntoVentaMH, codPuntoVenta
      // NO se incluyen en NC 05 según especificación MH
    };

    // ── 13. Construir receptor (tomado del CCFE original) ─────────
    const receptor = {
      nit:             rcpNit!,
      nrc:             rcpNrc!,
      nombre:          rcpNombre!,
      codActividad:    rcpCodActividad!,
      descActividad:   rcpDescActividad!,
      nombreComercial: (ccfeReceptor.nombreComercial as string | null) ?? null,
      direccion:       rcpDireccion!,
      telefono:        (ccfeReceptor.telefono as string | null) ?? null,
      correo:          (ccfeReceptor.correo   as string | null) ?? null,
    };

    // ── 14. Construir cuerpoDocumento desde el CCFE original ──────
    // NC 05 es crédito total: se espeja cuerpoDocumento con montos positivos.
    // numeroDocumento = generation_code del CCFE (obligatorio en NC 05).
    // NO se incluye: ivaItem, psv, noGravado.

    interface NcCuerpoItem {
      numItem:         number;
      tipoItem:        number;
      numeroDocumento: string;
      cantidad:        number;
      codigo:          string | null;
      codTributo:      null;
      uniMedida:       number;
      descripcion:     string | null;
      precioUni:       number;
      montoDescu:      number;
      ventaNoSuj:      number;
      ventaExenta:     number;
      ventaGravada:    number;
      tributos:        string[] | null;
    }

    const cuerpoDocumento: NcCuerpoItem[] = ccfeCuerpo.map((item, idx) => {
      const ventaGravada = r2(Math.abs(Number(item.ventaGravada ?? 0)));
      const ventaExenta  = r2(Math.abs(Number(item.ventaExenta  ?? 0)));
      const ventaNoSuj   = r2(Math.abs(Number(item.ventaNoSuj   ?? 0)));
      const montoDescu   = r2(Math.abs(Number(item.montoDescu   ?? 0)));
      const precioUni    = r2(Math.abs(Number(item.precioUni    ?? 0)));
      const cantidad     = Math.abs(Number(item.cantidad ?? 1));

      return {
        numItem:         idx + 1,
        tipoItem:        item.tipoItem ?? mapTipoItem(item.product_type_snapshot),
        numeroDocumento: originalCcfe.generation_code!,
        cantidad,
        codigo:          item.codigo  ?? null,
        codTributo:      null,
        uniMedida:       item.uniMedida ?? 59,
        descripcion:     item.descripcion ?? null,
        precioUni,
        montoDescu,
        ventaNoSuj,
        ventaExenta,
        ventaGravada,
        tributos:        ventaGravada > 0 ? ["20"] : null,
      };
    });

    // ── 15. Calcular totales del resumen ──────────────────────────
    let totalNoSuj   = 0;
    let totalExenta  = 0;
    let totalGravada = 0;
    let descuGravada = 0;
    let descuExenta  = 0;

    for (const item of cuerpoDocumento) {
      totalNoSuj   += item.ventaNoSuj;
      totalExenta  += item.ventaExenta;
      totalGravada += item.ventaGravada;
      if (item.ventaGravada > 0) {
        descuGravada += item.montoDescu;
      } else {
        descuExenta += item.montoDescu;
      }
    }
    totalNoSuj   = r2(totalNoSuj);
    totalExenta  = r2(totalExenta);
    totalGravada = r2(totalGravada);
    descuGravada = r2(descuGravada);
    descuExenta  = r2(descuExenta);
    const totalDescu     = r2(descuGravada + descuExenta);
    const subTotalVentas = r2(totalNoSuj + totalExenta + totalGravada);
    const subTotal       = r2(subTotalVentas - totalDescu);

    // IVA NC 05: base gravada * 0.13 (mismo cálculo que CCFE 03)
    const ivaCalculado       = r2(totalGravada * 0.13);
    const montoTotalOperacion = r2(subTotal + ivaCalculado);

    // ── 16. Construir resumen (NC 05 no incluye totalIva/totalPagar/pagos) ──
    const resumen = {
      totalNoSuj,
      totalExenta,
      totalGravada,
      subTotalVentas,
      descuNoSuj:   0,
      descuExenta,
      descuGravada,
      totalDescu,
      tributos: ivaCalculado > 0
        ? [{ codigo: "20", descripcion: "Impuesto al Valor Agregado 13%", valor: ivaCalculado }]
        : null,
      subTotal,
      ivaPerci1:            0,
      ivaRete1:             0,
      reteRenta:            0,
      montoTotalOperacion,
      totalLetras:          numeroALetras(montoTotalOperacion),
      condicionOperacion:   1,
      // NO incluye: totalIva, porcentajeDescuento, totalNoGravado,
      //             totalPagar, saldoFavor, pagos, numPagoElectronico
    };

    // ── 17. Ensamblar json_document completo ──────────────────────
    const jsonDocument = {
      identificacion,
      documentoRelacionado,
      emisor,
      receptor,
      ventaTercero: null,
      cuerpoDocumento,
      resumen,
      extension:    null,
      apendice:     null,
    };

    // ── 18. Persistir: guardar JSON y cambiar estado ──────────────
    await prisma.dteOutgoingDocument.update({
      where: { id: dteDocumentId },
      data:  {
        json_document: jsonDocument as unknown as Prisma.InputJsonValue,
        dte_status:    "GENERATED",
        generated_at:  now,
        updated_by:    userId,
      },
    });

    return {
      ok:             true,
      dteStatus:      "GENERATED",
      dteDocumentId,
      controlNumber:  ncDoc.control_number!,
      generationCode: ncDoc.generation_code!,
    };

  } catch (error) {
    if (error instanceof NcJsonBusinessError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
