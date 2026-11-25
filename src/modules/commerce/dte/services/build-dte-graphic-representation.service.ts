// ─────────────────────────────────────────────────────────────────
// commerce/dte — build-dte-graphic-representation.service.ts
//
// MH20 (Fase 6.1, IMP20-021) — modelo de la REPRESENTACIÓN GRÁFICA
// (versión legible) de documentos y eventos, a partir del JSON firmado.
//
// Fuentes:
//   - MF 2.0 §IV (p.6) y §XXII (pp.58-75): diseño libre "de carácter
//     sugerido", respetando categorías A/B/C/D del Anexo II; las secciones
//     D sin datos se muestran con su nombre y un guion.
//   - MF 2.0 (estructuras, "Sello de Recepción … deberá ser incluido en la
//     Representación Gráfica") y Normativa 2.0 regla 14 (QR o enlace web).
//   - Manual Técnico v2 §5 (p.33): QR →
//     https://admin.factura.gob.sv/consultaPublica?ambiente={ambiente}&codGen={cod}&fechaEmi={fecha}
//   - MF modelo diferido / contingencia: un documento firmado SIN sello se
//     entrega con representación "sin Sello de Recepción" (estado transitorio).
//
// Alcance: FE 01, CCF 03, NC 05, FEX 11, FSE 14, Invalidación (v2/v3) y
// Retorno 18. Lee la versión del propio JSON: los documentos MH 1.2 se
// representan tal como fueron firmados (sin regenerar, sin migrar campos),
// y los 2.0 muestran "Ver.N" según su identificacion.version.
//
// Reglas:
//   - Exige JWS compacto (el documento debe estar firmado): la
//     representación corresponde al archivo firmado, nunca a un borrador.
//   - Exige codigoGeneracion UUID, fecha/hora de generación, emisor
//     (nombre + NIT) y número de control en documentos (no en eventos).
//   - Nunca modifica el JSON; solo lee.
// Puro: sin BD, sin red, sin PDF (ver render-dte-graphic-representation-pdf).
// ─────────────────────────────────────────────────────────────────

import { parsePersistedDteJson } from "../spec/dte-json-version";

export const MH_PUBLIC_QUERY_BASE_URL = "https://admin.factura.gob.sv/consultaPublica";
const JWS_COMPACT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID_RE        = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/i;
const STAMP_RE       = /^[A-Z0-9]{40}$/;

export type GraphicRepresentationKind = "01" | "03" | "05" | "11" | "14" | "INV" | "18";

const TITLES: Record<GraphicRepresentationKind, string> = {
  "01":  "FACTURA",
  "03":  "COMPROBANTE DE CRÉDITO FISCAL",
  "05":  "NOTA DE CRÉDITO",
  "11":  "FACTURA DE EXPORTACIÓN",
  "14":  "FACTURA DE SUJETO EXCLUIDO",
  "INV": "EVENTO DE INVALIDACIÓN",
  "18":  "EVENTO DE RETORNO",
};

const DOC_ID_LABELS: Record<string, string> = {
  "36": "NIT", "13": "DUI", "37": "Otro", "03": "Pasaporte", "02": "Carnet de Residente",
};
const CONDICION_LABELS: Record<string, string> = { "1": "Contado", "2": "A crédito", "3": "Otro" };
const MODELO_LABELS: Record<string, string>    = { "1": "Previo", "2": "Diferido" };
const OPERACION_LABELS: Record<string, string> = { "1": "Normal", "2": "Contingencia" };
const ANULACION_LABELS: Record<string, string> = {
  "1": "Error en la información del documento",
  "2": "Rescindir la operación realizada",
  "3": "Otro",
};

