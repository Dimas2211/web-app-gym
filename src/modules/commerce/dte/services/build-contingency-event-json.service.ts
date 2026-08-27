// ─────────────────────────────────────────────────────────────────
// commerce/dte — build-contingency-event-json.service.ts
//
// buildContingencyEventJson — construye y valida contra el schema MH
// el JSON del Evento de Contingencia (contingencia-schema-v3.json).
//
// Reglas críticas:
//   - version siempre 3.
//   - identificacion.codigoGeneracion = codigoGeneracion del propio Evento
//     (NO el de ningún DTE reportado).
//   - emisor exige nombreResponsable/tipoDocResponsable/numeroDocResponsable
//     — a diferencia de invalidación, este bloque vive dentro de "emisor",
//     no dentro de "motivo". No hay fuente persistida hoy para esos tres
//     campos (ver ContingencyResponsable) — el caller los provee, igual que
//     Invalidación hace con InvalidationPersona.
//   - emisor.telefono/correo son obligatorios y NO admiten null en este
//     schema (v3), a diferencia de anulacion-schema-v2.
//   - detalleDTE se construye EXCLUSIVAMENTE a partir de los items ya
//     validados por el caller (create-contingency-event.service.ts) —
//     este builder no valida pertenencia a tenant/location/período; solo
//     ensambla y corre AJV.
//   - NO firma. NO transmite. NO toca Prisma.
// ─────────────────────────────────────────────────────────────────

import Ajv        from "ajv";
import addFormats from "ajv-formats";

import contingenciaSchema from "../schemas/mh/contingencia-schema-v3.json";
import {
  normalizeNitForDte,
  removeNonDigits,
}                          from "../utils/fiscal-id.utils";
import type {
  ContingencyEventJsonParams,
  BuildContingencyEventJsonResult,
}                          from "../types/dte-contingency-event-json.types";

// ── Helpers ───────────────────────────────────────────────────────

// America/El_Salvador = UTC-6, sin DST.
// toLocaleString con "sv-SE" produce "YYYY-MM-DD HH:MM:SS".
function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

// periodStartDate/periodEndDate vienen de columnas @db.Date (sin componente
// de hora relevante) — formatear directo a YYYY-MM-DD sin pasar por
// timezone local evita corrimientos de día.
function dbDateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapAmbiente(env: string): "00" | "01" {
  return env === "PRODUCTION" ? "01" : "00";
}

const UUID_RE = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/;

// ── Función principal ─────────────────────────────────────────────

