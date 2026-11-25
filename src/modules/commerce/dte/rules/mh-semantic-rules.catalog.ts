// ─────────────────────────────────────────────────────────────────
// commerce/dte — rules/mh-semantic-rules.catalog.ts
//
// MH20 (IMP20-020, D8) — clasificación de las restricciones retiradas de
// los JSON Schemas 2.0 (127 condicionales FE/CCF/NC/FSE en 02-schema-diff.json
// + campos eliminados con efecto de regla) y de las reglas de negocio
// confirmadas en la Normativa 2.0.
//
// Estados (BLOQUE 5E):
//   VIGENTE_CONFIRMADA   → texto normativo 2.0 la exige. Se ejecuta como ERROR.
//   MODIFICADA           → vigente con nueva forma 2.0. Se ejecuta como ERROR.
//   ELIMINADA_CONFIRMADA → la normativa la retira expresamente. No se ejecuta.
//   PENDIENTE_ACLARACION → solo la expresaba el schema 1.2, sin cita 2.0
//                          concluyente. Se ejecuta como ADVERTENCIA (no
//                          bloquea, no crea obligaciones por inferencia).
//
// Regla general: ninguna regla pasa a ELIMINADA sin cita normativa. Las
// validaciones del perfil MH_1_2 NO dependen de este catálogo: siguen en
// los schemas históricos, que no se modifican.
//
// Fuentes: docs/fiscal/mh-normativa-2.0/auditoria/{01-matriz-normativa.json,
// 02-schema-diff.json} y markdown/normativa-2.0.md (Anexo II/IV, tabla de
// validaciones p. 119-120, verificada visualmente en Fase 0.1).
// ─────────────────────────────────────────────────────────────────

export type MhSemanticRuleStatus =
  | "VIGENTE_CONFIRMADA"
  | "MODIFICADA"
  | "ELIMINADA_CONFIRMADA"
  | "PENDIENTE_ACLARACION";

export type MhSemanticKind = "01" | "03" | "05" | "14";

/**
 * Fase 5.1C — clasificación individual de las reglas PENDIENTE_ACLARACION:
 *   WARNING          → incertidumbre informativa; Zolvi no produce la condición
 *                      o su efecto fiscal no es crítico. Solo advierte.
 *   BLOCK_EMISSION   → la operación concreta (blockCondition) no tiene validez
 *                      fiscal garantizable con MH_2_0: error que bloquea
 *                      SCHEMA_VALIDATED solo de ese documento.
 *   BLOCK_ACTIVATION → incertidumbre global que impide activar el perfil
 *                      (ninguna de las 8; los bloqueos globales viven en
 *                      MH20-092/093/094 y en el registro de perfiles).
 * Fuera de blockCondition, las sub-condiciones de una regla BLOCK_EMISSION
 * siguen siendo advertencias. Solo aplica a documentos MH_2_0.
 */
export type MhPendingRuleClassification = "WARNING" | "BLOCK_EMISSION" | "BLOCK_ACTIVATION";

export interface MhSemanticRuleDefinition {
  id:       string;
  family:   string;
  kinds:    readonly MhSemanticKind[];
  status:   MhSemanticRuleStatus;
  sch20:    readonly string[];
  mh20:     readonly string[];
  source:   string;
  summary:  string;
  /** Solo reglas PENDIENTE_ACLARACION (Fase 5.1C). */
  classification?: MhPendingRuleClassification;
  /** Condición exacta que bloquea (solo BLOCK_EMISSION). */
  blockCondition?: string;
  /** Justificación de la clasificación (evidencia, no regla legal nueva). */
  rationale?: string;
}

