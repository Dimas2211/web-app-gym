// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-contingency-identification.utils.ts
//
// buildContingencyIdentificationBlock — deriva tipoModelo, tipoOperacion,
// tipoContingencia y motivoContin a partir de los campos de contingencia
// persistidos en DteOutgoingDocument (transmission_type_code,
// contingency_type_code, contingency_reason).
//
// Compartido entre generate-fe-json.service.ts y generate-ccfe-json
// .service.ts para no duplicar (ni desalinear) esta regla entre FE 01
// y CCFE 03.
//
// tipoModelo va acoplado a tipoOperacion por el schema JSON oficial del
// MH (identificacion.allOf): tipoOperacion === 1 exige tipoModelo === 1;
// cualquier otro tipoOperacion exige tipoModelo === 2. Por eso este
// helper también decide tipoModelo — no es un campo fiscal adicional
// que se esté tocando fuera de alcance, es la misma regla de
// transmisión normal/contingencia expresada en otro campo del mismo
// bloque identificacion.
// ─────────────────────────────────────────────────────────────────

export interface ContingencyIdentificationBlock {
  tipoModelo:       number;
  tipoOperacion:    number;
  tipoContingencia: number | null;
  motivoContin:     string | null;
}

export type BuildContingencyIdentificationResult =
  | { ok: true; data: ContingencyIdentificationBlock }
  | { ok: false; error: string };

/**
 * @param motivoContinMinLength longitud mínima de motivoContin exigida por
 *   el schema JSON oficial del MH para este tipo de DTE (FE 01: 5, CCFE 03: 1).
 *   El máximo (150) es común a ambos schemas vigentes.
 */
export function buildContingencyIdentificationBlock(params: {
  transmission_type_code: string;
  contingency_type_code:  string | null;
  contingency_reason:     string | null;
  motivoContinMinLength:  number;
}): BuildContingencyIdentificationResult {
  const { transmission_type_code, contingency_type_code, contingency_reason, motivoContinMinLength } = params;

  if (transmission_type_code === "1") {
    return { ok: true, data: { tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null } };
  }

  if (transmission_type_code !== "2") {
    return { ok: false, error: `El documento tiene un transmission_type_code inválido: "${transmission_type_code}".` };
  }

  if (!contingency_type_code) {
    return { ok: false, error: "El documento está marcado como transmisión por contingencia pero no tiene contingency_type_code persistido." };
  }

  const tipoContingencia = Number(contingency_type_code);
  if (!Number.isInteger(tipoContingencia) || tipoContingencia < 1 || tipoContingencia > 5) {
    return { ok: false, error: `El documento tiene un contingency_type_code inválido: "${contingency_type_code}".` };
  }

  let motivoContin: string | null = null;

  if (tipoContingencia === 5) {
    const reason = (contingency_reason ?? "").trim();
    if (!reason) {
      return { ok: false, error: "El documento tiene contingency_type_code \"5\" pero no tiene contingency_reason persistido." };
    }
    if (reason.length < motivoContinMinLength || reason.length > 150) {
      return {
        ok:    false,
        error: `contingency_reason debe tener entre ${motivoContinMinLength} y 150 caracteres para cumplir el schema JSON del MH (longitud actual: ${reason.length}).`,
      };
    }
    motivoContin = reason;
  }

  return { ok: true, data: { tipoModelo: 2, tipoOperacion: 2, tipoContingencia, motivoContin } };
}