/** Etiquetas del resumen en el orden sugerido por el MF (solo las presentes). */
const RESUMEN_LABELS: ReadonlyArray<[string, string]> = [
  ["totalNoSuj", "Ventas no sujetas"], ["totalExenta", "Ventas exentas"], ["totalGravada", "Ventas gravadas"],
  ["totalCompra", "Total de compras"], ["subTotalVentas", "Sumatoria de ventas"],
  ["descuNoSuj", "Descuento global a ventas no sujetas"], ["descuExenta", "Descuento global a ventas exentas"],
  ["descuGravada", "Descuento global a ventas gravadas"], ["descu", "Descuento"], ["totalDescu", "Total descuentos"],
  ["subTotal", "Sub-Total"], ["totalIva", "IVA incluido"], ["ivaPerci1", "IVA percibido"], ["ivaRete1", "IVA retenido"],
  ["reteRenta", "Retención de renta"], ["seguro", "Seguro"], ["flete", "Flete"],
  ["montoTotalOperacion", "Monto total de la operación"], ["totalNoGravado", "Total otros montos no afectos"],
  ["totalPagar", "Total a pagar"],
];

export interface RepresentationSection {
  heading: string;
  /** Pares etiqueta/valor; valor "-" cuando la sección D no se usó. */
  rows:    Array<[string, string]>;
}

export interface RepresentationTable {
  heading: string;
  columns: string[];
  rows:    string[][];
}

export interface DteGraphicRepresentation {
  kind:            GraphicRepresentationKind;
  title:           string;
  versionLabel:    string;
  /** "SELLADO" o "TRANSITORIO" (firmado, sin Sello de Recepción). */
  stampStatus:     "SELLADO" | "TRANSITORIO";
  codigoGeneracion: string;
  fechaEmision:    string;
  ambiente:        "00" | "01";
  qrUrl:           string;
  sections:        RepresentationSection[];
  tables:          RepresentationTable[];
  totals:          Array<[string, string]>;
  notes:           string[];
  fileName:        string;
}

export type BuildGraphicRepresentationResult =
  | { ok: true; representation: DteGraphicRepresentation }
  | { ok: false; code: "INVALID_DOCUMENT" | "NOT_SIGNED" | "MISSING_FIELDS" | "UNSUPPORTED_KIND"; error: string };

