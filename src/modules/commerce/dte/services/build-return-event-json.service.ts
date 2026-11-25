// ─────────────────────────────────────────────────────────────────
// commerce/dte — build-return-event-json.service.ts
//
// MH20 (Fase 6, IMP20-022) — builder puro del Evento de Retorno (tipo 18,
// versión 1, v2_0/fe-eret-v1.json). MH20-058/059/060/061.
//
// Reglas aplicadas (fuente):
//   R20-RET-01  solo FE 01 / FEXE 11 / FSEE 14 con sello (MH20-058; MF X cond. 6)
//   R20-RET-02  un solo tipo de documento por evento; ≤ 50 documentos, cada
//               codigoGeneracion una sola vez (MF X cond. 2; schema maxItems)
//   R20-RET-03  ≤ 2000 ítems; numItem 1..n; cada ítem referencia un
//               documento relacionado (schema; N2.0 13.3.1)
//   R20-RET-04  mismo emisor, receptor y tercero en todos los documentos (MF X cond. 3)
//   R20-RET-05  FEXE: país, régimen, recinto y tipo de exportación iguales
//               al DTE y entre documentos (MF X nota; MH20-061)
//   R20-RET-06  fecha del evento ≥ fecha de generación de cada DTE (MF X fechas, 2)
//   R20-RET-07  códigos MH de establecimiento/punto de venta (MH20-006)
//   R20-RET-08  importes: los recibe ya validados contra el saldo elegible
//               (create-return-event.service.ts); aquí se re-verifica que
//               cada línea exista y no supere la línea original.
//   R20-RET-09  retenciones / seguro / flete del DTE original distintos de 0
//               → bloqueo: no hay regla oficial de prorrateo (RET-ALLOC-PENDING).
//   tipoOperacion 1 (transmisión normal) únicamente: el Retorno en
//   contingencia depende de la Contingencia 2.0 (INC-005, bloqueada).
//
// Fórmulas del resumen (PROVISIONAL — RET-FORMULAS; sin regla oficial
// publicada campo a campo): totales = suma de los ítems; subTotalVentas =
// noSuj + exenta + gravada; montoTotalOperacion = subTotalVentas +
// totalCompraExcluidos; totalPagar = montoTotalOperacion + totalNoGravado −
// ivaRete − reteRenta (retenciones = 0, ver R20-RET-09).
//
// NO modifica el JSON firmado del DTE original. NO es una invalidación.
// NO firma, NO transmite, NO toca Prisma.
// ─────────────────────────────────────────────────────────────────

import { normalizeNitForDte } from "../utils/fiscal-id.utils";
import { numeroALetras } from "../utils/numero-a-letras";
import { validateMhEventJson } from "../spec/validate-mh-event-json";
import { mh20EventIssuerCodesError } from "./build-invalidation-event-json.v3";
import {
  RETURN_MAX_DOCUMENTS,
  RETURN_MAX_ITEMS,
  isReturnEligibleDteType,
  type BuildReturnEventJsonResult,
  type ReturnEventJsonParams,
} from "../types/dte-return-event-json.types";
import {
  readReturnOriginLine,
  returnExcessFields,
  returnedBaseAmount,
  round2,
  round8,
} from "../utils/dte-return-balance";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const UUID_RE = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/;

function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

const fail = (code: string, error: string): BuildReturnEventJsonResult => ({ ok: false, code, error });

/** Receptor del DTE original con la forma de la sección "documento" del Retorno. */
function originReceptor(doc: Obj, type: string): Obj | null {
  const r = type === "14" ? (doc.sujetoExcluido ?? doc.receptor) : doc.receptor;
  if (!isObj(r)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    tipoDocumento: str(r.tipoDocumento) ?? (str(r.nit) ? "36" : null),
    numDocumento:  str(r.numDocumento) ?? str(r.nit),
    nombre:        str(r.nombre),
    codPais:       type === "11" ? str(r.codPais) : null,
    nombrePais:    type === "11" ? str(r.nombrePais) : null,
    telefono:      str(r.telefono),
    correo:        str(r.correo),
  };
}

const FEX_EMISOR_FIELDS = ["recintoFiscal", "tipoRegimen", "regimen", "tipoItemExpor"] as const;

