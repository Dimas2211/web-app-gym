// ─────────────────────────────────────────────────────────────────
// commerce/dte — build-invalidation-event-json.v3.ts
//
// MH20 (Fase 6, IMP20-018/024) — Evento de Invalidación versión 3
// (v2_0/invalidacion-schema-v3.json, SCH20-513..562, MH20-006/052).
//
// Diferencias con v2 (que sigue intacta en build-invalidation-event-json.service.ts):
//   identificacion : fecAnula/horAnula → fecEmi/horEmi; + fusion (null).
//   emisor         : sin tipoEstablecimiento ni nomEstablecimiento;
//                    codEstableMH y codPuntoVentaMH REQUERIDOS, desde
//                    cod_estable_mh / cod_punto_venta_mh (nunca desde los
//                    códigos internos), con estructura M|S|B|P000 / P000
//                    (MH20-006); telefono requerido (string ≥ 8).
//   documento      : sin montoIva; numeroControl null para eventos
//                    (16/17/18, MH20-046); telefono y correo SIEMPRE
//                    presentes (null si no hay dato).
//   reglas retiradas del schema (tipoAnulacion 2 ⇒ codigoGeneracionR null;
//   1|3 ⇒ UUID; tipoAnulacion ∈ {1,2,3}) → se conservan aquí (D8, KEEP).
//
// Fecha del evento (fecEmi) — Fase 6.1 (INC-006 resuelto documentalmente,
// consultas §8): resolveInvalidationEventDate() → misma fecha que el
// invalidado para tipos distintos de FE/FEXE/FSEE y eventos; fecha actual
// dentro de 3 meses para FE/FEXE/FSEE. horEmi = hora actual SV. Los plazos
// de transmisión (INC-004) siguen en spec/dte-invalidation-deadlines.ts.
//
// Puro: NO firma, NO transmite, NO toca Prisma.
// ─────────────────────────────────────────────────────────────────

import { normalizeNitForDte, removeNonDigits } from "../utils/fiscal-id.utils";
import { validateMhEventJson } from "../spec/validate-mh-event-json";
import { resolveInvalidationEventDate } from "../spec/dte-invalidation-deadlines";
import type {
  BuildInvalidationEventJsonResult,
  DteIssuerConfigForInvalidation,
  InvalidationPersona,
  OriginalDteReceptor,
} from "../types/dte-invalidation-event-json.types";

const UUID_RE = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/;
/** MH20-006: código de establecimiento asignado por MH (M000, S000, B000, P000). */
export const MH20_COD_ESTABLE_RE = /^[MSBP][0-9]{3}$/;
/** MH20-006/077: punto de venta asignado por MH (P000). */
export const MH20_COD_PUNTO_VENTA_RE = /^P[0-9]{3}$/;
/** Tipos de EVENTO invalidables sin número de control (MH20-046; 16 sin definición, INC-015). */
const EVENT_TARGET_TYPES = new Set(["17", "18"]);

function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

function mapAmbiente(env: string): "00" | "01" {
  return env === "PRODUCTION" ? "01" : "00";
}

/** Validación de los códigos MH del emisor para eventos 2.0 (fail-closed). */
export function mh20EventIssuerCodesError(issuer: {
  cod_estable_mh: string | null;
  cod_punto_venta_mh: string | null;
}): string | null {
  if (!issuer.cod_estable_mh || !issuer.cod_punto_venta_mh) {
    return (
      "MH 2.0 exige en los eventos el código de establecimiento y de punto de venta asignados por MH " +
      "(cod_estable_mh / cod_punto_venta_mh). Configúrelos en el emisor DTE antes de generar el evento."
    );
  }
  if (!MH20_COD_ESTABLE_RE.test(issuer.cod_estable_mh)) {
    return `cod_estable_mh "${issuer.cod_estable_mh}" no tiene la estructura M|S|B|P + 3 dígitos exigida por MH 2.0 (MH20-006).`;
  }
  if (!MH20_COD_PUNTO_VENTA_RE.test(issuer.cod_punto_venta_mh)) {
    return `cod_punto_venta_mh "${issuer.cod_punto_venta_mh}" no tiene la estructura P + 3 dígitos exigida por MH 2.0 (MH20-006).`;
  }
  return null;
}