const range = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}-${String(from + i).padStart(3, "0")}`);

export const MH_SEMANTIC_RULES: readonly MhSemanticRuleDefinition[] = Object.freeze([
  // ── Territorio: departamento → municipio (66 bloques if/then) ─────
  {
    id: "R20-TERR-01", family: "direccion.departamento→municipio", kinds: ["01", "03", "05", "14"],
    status: "MODIFICADA",
    sch20: [
      ...range("SCH20", 71, 81), ...range("SCH20", 90, 100),     // FE emisor/receptor
      ...range("SCH20", 191, 201), ...range("SCH20", 208, 218),  // CCF
      ...range("SCH20", 309, 319), ...range("SCH20", 323, 333),  // NC
      ...range("SCH20", 485, 495), ...range("SCH20", 502, 512),  // FSE
    ],
    mh20: ["MH20-075"],
    source: "Normativa 2.0 Anexo II campos 28 y 49 (p. 52, 55): distrito CAT-008 con correspondencia a departamento y municipio",
    summary: "municipio ∈ CAT-013 2.0 del departamento; distrito de 2 dígitos que pertenece al municipio (Cabañas 10=ESTE, 11=OESTE, CAT-013 v1.1; Fase 6.1)",
  },
  // ── Número de control: sección 3 asignada por la AT ───────────────
  {
    id: "R20-EST-01", family: "identificacion.numeroControl (sección 3)", kinds: ["01", "03", "05", "14"],
    status: "VIGENTE_CONFIRMADA",
    sch20: ["SCH20-032", "SCH20-146", "SCH20-278", "SCH20-475"],
    mh20: ["MH20-003", "MH20-077"],
    source: "Normativa 2.0 Anexo I regla 1.3 (p. 37) y Anexo IV campo 5 (p. 102)",
    summary: "posiciones 1-4 = M|S|B|P + 3 dígitos; posiciones 5-8 = P + 3 dígitos",
  },
  // ── NC: documento relacionado obligatorio ─────────────────────────
  {
    id: "R20-NC-01", family: "documentoRelacionado (NC)", kinds: ["05"],
    status: "VIGENTE_CONFIRMADA",
    sch20: ["SCH20-308"], mh20: ["MH20-027", "MH20-038"],
    source: "Normativa 2.0 Anexo I 1.4 lit. B (p. 38) y Anexo IV campos 14-16 (p. 103)",
    summary: "NCE requiere documentoRelacionado con tipo 03-CCF o 07-CR",
  },
  // ── NC: fórmulas del resumen v4 ───────────────────────────────────
  {
    id: "R20-NC-02", family: "resumen (NC v4)", kinds: ["05"],
    status: "MODIFICADA",
    sch20: ["SCH20-334", ...range("SCH20", 242, 248)], mh20: ["MH20-031", "MH20-037"],
    source: "Normativa 2.0 Anexo II campos 98-101, 143-153 y tabla de validaciones campos 145, 146, 150.3, 151, 153.3 (p. 119-120)",
    summary: "totalIva/ivaPerci/ivaRete/totalNoGravado = Σ ítems; totalPagar = MTO + ivaPerci − ivaRete ± totalNoGravado (holgura ±0.01)",
  },
  {
    id: "R20-NC-03", family: "resumen.codigoRetencionMH (NC v4)", kinds: ["05"],
    status: "VIGENTE_CONFIRMADA",
    sch20: ["SCH20-242"], mh20: ["MH20-037"],
    source: "Normativa 2.0 tabla de validaciones campo 144.2 (p. 119)",
    summary: "codigoRetencionMH = null cuando el documento a ajustar es 03-CCFE",
  },
  // ── Total a pagar FE / CCF / FSE ──────────────────────────────────
  {
    id: "R20-TOT-01", family: "resumen.totalPagar", kinds: ["01", "03", "14"],
    status: "MODIFICADA",
    sch20: [], mh20: ["MH20-031", "MH20-032", "MH20-035", "MH20-042"],
    source: "Normativa 2.0 tabla de validaciones campo 153.2/153.4/153.6/153.7/153.8 (p. 120)",
    summary: "FE: MTO − ivaRete ± noGravado; CCF: MTO + ivaPerci − ivaRete ± noGravado; FSE: subTotal − reteRenta (≥ 0, holgura ±0.01)",
  },
  // ── Campos retirados con confirmación normativa ───────────────────
  {
    id: "R20-DEL-01", family: "extension", kinds: ["01", "03", "05", "14"],
    status: "ELIMINADA_CONFIRMADA",
    sch20: ["SCH20-005", "SCH20-106", "SCH20-224"], mh20: ["MH20-026"],
    source: "Normativa 2.0 Anexo VI (p. 136-137) y Anexo I 1.4 lit. M (p. 38)",
    summary: "Sección Extensión eliminada (se sustituye por resumen.observaciones)",
  },
  {
    id: "R20-DEL-02", family: "resumen.reteRenta (FE/CCF/NC)", kinds: ["01", "03", "05"],
    status: "ELIMINADA_CONFIRMADA",
    sch20: ["SCH20-007", "SCH20-109", "SCH20-231"], mh20: ["MH20-032", "MH20-035", "MH20-037"],
    source: "Normativa 2.0 Anexo VI (p. 136-137)",
    summary: "Retención renta eliminada en FE, CCFE y NCE (se mantiene solo en FSEE)",
  },
  {
    id: "R20-DEL-03", family: "resumen.ivaRete1 (FSE)", kinds: ["14"],
    status: "ELIMINADA_CONFIRMADA",
    sch20: ["SCH20-449"], mh20: ["MH20-042"],
    source: "Normativa 2.0 Anexo VI (p. 136-137): FSEE elimina 'IVA Retenido'",
    summary: "IVA retenido eliminado de FSE v2 (una compra con retención 1 % no se emite con MH_2_0)",
  },
  // ── Pendientes de aclaración (advertencias) ───────────────────────
  {
    id: "R20-PEND-01", family: "identificacion tipoOperacion/tipoModelo/tipoContingencia/motivoContin",
    kinds: ["01", "03", "05", "14"], status: "PENDIENTE_ACLARACION",
    sch20: [...range("SCH20", 82, 84), ...range("SCH20", 202, 204), ...range("SCH20", 320, 322), ...range("SCH20", 496, 498)],
    mh20: ["MH20-053"],
    source: "Solo schema 1.2 (CAT-003/004/005). Sin cita 2.0 concluyente para el condicional",
    summary: "tipoOperacion 1 ⇒ tipoModelo 1 sin contingencia; tipoOperacion 2 ⇒ tipoContingencia entero; tipoContingencia 5 ⇒ motivoContin",
    classification: "BLOCK_EMISSION",
    blockCondition: "tipoOperacion = 2 o tipoContingencia no nulo (DTE en contingencia con MH_2_0)",
    rationale: "El Evento de Contingencia 2.0 está bloqueado (INC-005 v3/v4, IMP20-019); un DTE 2.0 en contingencia no puede regularizarse con un evento compatible. El resto de condicionales (tipoModelo/motivoContin) solo advierte.",
  },
  {
    id: "R20-PEND-02", family: "receptor tipoDocumento → formato numDocumento",
    kinds: ["01", "14"], status: "PENDIENTE_ACLARACION",
    sch20: ["SCH20-088", "SCH20-089", "SCH20-500", "SCH20-501"], mh20: [],
    source: "Solo schema 1.2 (SCH20-500/501 clasificados SCHEMA_ONLY)",
    summary: "36 ⇒ NIT de 9 o 14 dígitos; 13 ⇒ DUI ########-#",
    classification: "WARNING",
    rationale: "Formato del documento del receptor: un error lo rechaza MH en recepción (recuperable); el builder normaliza NIT/DUI. Sin impacto fiscal crítico identificado.",
  },
  {
    id: "R20-PEND-03", family: "resumen retenciones con totalGravada = 0",
    kinds: ["01", "03", "05"], status: "PENDIENTE_ACLARACION",
    sch20: ["SCH20-101", "SCH20-220", "SCH20-334"], mh20: [],
    source: "Solo schema 1.2 (aplicado a ivaRete1/ivaPerci1, renombrados en 2.0)",
    summary: "totalGravada ≤ 0 ⇒ ivaRete = 0 e ivaPerci = 0",
    classification: "WARNING",
    rationale: "El builder calcula ivaRete/ivaPerci sobre la base gravada; con totalGravada 0 resultan 0. Condición no producible por Zolvi.",
  },
  {
    id: "R20-PEND-04", family: "resumen condicionOperacion ↔ pagos",
    kinds: ["03", "14"], status: "PENDIENTE_ACLARACION",
    sch20: ["SCH20-219", "SCH20-221", "SCH20-499"], mh20: [],
    source: "Solo schema 1.2",
    summary: "condicionOperacion 2 ⇒ pagos con plazo y periodo; totalPagar 0 ⇒ condicionOperacion 1",
    classification: "WARNING",
    rationale: "Condición de crédito: un error lo rechaza MH en recepción; sin efecto sobre montos. Sin cita 2.0 que cree obligación nueva.",
  },
  {
    id: "R20-PEND-05", family: "observaciones ≤ 3000",
    kinds: ["03", "05"], status: "PENDIENTE_ACLARACION",
    sch20: ["SCH20-114", "SCH20-245"], mh20: ["MH20-026"],
    source: "fe-ccf-v4/fe-nc-v4 usan 'maximum: 3000' (sin efecto en strings); fe-f-v2 usa maxLength 3000",
    summary: "resumen.observaciones con longitud ≤ 3000 (el builder Zolvi recorta a 3000)",
    classification: "WARNING",
    rationale: "Solo observaciones fiscales explícitas (resolveMh20FiscalObservations, 5.1D): > 3000 es error del builder, sin recorte; por defecto null. SCH-INC-002: maximum sobre string sin efecto.",
  },
  {
    id: "R20-PEND-06", family: "cuerpoDocumento tipoItem/ventaGravada → tributos/codTributo/uniMedida",
    kinds: ["01", "03", "05"], status: "PENDIENTE_ACLARACION",
    sch20: ["SCH20-067", "SCH20-068", "SCH20-188", "SCH20-189", "SCH20-306", "SCH20-307"], mh20: [],
    source: "Solo schema 1.2. Zolvi no emite tipoItem 4",
    summary: "ventaGravada 0 ⇒ tributos null; tipoItem 4 ⇒ codTributo y uniMedida 99",
    classification: "WARNING",
    rationale: "FE v2 envía tributos null por línea; CCF solo con IVA > 0. Zolvi no emite tipoItem 4. Condición no producible.",
  },
  {
    id: "R20-PEND-07", family: "documentoRelacionado tipoGeneracion → formato numeroDocumento",
    kinds: ["01", "03", "05"], status: "PENDIENTE_ACLARACION",
    sch20: ["SCH20-069", "SCH20-070", "SCH20-190", "SCH20-308"], mh20: [],
    source: "Solo schema 1.2",
    summary: "tipoGeneracion 2 ⇒ numeroDocumento UUID en mayúsculas; tipoGeneracion 1 ⇒ 1-20 caracteres",
    classification: "BLOCK_EMISSION",
    blockCondition: "documentoRelacionado con tipoGeneracion = 2 y numeroDocumento que no es un código de generación UUID en mayúsculas",
    rationale: "tipoGeneracion 2 (CAT-007) referencia un DTE; su código de generación tiene el patrón fijado por los schemas oficiales 2.0 (identificacion.codigoGeneracion). Un ajuste (NC) que no referencia un DTE identificable no tiene validez garantizable.",
  },
  {
    id: "R20-PEND-08", family: "otrosDocumentos / medico; receptor FE ≥ $1,095",
    kinds: ["01", "03"], status: "PENDIENTE_ACLARACION",
    sch20: ["SCH20-066", ...range("SCH20", 85, 87), ...range("SCH20", 205, 207)], mh20: [],
    source: "Solo schema 1.2 (SCH20-066/086/087 SCHEMA_ONLY). Zolvi envía otrosDocumentos = null",
    summary: "Sin ejecución: Zolvi no emite otrosDocumentos; umbral $1,095 sin cita 2.0",
    classification: "BLOCK_EMISSION",
    blockCondition: "FE 01 con resumen.montoTotalOperacion ≥ 1095.00 y receptor nulo o sin tipoDocumento/numDocumento/nombre",
    rationale: "Restricción histórica del schema FE v1 (SCH20-066) que el schema 2.0 no expresa y la Normativa 2.0 no deroga ni confirma. Emitir sin identificar al receptor no tiene validez garantizable: se conserva la exigencia vigente (no se crea obligación nueva). otrosDocumentos/medico: Zolvi envía null, sin ejecución.",
  },
]);

/** Conteo de SCH20 condicionales cubiertos por la clasificación (trazabilidad). */
export function classifiedSch20Ids(): Set<string> {
  return new Set(MH_SEMANTIC_RULES.flatMap((r) => r.sch20));
}