export interface BuildGraphicRepresentationParams {
  kind:           string;
  jsonDocument:   unknown;
  signedJws:      string | null;
  receptionStamp: string | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (v === null || v === undefined || v === "" ? "-" : String(v));
const money = (v: unknown): string => (typeof v === "number" ? `$${v.toFixed(2)}` : str(v));

function idLabel(tipo: unknown): string {
  return typeof tipo === "string" ? (DOC_ID_LABELS[tipo] ?? `Documento (${tipo})`) : "Documento";
}

function address(d: unknown): string {
  if (!isObj(d)) return "-";
  const parts = [d.complemento, d.distrito != null ? `Distrito ${d.distrito}` : null, d.municipio != null ? `Municipio ${d.municipio}` : null, d.departamento != null ? `Depto. ${d.departamento}` : null]
    .filter((x) => x !== null && x !== undefined && x !== "");
  return parts.length ? parts.join(", ") : "-";
}

export function buildMhPublicQueryUrl(ambiente: string, codigoGeneracion: string, fechaEmi: string): string {
  const qs = new URLSearchParams({ ambiente, codGen: codigoGeneracion.toUpperCase(), fechaEmi });
  return `${MH_PUBLIC_QUERY_BASE_URL}?${qs.toString()}`;
}

function partySection(heading: string, p: unknown, opts: { withNit?: boolean } = {}): RepresentationSection {
  if (!isObj(p)) return { heading, rows: [["Nombre", "-"]] };
  const rows: Array<[string, string]> = [["Nombre", str(p.nombre)]];
  if (p.nit !== undefined || opts.withNit) rows.push(["NIT", str(p.nit)]);
  if (p.tipoDocumento !== undefined) rows.push([`Tipo de doc. de identificación`, idLabel(p.tipoDocumento)], ["N° de doc. de identificación", str(p.numDocumento)]);
  if (p.nrc !== undefined) rows.push(["NRC", str(p.nrc)]);
  if (p.descActividad !== undefined) rows.push(["Actividad económica", str(p.descActividad)]);
  if (p.direccion !== undefined) rows.push(["Dirección", address(p.direccion)]);
  if (p.nombrePais !== undefined) rows.push(["País", str(p.nombrePais)]);
  if (p.complemento !== undefined && p.direccion === undefined) rows.push(["Dirección", str(p.complemento)]);
  if (p.telefono !== undefined) rows.push(["Teléfono", str(p.telefono)]);
  if (p.correo !== undefined) rows.push(["Correo electrónico", str(p.correo)]);
  if (p.nombreComercial !== undefined) rows.push(["Nombre comercial", str(p.nombreComercial)]);
  if (p.recintoFiscal !== undefined) rows.push(["Recinto fiscal", str(p.recintoFiscal)]);
  if (p.regimen !== undefined) rows.push(["Régimen de exportación", str(p.regimen)]);
  if (p.tipoRegimen !== undefined) rows.push(["Tipo de régimen", str(p.tipoRegimen)]);
  return { heading, rows };
}

function relatedDocsSection(doc: Obj): RepresentationSection {
  const rel = Array.isArray(doc.documentoRelacionado) ? doc.documentoRelacionado.filter(isObj) : [];
  if (rel.length === 0) return { heading: "DOCUMENTOS RELACIONADOS", rows: [["Documentos relacionados", "-"]] };
  return {
    heading: "DOCUMENTOS RELACIONADOS",
    rows: rel.map((r, i): [string, string] => [
      `Documento ${i + 1}`,
      `Tipo ${str(r.tipoDocumento)} · N° ${str(r.numeroDocumento)} · Fecha ${str(r.fechaEmision)}`,
    ]),
  };
}

function thirdPartySection(doc: Obj): RepresentationSection {
  const t = isObj(doc.ventaTercero) ? doc.ventaTercero : null;
  return { heading: "VENTA POR CUENTA DE TERCEROS", rows: t ? [["NIT", str(t.nit)], ["Nombre del tercero", str(t.nombre)]] : [["Venta por cuenta de terceros", "-"]] };
}

function otherDocsSection(doc: Obj): RepresentationSection {
  const o = Array.isArray(doc.otrosDocumentos) ? doc.otrosDocumentos.filter(isObj) : [];
  if (o.length === 0) return { heading: "OTROS DOCUMENTOS ASOCIADOS", rows: [["Otros documentos asociados", "-"]] };
  return {
    heading: "OTROS DOCUMENTOS ASOCIADOS",
    rows: o.map((d, i): [string, string] => [`Documento ${i + 1}`, `${str(d.codDocAsociado)} · ${str(d.descDocumento)} · ${str(d.detalleDocumento)}`]),
  };
}

function bodyTable(kind: GraphicRepresentationKind, doc: Obj): RepresentationTable {
  const items = Array.isArray(doc.cuerpoDocumento) ? doc.cuerpoDocumento.filter(isObj) : [];
  if (kind === "14") {
    return {
      heading: "CUERPO",
      columns: ["N°", "Cantidad", "Unidad", "Código", "Descripción", "Precio unitario", "Descuento", "Compra"],
      rows: items.map((i) => [str(i.numItem), str(i.cantidad), str(i.uniMedida), str(i.codigo), str(i.descripcion), money(i.precioUni), money(i.montoDescu), money(i.compra)]),
    };
  }
  if (kind === "11") {
    return {
      heading: "CUERPO",
      columns: ["N°", "Cantidad", "Unidad", "Código", "Descripción", "Precio unitario", "Descuento", "Otros no afectos", "Ventas gravadas"],
      rows: items.map((i) => [str(i.numItem), str(i.cantidad), str(i.uniMedida), str(i.codigo), str(i.descripcion), money(i.precioUni), money(i.montoDescu), money(i.noGravado), money(i.ventaGravada)]),
    };
  }
  const cols = ["N°", "Cantidad", "Unidad", "Código", "Descripción", "Precio unitario", "Descuento", "No sujetas", "Exentas", "Gravadas"];
  if (kind === "18") cols.splice(1, 0, "Código de generación del DTE");
  return {
    heading: "CUERPO",
    columns: cols,
    rows: items.map((i) => {
      const base = [str(i.numItem), str(i.cantidad), str(i.uniMedida), str(i.codigo), str(i.descripcion), money(i.precioUni), money(i.montoDescu), money(i.ventaNoSuj), money(i.ventaExenta), money(i.ventaGravada)];
      if (kind === "18") base.splice(1, 0, str(i.codigoGeneracion));
      return base;
    }),
  };
}

function totalsOf(doc: Obj): Array<[string, string]> {
  const r = isObj(doc.resumen) ? doc.resumen : {};
  const out: Array<[string, string]> = [];
  for (const [k, label] of RESUMEN_LABELS) if (r[k] !== undefined && r[k] !== null) out.push([label, money(r[k])]);
  const tributos = Array.isArray(r.tributos) ? r.tributos.filter(isObj) : [];
  for (const t of tributos) out.push([str(t.descripcion), money(t.valor)]);
  if (r.totalLetras !== undefined) out.push(["Valor en letras", str(r.totalLetras)]);
  if (r.condicionOperacion !== undefined) out.push(["Condición de la operación", CONDICION_LABELS[String(r.condicionOperacion)] ?? str(r.condicionOperacion)]);
  return out;
}

function observationsOf(doc: Obj): string {
  const ext = isObj(doc.extension) ? doc.extension : null;
  const res = isObj(doc.resumen) ? doc.resumen : null;
  const o = res?.observaciones ?? ext?.observaciones ?? null;
  return str(o);
}

function asKind(k: string): GraphicRepresentationKind | null {
  return (["01", "03", "05", "11", "14", "INV", "18"] as const).includes(k as GraphicRepresentationKind) ? (k as GraphicRepresentationKind) : null;
}

export function buildDteGraphicRepresentation(p: BuildGraphicRepresentationParams): BuildGraphicRepresentationResult {
  const kind = asKind(p.kind);
  if (!kind) return { ok: false, code: "UNSUPPORTED_KIND", error: `No hay representación gráfica para el tipo "${p.kind}".` };
  const doc = parsePersistedDteJson(p.jsonDocument) as Obj | null;
  if (!doc || !isObj(doc.identificacion)) return { ok: false, code: "INVALID_DOCUMENT", error: "El documento no tiene un JSON legible con identificación." };
  if (!p.signedJws || !JWS_COMPACT_RE.test(p.signedJws)) {
    return { ok: false, code: "NOT_SIGNED", error: "La representación gráfica solo se genera para documentos firmados." };
  }
  const id = doc.identificacion as Obj;
  const isEvent = kind === "INV" || kind === "18";
  const codigo = typeof id.codigoGeneracion === "string" ? id.codigoGeneracion : "";
  // Invalidación v2 usa fecAnula/horAnula; v3 y documentos fecEmi/horEmi.
  const fecha = String(id.fecEmi ?? id.fecAnula ?? "");
  const hora  = String(id.horEmi ?? id.horAnula ?? "");
  const emisor = isObj(doc.emisor) ? doc.emisor : null;
  const missing: string[] = [];
  if (!UUID_RE.test(codigo)) missing.push("codigoGeneracion");
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(fecha)) missing.push("fecha de generación");
  if (!hora) missing.push("hora de generación");
  if (!emisor?.nombre || !emisor?.nit) missing.push("emisor (nombre y NIT)");
  if (!isEvent && typeof id.numeroControl !== "string") missing.push("numeroControl");
  if (missing.length) return { ok: false, code: "MISSING_FIELDS", error: `Faltan datos obligatorios para la representación: ${missing.join(", ")}.` };