/** Teléfono del emisor normalizado (solo dígitos, ≥ 8) o null. */
export function normalizeEmisorPhone(raw: string | null): string | null {
  const digits = raw ? (removeNonDigits(raw) ?? null) : null;
  return digits && digits.length >= 8 ? digits : null;
}

/** Documento objetivo de la invalidación v3 (un DTE o un evento 17/18). */
export interface InvalidationV3Target {
  tipoDte:          string;
  generationCode:   string;
  receptionStamp:   string;
  /** null obligatorio para eventos 17/18. */
  controlNumber:    string | null;
  fecEmi:           string;
  receptor:         OriginalDteReceptor | null;
}

export interface BuildInvalidationV3Params {
  issuerConfig:               DteIssuerConfigForInvalidation;
  target:                     InvalidationV3Target;
  eventGenerationCode:        string;
  invalidationTypeCode:       "1" | "2" | "3";
  reason:                     string | null;
  replacementGenerationCode?: string | null;
  responsable:                InvalidationPersona;
  solicita:                   InvalidationPersona;
  now?:                       Date;
}

export function buildInvalidationEventJsonV3(params: BuildInvalidationV3Params): BuildInvalidationEventJsonResult {
  const {
    issuerConfig, target, eventGenerationCode, invalidationTypeCode, reason,
    replacementGenerationCode, responsable, solicita, now = new Date(),
  } = params;

  // ── Emisor ──────────────────────────────────────────────────────
  if (!issuerConfig.nit)   return { ok: false, error: "El emisor DTE no tiene NIT configurado." };
  if (!issuerConfig.name)  return { ok: false, error: "El emisor DTE no tiene nombre configurado." };
  if (!issuerConfig.email) return { ok: false, error: "El emisor DTE no tiene correo electrónico configurado." };
  const codesError = mh20EventIssuerCodesError(issuerConfig);
  if (codesError) return { ok: false, error: codesError };
  const telefono = normalizeEmisorPhone(issuerConfig.phone);
  if (!telefono) {
    return {
      ok:    false,
      error: "El emisor DTE no tiene un teléfono válido (mínimo 8 dígitos): el Evento de Invalidación 2.0 lo exige no nulo.",
    };
  }

  // ── Documento objetivo ──────────────────────────────────────────
  const isEventTarget = EVENT_TARGET_TYPES.has(target.tipoDte);
  if (!target.receptionStamp || !/^[A-Z0-9]{40}$/.test(target.receptionStamp)) {
    return { ok: false, error: "El sello de recepción del documento a invalidar debe tener 40 caracteres alfanuméricos en mayúsculas." };
  }
  const genUp = (target.generationCode ?? "").toUpperCase();
  if (!UUID_RE.test(genUp)) return { ok: false, error: "El documento a invalidar no tiene codigoGeneracion válido." };
  if (isEventTarget && target.controlNumber !== null) {
    return { ok: false, error: `Un evento tipo ${target.tipoDte} no tiene número de control: numeroControl debe ser null (MH20-046).` };
  }
  if (!isEventTarget && !target.controlNumber) {
    return { ok: false, error: "El documento DTE no tiene numeroControl." };
  }
  if (!target.fecEmi) return { ok: false, error: "El documento a invalidar no tiene fecha de generación (fecEmi)." };

  // ── Código del evento ───────────────────────────────────────────
  const evtCodeUp = eventGenerationCode.toUpperCase();
  if (!UUID_RE.test(evtCodeUp)) {
    return { ok: false, error: "eventGenerationCode no tiene formato UUID en mayúsculas (ej. A1B2C3D4-...)." };
  }

  // ── Reglas de tipoAnulacion (KEEP, retiradas del schema v3) ─────
  const tipoAnulacion = Number.parseInt(invalidationTypeCode, 10);
  if (![1, 2, 3].includes(tipoAnulacion)) {
    return { ok: false, error: `tipoAnulacion inválido: "${invalidationTypeCode}".` };
  }
  let codigoGeneracionR: string | null = null;
  if (tipoAnulacion !== 2) {
    if (!replacementGenerationCode) {
      return {
        ok:    false,
        error: "Para tipoAnulacion 1 o 3, replacementGenerationCode (UUID del DTE que reemplaza) es obligatorio.",
      };
    }
    codigoGeneracionR = replacementGenerationCode.toUpperCase();
    if (!UUID_RE.test(codigoGeneracionR)) {
      return { ok: false, error: "replacementGenerationCode no tiene formato UUID válido." };
    }
    if (isEventTarget) {
      // MH20-046: un evento solo se invalida por errores en su contenido
      // (sin documento de reemplazo confirmado en la normativa).
      return { ok: false, error: `Un evento tipo ${target.tipoDte} solo admite tipoAnulacion 2 (sin documento de reemplazo).` };
    }
  }
  if (tipoAnulacion === 3 && (!reason || reason.trim().length < 5)) {
    return { ok: false, error: "Para tipoAnulacion 3, motivoAnulacion debe ser un texto de al menos 5 caracteres." };
  }

  // ── Receptor (nullable en v3) ───────────────────────────────────
  const rec = target.receptor;
  const recTipoDocumento = rec ? (rec.tipoDocumento ?? (rec.nit ? "36" : null)) : null;
  const recNumDocumento  = rec ? (rec.numDocumento ?? rec.nit ?? null) : null;
  if (rec && (!recTipoDocumento || !recNumDocumento) && target.tipoDte !== "01") {
    return {
      ok:    false,
      error: "El receptor del documento original no tiene tipoDocumento/numDocumento ni nit. No se puede construir el documento de invalidación.",
    };
  }

  const { time: horEmi } = svDateTime(now);
  const eventDate = resolveInvalidationEventDate({ targetType: target.tipoDte, targetFecEmi: target.fecEmi, now });
  if (!eventDate.ok) return { ok: false, error: eventDate.error };
  const fecEmi = eventDate.fecEmi;

  const eventJson: Record<string, unknown> = {
    identificacion: {
      version:          3,
      ambiente:         mapAmbiente(issuerConfig.environment),
      codigoGeneracion: evtCodeUp,
      fecEmi,
      horEmi,
      fusion:           null,
    },
    emisor: {
      nit:             normalizeNitForDte(issuerConfig.nit) ?? issuerConfig.nit,
      nombre:          issuerConfig.name,
      codEstableMH:    issuerConfig.cod_estable_mh,
      codEstable:      issuerConfig.establishment_code ?? null,
      codPuntoVentaMH: issuerConfig.cod_punto_venta_mh,
      codPuntoVenta:   issuerConfig.point_of_sale_code ?? null,
      telefono,
      correo:          issuerConfig.email,
    },
    documento: {
      tipoDte:          target.tipoDte,
      codigoGeneracion: genUp,
      selloRecibido:    target.receptionStamp,
      numeroControl:    target.controlNumber,
      fecEmi:           target.fecEmi,
      codigoGeneracionR,
      tipoDocumento:    recTipoDocumento ?? null,
      numDocumento:     recNumDocumento ?? null,
      nombre:           rec?.nombre ?? null,
      telefono:         rec?.telefono ?? null,
      correo:           rec?.correo ?? null,
    },
    motivo: {
      tipoAnulacion,
      motivoAnulacion:   reason ?? null,
      nombreResponsable: responsable.nombre,
      tipDocResponsable: responsable.tipoDocumento,
      numDocResponsable: responsable.numeroDocumento,
      nombreSolicita:    solicita.nombre,
      tipDocSolicita:    solicita.tipoDocumento,
      numDocSolicita:    solicita.numeroDocumento,
    },
  };

  const check = validateMhEventJson("INV", eventJson);
  if (!check.ok) {
    return {
      ok:    false,
      error: `El JSON de invalidación no cumple el schema MH. Errores: ${check.validation_errors.map((e) => `${e.path}: ${e.message}`).join(" | ")}`,
    };
  }
  return { ok: true, eventJson };
}
