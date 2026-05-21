// ─────────────────────────────────────────────────────────────────
// commerce/dte — build-invalidation-event-json.service.ts
//
// buildInvalidationEventJson — construye y valida contra el schema MH
// el JSON de un evento de invalidación DTE (anulacion-schema-v2.json).
//
// Reglas críticas:
//   - Solo acepta DTE en estado ACCEPTED.
//   - version siempre 2.
//   - codigoGeneracion de identificacion = evento de invalidación (NO el DTE original).
//   - codigoGeneracion de documento      = generation_code del DTE original.
//   - tipoAnulacion 2 → codigoGeneracionR = null obligatorio.
//   - tipoAnulacion 1|3 → codigoGeneracionR = UUID del DTE que reemplaza.
//   - tipoAnulacion 3 → motivoAnulacion obligatorio (min 5 chars).
//   - NO firma. NO transmite. NO toca Prisma. NO modifica DteOutgoingDocument.
// ─────────────────────────────────────────────────────────────────

import Ajv        from "ajv";
import addFormats from "ajv-formats";

import anulacionSchema         from "../schemas/mh/anulacion-schema-v2.json";
import {
  normalizeNitForDte,
  removeNonDigits,
}                              from "../utils/fiscal-id.utils";
import type {
  InvalidationEventJsonParams,
  BuildInvalidationEventJsonResult,
} from "../types/dte-invalidation-event-json.types";

// ── Helpers ───────────────────────────────────────────────────────

// America/El_Salvador = UTC-6, sin DST.
// toLocaleString con "sv-SE" produce "YYYY-MM-DD HH:MM:SS".
function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

function mapAmbiente(env: string): "00" | "01" {
  return env === "PRODUCTION" ? "01" : "00";
}

// Extrae montoIva del resumen según tipo de DTE.
// FE 01: resumen.totalIva
// CCFE 03, NC 05: resumen.tributos[0].valor si existe
function extractMontoIva(
  tipoDte: string,
  resumen: { totalIva?: number | null; tributos?: Array<{ valor?: number }> | null },
): number | null {
  if (tipoDte === "01") {
    return resumen.totalIva ?? null;
  }
  return resumen.tributos?.[0]?.valor ?? null;
}

// UUID uppercase pattern requerido por el schema MH
const UUID_RE = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/;

// ── Función principal ─────────────────────────────────────────────