export function buildReturnEventJson(params: ReturnEventJsonParams): BuildReturnEventJsonResult {
  const { issuerConfig, originType, documents, lines, eventGenerationCode, now = new Date() } = params;
  const warnings: string[] = [];

  // ── Emisor ──────────────────────────────────────────────────────
  if (!issuerConfig.nit || !issuerConfig.name) return fail("R20-RET-07", "El emisor DTE no tiene NIT o nombre configurado.");
  const codesError = mh20EventIssuerCodesError(issuerConfig);
  if (codesError) return fail("R20-RET-07", codesError);

  // ── Tipo y documentos ───────────────────────────────────────────
  if (!isReturnEligibleDteType(originType)) {
    return fail("R20-RET-01", `El Evento de Retorno solo aplica a FE (01), FEXE (11) y FSEE (14); tipo recibido "${originType}".`);
  }
  if (documents.length < 1 || documents.length > RETURN_MAX_DOCUMENTS) {
    return fail("R20-RET-02", `El Retorno debe relacionar entre 1 y ${RETURN_MAX_DOCUMENTS} documentos.`);
  }
  const seen = new Set<string>();
  for (const d of documents) {
    if (d.dteTypeCode !== originType) return fail("R20-RET-02", "Todos los documentos del Retorno deben ser del mismo tipo.");
    const g = d.generationCode.toUpperCase();
    if (seen.has(g)) return fail("R20-RET-02", `El código de generación ${g} se repite en el evento.`);
    seen.add(g);
    if (!d.receptionStamp || !/^[A-Z0-9]{40}$/.test(d.receptionStamp)) {
      return fail("R20-RET-01", `El DTE ${g} no tiene sello de recepción válido: no se le puede aplicar Retorno.`);
    }
    if (!isObj(d.jsonDocument)) return fail("R20-RET-01", `El DTE ${g} no tiene json_document legible.`);
  }
  if (lines.length < 1 || lines.length > RETURN_MAX_ITEMS) {
    return fail("R20-RET-03", `El Retorno debe tener entre 1 y ${RETURN_MAX_ITEMS} ítems.`);
  }
  const evtCode = eventGenerationCode.toUpperCase();
  if (!UUID_RE.test(evtCode)) return fail("R20-RET-03", "eventGenerationCode no tiene formato UUID en mayúsculas.");

  const docs = documents.map((d) => ({ ...d, json: d.jsonDocument as Obj }));
  const byId = new Map(docs.map((d) => [d.dteDocumentId, d]));

  // ── Emisor / receptor / tercero idénticos (R20-RET-04) ──────────
  const first = docs[0].json;
  const sig = (d: Obj) => JSON.stringify({
    emisorNit: isObj(d.emisor) ? d.emisor.nit : null,
    receptor:  originReceptor(d, originType),
    ventaTercero:  d.ventaTercero ?? null,
  });
  const firstSig = sig(first);
  for (const d of docs) {
    if (sig(d.json) !== firstSig) {
      return fail("R20-RET-04", "Todos los DTE del Retorno deben corresponder al mismo emisor, receptor y tercero.");
    }
  }
  const issuerNit = normalizeNitForDte(issuerConfig.nit) ?? issuerConfig.nit;
  if (isObj(first.emisor) && typeof first.emisor.nit === "string" && first.emisor.nit !== issuerNit) {
    return fail("R20-RET-04", "El emisor del Retorno no coincide con el emisor de los DTE relacionados.");
  }

  // ── FEXE: datos de exportación (R20-RET-05) ─────────────────────
  let fexEmisor: Record<(typeof FEX_EMISOR_FIELDS)[number], unknown> = {
    recintoFiscal: null, tipoRegimen: null, regimen: null, tipoItemExpor: null,
  };
  if (originType === "11") {
    const e = isObj(first.emisor) ? first.emisor : {};
    fexEmisor = {
      recintoFiscal: e.recintoFiscal ?? null, tipoRegimen: e.tipoRegimen ?? null,
      regimen: e.regimen ?? null, tipoItemExpor: e.tipoItemExpor ?? null,
    };
    for (const d of docs) {
      const de = isObj(d.json.emisor) ? d.json.emisor : {};
      for (const f of FEX_EMISOR_FIELDS) {
        if ((de[f] ?? null) !== fexEmisor[f]) {
          return fail("R20-RET-05", `FEXE: ${f} debe coincidir en todos los documentos del Retorno (MF 2.0 X, nota).`);
        }
      }
    }
    if (fexEmisor.tipoItemExpor !== 1 && fexEmisor.tipoItemExpor !== 2) {
      return fail(
        "R20-RET-05",
        "FEXE con tipoItemExpor distinto de 1 o 2: el tipo de ítem de cada línea del Retorno no es derivable del documento.",
      );
    }
  }

  // ── Retenciones / seguro / flete sin regla de prorrateo (R20-RET-09) ─
  for (const d of docs) {
    const r = isObj(d.json.resumen) ? d.json.resumen : {};
    const nonZero = ["ivaRete1", "ivaRete", "reteRenta", "ivaPerci1", "ivaPerci", "seguro", "flete"]
      .filter((k) => typeof r[k] === "number" && (r[k] as number) !== 0);
    if (nonZero.length > 0) {
      return fail(
        "RET-ALLOC-PENDING",
        `El DTE ${d.generationCode} tiene ${nonZero.join(", ")} distinto de 0; no existe regla oficial confirmada ` +
        "para prorratearlo en el Retorno. Operación bloqueada.",
      );
    }
  }

  // ── Fecha del evento (R20-RET-06) ───────────────────────────────
  const { date: fecEmi, time: horEmi } = svDateTime(now);
  for (const d of docs) {
    const f = isObj(d.json.identificacion) ? d.json.identificacion.fecEmi : null;
    if (typeof f !== "string") return fail("R20-RET-06", `El DTE ${d.generationCode} no tiene fecha de generación.`);
    if (fecEmi < f) return fail("R20-RET-06", `La fecha del evento (${fecEmi}) antecede a la fecha de generación del DTE (${f}).`);
  }

  // ── Ítems (R20-RET-03 / R20-RET-08) ─────────────────────────────
  const usedDocs = new Set<string>();
  const lineKeys = new Set<string>();
  const cuerpoDocumento: Obj[] = [];
  let numItem = 0;
  for (const l of lines) {
    const d = byId.get(l.dteDocumentId);
    if (!d) return fail("R20-RET-03", "Una línea del Retorno referencia un documento no relacionado en el evento.");
    const key = `${l.dteDocumentId}#${l.sourceItemNo}`;
    if (lineKeys.has(key)) return fail("R20-RET-03", `La línea ${l.sourceItemNo} del DTE ${d.generationCode} se repite en el evento.`);
    lineKeys.add(key);
    const orig = readReturnOriginLine(d.json, l.sourceItemNo);
    if (!orig) return fail("R20-RET-08", `El DTE ${d.generationCode} no tiene la línea numItem ${l.sourceItemNo}.`);
    if (!(l.amounts.quantity > 0)) return fail("R20-RET-08", "La cantidad devuelta debe ser mayor que 0.");
    const excess = returnExcessFields(l.amounts, orig);
    if (excess.length > 0) {
      return fail("R20-RET-08", `La línea ${l.sourceItemNo} del DTE ${d.generationCode} excede la línea original: ${excess.join("; ")}.`);
    }
    const tipoItem = originType === "11" ? (fexEmisor.tipoItemExpor as number) : orig.tipoItem;
    if (tipoItem === null) return fail("R20-RET-08", `La línea ${l.sourceItemNo} del DTE original no declara tipoItem.`);
    usedDocs.add(l.dteDocumentId);
    numItem += 1;
    cuerpoDocumento.push({
      numItem,
      tipoItem,
      codigoGeneracion: d.generationCode.toUpperCase(),
      cantidad:     round8(l.amounts.quantity),
      precioUni:    orig.precioUni,
      descripcion:  orig.descripcion,
      codigo:       orig.codigo,
      uniMedida:    orig.uniMedida,
      montoDescu:   round2(l.amounts.montoDescu),
      codTributo:   orig.codTributo,
      ventaNoSuj:   round2(l.amounts.ventaNoSuj),
      ventaExenta:  round2(l.amounts.ventaExenta),
      ventaGravada: round2(l.amounts.ventaGravada),
      compra:       round2(l.amounts.compra),
      tributos:     orig.tributos,
      psv:          orig.psv,
      ivaItem:      round2(l.amounts.ivaItem),
      noGravado:    round2(l.amounts.noGravado),
      seguro:       0,
      flete:        0,
      ivaRete:      0,
      reteRenta:    0,
    });
  }
  for (const d of docs) {
    if (!usedDocs.has(d.dteDocumentId)) {
      return fail("R20-RET-03", `El DTE ${d.generationCode} está relacionado pero no tiene ítems retornados.`);
    }
  }

  // ── Resumen (PROVISIONAL, RET-FORMULAS) ─────────────────────────
  const sum = (k: string) => round2(cuerpoDocumento.reduce((a, it) => a + (it[k] as number), 0));
  const totalNoSuj = sum("ventaNoSuj"), totalExenta = sum("ventaExenta"), totalGravada = sum("ventaGravada");
  const totalCompraExcluidos = sum("compra");
  const subTotalVentas = round2(totalNoSuj + totalExenta + totalGravada);
  const montoTotalOperacion = round2(subTotalVentas + totalCompraExcluidos);
  const totalNoGravado = sum("noGravado");
  const totalPagar = round2(montoTotalOperacion + totalNoGravado);
  warnings.push("PROVISIONAL (RET-FORMULAS): fórmulas del resumen del Retorno sin regla oficial campo a campo.");

  // Suma por documento ≤ totalPagar del DTE (MH20-059) — re-verificación local.
  for (const d of docs) {
    const r = isObj(d.json.resumen) ? d.json.resumen : {};
    const docTotal = typeof r.totalPagar === "number" ? r.totalPagar : typeof r.totalCompra === "number" ? r.totalCompra : null;
    const items = lines.filter((l) => l.dteDocumentId === d.dteDocumentId);
    const ret = round2(items.reduce((a, l) => a + returnedBaseAmount(l.amounts) + l.amounts.noGravado, 0));
    if (docTotal !== null && ret - docTotal > 0.0049) {
      return fail("R20-RET-08", `El Retorno (${ret}) excede el valor del DTE ${d.generationCode} (${docTotal}).`);
    }
  }

  const eventJson: Obj = {
    identificacion: {
      version:          1,
      ambiente:         issuerConfig.environment === "PRODUCTION" ? "01" : "00",
      tipoModelo:       1,
      tipoOperacion:    1,
      tipoEvento:       "18",
      tipoContingencia: null,
      motivoContin:     null,
      codigoGeneracion: evtCode,
      fecEmi,
      horEmi,
      fusion:           null,
      tipoMoneda:       "USD",
    },
    documentoRelacionado: docs.map((d) => ({
      tipoDocumento:    originType,
      codigoGeneracion: d.generationCode.toUpperCase(),
      fechaEmision:     (d.json.identificacion as Obj).fecEmi,
    })),
    emisor: {
      nit:             issuerNit,
      nombre:          issuerConfig.name,
      codEstableMH:    issuerConfig.cod_estable_mh,
      codEstable:      issuerConfig.establishment_code ?? null,
      codPuntoVentaMH: issuerConfig.cod_punto_venta_mh,
      codPuntoVenta:   issuerConfig.point_of_sale_code ?? null,
      ...fexEmisor,
    },
    documento:     originReceptor(first, originType),
    ventaTercero:  first.ventaTercero ?? null,
    compraTercero: null,
    cuerpoDocumento,
    resumen: {
      totalNoSuj, totalExenta, totalGravada, totalCompraExcluidos, subTotalVentas,
      tributos:        null,
      totalSeguro:     null,
      totalFlete:      null,
      montoTotalOperacion,
      ivaRete:         0,
      reteRenta:       0,
      totalNoGravado,
      totalPagar,
      totalLetras:     numeroALetras(totalPagar),
      totalNoOnerosas: 0,
      totalIva:        sum("ivaItem"),
      saldoFavor:      0,
    },
    apendice: null,
  };

  const check = validateMhEventJson("18", eventJson);
  if (!check.ok) {
    return fail(
      "AJV",
      `El JSON del Evento de Retorno no cumple el schema MH (fe-eret-v1). Errores: ` +
      check.validation_errors.map((e) => `${e.path}: ${e.message}`).join(" | "),
    );
  }
  return { ok: true, eventJson, totalReturned: totalPagar, warnings };
}