  const stamped = typeof p.receptionStamp === "string" && STAMP_RE.test(p.receptionStamp);
  const ambiente = id.ambiente === "01" ? "01" : "00";
  const version = typeof id.version === "number" ? id.version : Number(id.version ?? NaN);
  const sections: RepresentationSection[] = [];
  const tables: RepresentationTable[] = [];
  const notes: string[] = [];

  const identRows: Array<[string, string]> = [["Código de generación", codigo.toUpperCase()]];
  if (!isEvent) identRows.push(["Número de control", str(id.numeroControl)]);
  identRows.push(["Sello de recepción", stamped ? (p.receptionStamp as string) : "SIN SELLO DE RECEPCIÓN (estado transitorio)"]);
  if (id.tipoModelo !== undefined) identRows.push(["Modelo de facturación", MODELO_LABELS[String(id.tipoModelo)] ?? str(id.tipoModelo)]);
  if (id.tipoOperacion !== undefined) identRows.push(["Tipo de transmisión", OPERACION_LABELS[String(id.tipoOperacion)] ?? str(id.tipoOperacion)]);
  identRows.push([isEvent ? "Fecha y hora del evento" : "Fecha y hora de generación", `${fecha} ${hora}`]);
  sections.push({ heading: "IDENTIFICACIÓN", rows: identRows });