export function buildInvalidationEventJson(
  params: InvalidationEventJsonParams,
): BuildInvalidationEventJsonResult {
  const {
    issuerConfig,
    dteDocument,
    originalJsonDocument,
    eventGenerationCode,
    invalidationTypeCode,
    reason,
    replacementGenerationCode,
    responsable,
    solicita,
    now = new Date(),
  } = params;

  // ── 1. Validar emisor ──────────────────────────────────────────
  if (!issuerConfig.nit) {
    return { ok: false, error: "El emisor DTE no tiene NIT configurado." };
  }
  if (!issuerConfig.name) {
    return { ok: false, error: "El emisor DTE no tiene nombre configurado." };
  }
  if (!issuerConfig.establishment_type_code) {
    return { ok: false, error: "El emisor DTE no tiene tipoEstablecimiento configurado." };
  }
  if (!issuerConfig.email) {
    return { ok: false, error: "El emisor DTE no tiene correo electrónico configurado." };
  }

  // ── 2. Validar dteDocument ─────────────────────────────────────
  if (dteDocument.dte_status !== "ACCEPTED") {
    return {
      ok:    false,
      error: `El documento DTE debe estar en estado ACCEPTED para invalidar. Estado actual: "${dteDocument.dte_status}".`,
    };
  }
  if (!dteDocument.reception_stamp || dteDocument.reception_stamp.length !== 40) {
    return {
      ok:    false,
      error: "El sello de recepción (reception_stamp) debe tener exactamente 40 caracteres.",
    };
  }
  if (!dteDocument.generation_code) {
    return { ok: false, error: "El documento DTE no tiene codigoGeneracion." };
  }
  if (!dteDocument.control_number) {
    return { ok: false, error: "El documento DTE no tiene numeroControl." };
  }

  // ── 3. Validar json_document original ─────────────────────────
  if (!originalJsonDocument.receptor) {
    return {
      ok:    false,
      error: "El JSON del DTE original no contiene bloque receptor. No se puede construir la invalidación.",
    };
  }
  if (!originalJsonDocument.identificacion?.fecEmi) {
    return { ok: false, error: "El JSON del DTE original no tiene identificacion.fecEmi." };
  }

  // ── 4. Validar eventGenerationCode ────────────────────────────
  const evtCodeUp = eventGenerationCode.toUpperCase();
  if (!UUID_RE.test(evtCodeUp)) {
    return {
      ok:    false,
      error: "eventGenerationCode no tiene formato UUID en mayúsculas (ej. A1B2C3D4-...).",
    };
  }

  // ── 5. Validar tipoAnulacion y replacementGenerationCode ───────
  const tipoAnulacion = parseInt(invalidationTypeCode, 10) as 1 | 2 | 3;

  if (tipoAnulacion !== 2) {
    if (!replacementGenerationCode) {
      return {
        ok:    false,
        error: "Para tipoAnulacion 1 o 3, replacementGenerationCode (UUID del DTE que reemplaza) es obligatorio.",
      };
    }
    const repUp = replacementGenerationCode.toUpperCase();
    if (!UUID_RE.test(repUp)) {
      return { ok: false, error: "replacementGenerationCode no tiene formato UUID válido." };
    }
  }

  if (tipoAnulacion === 3 && (!reason || reason.trim().length < 5)) {
    return {
      ok:    false,
      error: "Para tipoAnulacion 3, motivoAnulacion debe ser un texto de al menos 5 caracteres.",
    };
  }

  // ── 6. Construir identificacion ────────────────────────────────
  const { date: fecAnula, time: horAnula } = svDateTime(now);

  const identificacion = {
    version:          2,
    ambiente:         mapAmbiente(issuerConfig.environment),
    codigoGeneracion: evtCodeUp,
    fecAnula,
    horAnula,
  };

  // ── 7. Construir emisor ────────────────────────────────────────
  // telefono: el schema exige patrón ^[0-9+;]{8,26}$. Normalizamos
  // eliminando guiones (ej. "2222-0000" → "22220000"). Si tras
  // normalizar el valor queda con menos de 8 dígitos, se pasa null
  // (el schema acepta null para telefono).
  const rawPhone      = issuerConfig.phone ?? null;
  const normalizedPhone = rawPhone ? (removeNonDigits(rawPhone) ?? null) : null;
  const emisorTelefono  = normalizedPhone && normalizedPhone.length >= 8
    ? normalizedPhone
    : null;

  const emisor = {
    nit:                 normalizeNitForDte(issuerConfig.nit) ?? issuerConfig.nit,
    nombre:              issuerConfig.name,
    tipoEstablecimiento: issuerConfig.establishment_type_code,
    nomEstablecimiento:  issuerConfig.legal_name ?? issuerConfig.name,
    codEstableMH:        issuerConfig.cod_estable_mh      ?? null,
    codEstable:          issuerConfig.establishment_code  ?? null,
    codPuntoVentaMH:     issuerConfig.cod_punto_venta_mh  ?? null,
    codPuntoVenta:       issuerConfig.point_of_sale_code  ?? null,
    telefono:            emisorTelefono,
    correo:              issuerConfig.email,
  };

  // ── 8. Construir documento ─────────────────────────────────────
  const { receptor: rec, identificacion: idOrig, resumen } = originalJsonDocument;

  const codigoGeneracionR: string | null =
    tipoAnulacion === 2
      ? null
      : replacementGenerationCode!.toUpperCase();

  // Resolver tipoDocumento/numDocumento del receptor.
  // FE 01: el receptor trae tipoDocumento + numDocumento (persona natural).
  // CCFE 03: el receptor puede traer nit + nrc (empresa/NIT, CAT-22 código "36").
  const recTipoDocumento: string | undefined =
    rec.tipoDocumento ?? (rec.nit ? "36" : undefined);
  const recNumDocumento: string | undefined =
    rec.numDocumento  ?? rec.nit ?? undefined;

  if (!recTipoDocumento || !recNumDocumento) {
    return {
      ok:    false,
      error: "El receptor del DTE original no tiene tipoDocumento/numDocumento ni nit. No se puede construir el documento de invalidación.",
    };
  }

  const documentoBase: Record<string, unknown> = {
    tipoDte:          dteDocument.dte_type_code,
    codigoGeneracion: dteDocument.generation_code.toUpperCase(),
    selloRecibido:    dteDocument.reception_stamp,
    numeroControl:    dteDocument.control_number,
    fecEmi:           idOrig.fecEmi,
    montoIva:         extractMontoIva(dteDocument.dte_type_code, resumen),
    codigoGeneracionR,
    tipoDocumento:    recTipoDocumento,
    numDocumento:     recNumDocumento,
    nombre:           rec.nombre,
    telefono:         rec.telefono ?? null,
  };

  // correo en documento es type "string" (no nullable) → incluir solo si existe
  if (rec.correo) {
    documentoBase["correo"] = rec.correo;
  }

  // ── 9. Construir motivo ────────────────────────────────────────
  const motivo = {
    tipoAnulacion,
    motivoAnulacion:   reason ?? null,
    nombreResponsable: responsable.nombre,
    tipDocResponsable: responsable.tipoDocumento,
    numDocResponsable: responsable.numeroDocumento,
    nombreSolicita:    solicita.nombre,
    tipDocSolicita:    solicita.tipoDocumento,
    numDocSolicita:    solicita.numeroDocumento,
  };

  // ── 10. Ensamblar evento completo ──────────────────────────────
  const eventJson: Record<string, unknown> = {
    identificacion,
    emisor,
    documento: documentoBase,
    motivo,
  };

  // ── 11. Validar contra schema MH (anulacion-schema-v2.json) ────
  const ajv      = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(anulacionSchema as object);
  const valid    = validate(eventJson);

  if (!valid && validate.errors && validate.errors.length > 0) {
    const leafErrors = validate.errors.filter((e) => e.keyword !== "if");
    const errorsToShow = leafErrors.length > 0 ? leafErrors : validate.errors;

    const msgs = errorsToShow.map((e) => {
      const path = e.instancePath || "(raíz)";
      let msg = e.message ?? "Error de validación";
      if (
        e.keyword === "additionalProperties" &&
        typeof (e.params as Record<string, unknown>).additionalProperty === "string"
      ) {
        msg = `propiedad adicional no permitida: "${(e.params as Record<string, unknown>).additionalProperty}"`;
      }
      return `${path}: ${msg}`;
    });

    return {
      ok:    false,
      error: `El JSON de invalidación no cumple el schema MH. Errores: ${msgs.join(" | ")}`,
    };
  }

  return { ok: true, eventJson };
}