export function buildContingencyEventJson(
  params: ContingencyEventJsonParams,
): BuildContingencyEventJsonResult {
  const {
    issuerConfig,
    responsable,
    eventGenerationCode,
    contingencyTypeCode,
    reason,
    periodStartDate,
    periodStartTime,
    periodEndDate,
    periodEndTime,
    items,
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

  const rawPhone        = issuerConfig.phone ?? null;
  const normalizedPhone = rawPhone ? removeNonDigits(rawPhone) : null;
  if (!normalizedPhone || normalizedPhone.length < 8) {
    return {
      ok:    false,
      error: "El emisor DTE no tiene un teléfono válido (mínimo 8 dígitos) — el schema de contingencia exige telefono no nulo.",
    };
  }

  // ── 2. Validar responsable ─────────────────────────────────────
  if (!responsable.nombre || responsable.nombre.trim().length < 5) {
    return { ok: false, error: "nombreResponsable debe tener al menos 5 caracteres." };
  }
  if (!responsable.tipoDocumento) {
    return { ok: false, error: "tipoDocResponsable es obligatorio." };
  }
  if (!responsable.numeroDocumento || responsable.numeroDocumento.trim().length < 5) {
    return { ok: false, error: "numeroDocResponsable debe tener al menos 5 caracteres." };
  }

  // ── 3. Validar eventGenerationCode ─────────────────────────────
  const evtCodeUp = eventGenerationCode.toUpperCase();
  if (!UUID_RE.test(evtCodeUp)) {
    return {
      ok:    false,
      error: "eventGenerationCode no tiene formato UUID en mayúsculas (ej. A1B2C3D4-...).",
    };
  }

  // ── 4. Validar items ────────────────────────────────────────────
  if (items.length < 1 || items.length > 1000) {
    return { ok: false, error: "El Evento debe reportar entre 1 y 1000 documentos DTE." };
  }

  // ── 5. Validar tipoContingencia / motivoContingencia ────────────
  const tipoContingencia = Number(contingencyTypeCode);
  if (!Number.isInteger(tipoContingencia) || tipoContingencia < 1 || tipoContingencia > 5) {
    return { ok: false, error: `contingencyTypeCode inválido: "${contingencyTypeCode}".` };
  }

  let motivoContingencia: string | null = null;
  if (tipoContingencia === 5) {
    const trimmed = (reason ?? "").trim();
    if (!trimmed) {
      return {
        ok:    false,
        error: "Para tipoContingencia 5, motivoContingencia es obligatorio y no puede estar vacío.",
      };
    }
    if (trimmed.length > 500) {
      return { ok: false, error: "motivoContingencia no puede superar los 500 caracteres." };
    }
    motivoContingencia = trimmed;
  }

  // ── 6. Validar período ──────────────────────────────────────────
  const fInicio = dbDateToYmd(periodStartDate);
  const fFin    = dbDateToYmd(periodEndDate);
  const startMs = new Date(`${fInicio}T${periodStartTime}Z`).getTime();
  const endMs   = new Date(`${fFin}T${periodEndTime}Z`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, error: "El período de contingencia tiene fecha/hora inválida." };
  }
  if (startMs > endMs) {
    return { ok: false, error: "El período de contingencia tiene inicio posterior al fin." };
  }

  // ── 7. Construir identificacion ─────────────────────────────────
  const { date: fTransmision, time: hTransmision } = svDateTime(now);

  const identificacion = {
    version:          3,
    ambiente:         mapAmbiente(issuerConfig.environment),
    codigoGeneracion: evtCodeUp,
    fTransmision,
    hTransmision,
  };

  // ── 8. Construir emisor ──────────────────────────────────────────
  const emisor: Record<string, unknown> = {
    nit:                  normalizeNitForDte(issuerConfig.nit) ?? issuerConfig.nit,
    nombre:               issuerConfig.name,
    nombreResponsable:    responsable.nombre,
    tipoDocResponsable:   responsable.tipoDocumento,
    numeroDocResponsable: responsable.numeroDocumento,
    tipoEstablecimiento:  issuerConfig.establishment_type_code,
    codEstableMH:         issuerConfig.cod_estable_mh ?? null,
    codPuntoVenta:        issuerConfig.point_of_sale_code ?? issuerConfig.cod_punto_venta_mh ?? null,
    telefono:             normalizedPhone,
    correo:               issuerConfig.email,
  };

  // ── 9. Construir detalleDTE ──────────────────────────────────────
  const detalleDTE = items.map((item) => ({
    noItem:           item.no_item,
    codigoGeneracion: item.generation_code.toUpperCase(),
    tipoDoc:          item.dte_type_code,
  }));

  // ── 10. Construir motivo ──────────────────────────────────────────
  const motivo = {
    fInicio,
    fFin,
    hInicio: periodStartTime,
    hFin:    periodEndTime,
    tipoContingencia,
    motivoContingencia,
  };

  // ── 11. Ensamblar evento completo ─────────────────────────────────
  const eventJson: Record<string, unknown> = {
    identificacion,
    emisor,
    detalleDTE,
    motivo,
  };

  // ── 12. Validar contra schema MH (contingencia-schema-v3.json) ────
  const ajv      = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 2 });
  addFormats(ajv);
  const validate = ajv.compile(contingenciaSchema as object);
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
      error: `El JSON del Evento de Contingencia no cumple el schema MH. Errores: ${msgs.join(" | ")}`,
    };
  }

  return { ok: true, eventJson };
}