  if (kind === "INV") {
    sections.push(partySection("IDENTIFICACIÓN DEL EMISOR", emisor, { withNit: true }));
    const d = isObj(doc.documento) ? doc.documento : {};
    sections.push(partySection("IDENTIFICACIÓN DEL RECEPTOR", { nombre: d.nombre, tipoDocumento: d.tipoDocumento, numDocumento: d.numDocumento, telefono: d.telefono, correo: d.correo }));
    const m = isObj(doc.motivo) ? doc.motivo : {};
    sections.push({
      heading: "INFORMACIÓN RELATIVA AL MOTIVO DE INVALIDACIÓN",
      rows: [
        ["Tipo de invalidación", ANULACION_LABELS[String(m.tipoAnulacion)] ?? str(m.tipoAnulacion)],
        ["Motivo", str(m.motivoAnulacion)],
        ["Nombre de quien solicita", str(m.nombreSolicita)],
        ["Doc. de quien solicita", `${idLabel(m.tipDocSolicita)} ${str(m.numDocSolicita)}`],
        ["Nombre de quien realiza el evento", str(m.nombreResponsable)],
        ["Doc. de quien realiza el evento", `${idLabel(m.tipDocResponsable)} ${str(m.numDocResponsable)}`],
      ],
    });
    tables.push({
      heading: "IDENTIFICACIÓN DEL DOCUMENTO/EVENTO A INVALIDAR",
      columns: ["Tipo DTE/Evento", "Código de generación aplicado", "Sello de recepción", "Número de control", "Fecha de generación"],
      rows: [[str(d.tipoDte), str(d.codigoGeneracion), str(d.selloRecibido), str(d.numeroControl), str(d.fecEmi)]],
    });
    sections.push({ heading: "REEMPLAZO", rows: [["Código de generación que reemplaza al invalidado", str(d.codigoGeneracionR)]] });
  } else {
    sections.push(partySection("EMISOR", emisor, { withNit: true }));
    sections.push(partySection(kind === "14" ? "SUJETO EXCLUIDO" : "RECEPTOR", kind === "14" ? doc.sujetoExcluido : doc.receptor));
    if (kind !== "14") sections.push(thirdPartySection(doc));
    if (kind === "11" && isObj(doc.compraTercero)) {
      sections.push({ heading: "COMPRA POR CUENTA DE TERCEROS", rows: [["N° de doc.", str((doc.compraTercero as Obj).numDocumento)], ["Nombre del tercero", str((doc.compraTercero as Obj).nombre)]] });
    }
    if (kind !== "14") sections.push(relatedDocsSection(doc));
    if (kind !== "05" && kind !== "18") sections.push(otherDocsSection(doc));
    tables.push(bodyTable(kind, doc));
    sections.push({ heading: "OBSERVACIONES", rows: [["Observaciones", observationsOf(doc)]] });
  }

  if (!stamped) {
    notes.push("Documento firmado en estado transitorio: sin Sello de Recepción. Adquiere calidad de DTE al obtenerlo (MF 2.0, modelo diferido / contingencia).");
  }
  if (ambiente === "00") notes.push("Ambiente de PRUEBAS: documento sin validez fiscal.");

  return {
    ok: true,
    representation: {
      kind,
      title: TITLES[kind],
      versionLabel: Number.isFinite(version) ? `Ver.${version}` : "Ver.-",
      stampStatus: stamped ? "SELLADO" : "TRANSITORIO",
      codigoGeneracion: codigo.toUpperCase(),
      fechaEmision: fecha,
      ambiente,
      qrUrl: buildMhPublicQueryUrl(ambiente, codigo, fecha),
      sections,
      tables,
      totals: isEvent && kind === "INV" ? [] : totalsOf(doc),
      notes,
      fileName: `${codigo.toUpperCase()}.pdf`,
    },
  };
}
