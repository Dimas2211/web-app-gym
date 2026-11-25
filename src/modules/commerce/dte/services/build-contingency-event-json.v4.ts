// ─────────────────────────────────────────────────────────────────
// commerce/dte — build-contingency-event-json.v4.ts
//
// MH20 (Fase 6, IMP20-019) — Evento de Contingencia versión 4
// (v2_0/contingencia-schema-v4.json, SCH20-565..587, MH20-006/053/055).
//
// Diferencias con v3 (intacta en build-contingency-event-json.service.ts):
//   emisor.codPuntoVenta → codPuntoVentaMH, tomado SIEMPRE de
//     cod_punto_venta_mh (nunca de point_of_sale_code, criterio IMP20-019);
//   codEstableMH y codPuntoVentaMH requeridos con estructura MH (MH20-006);
//   detalleDTE admite Evento de Retorno (tipoDoc "18", MH20-053).
//   Reglas retiradas del schema v4 (enum de tipoDocResponsable,
//   tipoEstablecimiento, tipoContingencia 1..5, motivo obligatorio con
//   tipo 5, patrón de horas y de UUID por ítem) se conservan aquí (D8).
//
// INC-005 (versión 3 vs 4) sigue ABIERTA: este builder sirve para validar
// la estructura v4 localmente. El flujo persistido NO lo usa (registro:
// CONT MH_2_0 `blocked`) y la transmisión de v4 está bloqueada en todo
// ambiente (transmissionBlocked). Puro: no firma, no transmite, no Prisma.
// ─────────────────────────────────────────────────────────────────

import { normalizeNitForDte } from "../utils/fiscal-id.utils";
import { validateMhEventJson } from "../spec/validate-mh-event-json";
import { mh20EventIssuerCodesError, normalizeEmisorPhone } from "./build-invalidation-event-json.v3";
import type {
  BuildContingencyEventJsonResult,
  ContingencyEventJsonParams,
} from "../types/dte-contingency-event-json.types";

const UUID_RE = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/;
const TIME_RE = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
const CAT022_DOC_TYPES = new Set(["36", "13", "02", "03", "37"]);
const CAT009_ESTABLISHMENT = new Set(["01", "02", "04", "07", "20"]);
/** Tipos que pueden reportarse en contingencia 2.0 (Cuadro 7 / MH20-053) dentro del alcance de Zolvi. */
const CONT_V4_DOC_TYPES = new Set(["01", "03", "05", "11", "14", "18"]);

function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function buildContingencyEventJsonV4(params: ContingencyEventJsonParams): BuildContingencyEventJsonResult {
  const {
    issuerConfig, responsable, eventGenerationCode, contingencyTypeCode, reason,
    periodStartDate, periodStartTime, periodEndDate, periodEndTime, items, now = new Date(),
  } = params;

  if (!issuerConfig.nit)   return { ok: false, error: "El emisor DTE no tiene NIT configurado." };
  if (!issuerConfig.name)  return { ok: false, error: "El emisor DTE no tiene nombre configurado." };
  if (!issuerConfig.email) return { ok: false, error: "El emisor DTE no tiene correo electrónico configurado." };
  if (!issuerConfig.establishment_type_code || !CAT009_ESTABLISHMENT.has(issuerConfig.establishment_type_code)) {
    return { ok: false, error: "El emisor DTE no tiene un tipoEstablecimiento válido (CAT-009)." };
  }
  const codesError = mh20EventIssuerCodesError(issuerConfig);
  if (codesError) return { ok: false, error: codesError };
  const telefono = normalizeEmisorPhone(issuerConfig.phone);
  if (!telefono) {
    return { ok: false, error: "El emisor DTE no tiene un teléfono válido (mínimo 8 dígitos): la Contingencia 2.0 lo exige." };
  }

  if (!responsable.nombre?.trim()) return { ok: false, error: "nombreResponsable es obligatorio." };
  if (!CAT022_DOC_TYPES.has(responsable.tipoDocumento)) return { ok: false, error: "tipoDocResponsable debe ser un código CAT-022 válido." };
  if (!responsable.numeroDocumento?.trim()) return { ok: false, error: "numeroDocResponsable es obligatorio." };

  const evtCodeUp = eventGenerationCode.toUpperCase();
  if (!UUID_RE.test(evtCodeUp)) return { ok: false, error: "eventGenerationCode no tiene formato UUID en mayúsculas." };

  if (items.length < 1 || items.length > 1000) return { ok: false, error: "El Evento debe reportar entre 1 y 1000 documentos." };
  for (const it of items) {
    if (!UUID_RE.test(it.generation_code.toUpperCase())) return { ok: false, error: `Código de generación inválido en el ítem ${it.no_item}.` };
    if (!CONT_V4_DOC_TYPES.has(it.dte_type_code)) {
      return { ok: false, error: `El tipo "${it.dte_type_code}" no puede reportarse en la Contingencia 2.0 dentro del alcance de Zolvi.` };
    }
  }

  const tipoContingencia = Number(contingencyTypeCode);
  if (!Number.isInteger(tipoContingencia) || tipoContingencia < 1 || tipoContingencia > 5) {
    return { ok: false, error: `contingencyTypeCode inválido: "${contingencyTypeCode}".` };
  }
  let motivoContingencia: string | null = null;
  if (tipoContingencia === 5) {
    const t = (reason ?? "").trim();
    if (!t) return { ok: false, error: "Para tipoContingencia 5, motivoContingencia es obligatorio." };
    if (t.length > 500) return { ok: false, error: "motivoContingencia no puede superar los 500 caracteres." };
    motivoContingencia = t;
  }
  if (!TIME_RE.test(periodStartTime) || !TIME_RE.test(periodEndTime)) {
    return { ok: false, error: "Las horas del período de contingencia deben tener formato HH:MM:SS." };
  }
  const fInicio = ymd(periodStartDate), fFin = ymd(periodEndDate);
  if (new Date(`${fInicio}T${periodStartTime}Z`).getTime() > new Date(`${fFin}T${periodEndTime}Z`).getTime()) {
    return { ok: false, error: "El período de contingencia tiene inicio posterior al fin." };
  }

  const { date: fTransmision, time: hTransmision } = svDateTime(now);
  const eventJson: Record<string, unknown> = {
    identificacion: {
      version: 4,
      ambiente: issuerConfig.environment === "PRODUCTION" ? "01" : "00",
      codigoGeneracion: evtCodeUp,
      fTransmision,
      hTransmision,
    },
    emisor: {
      nit:                  normalizeNitForDte(issuerConfig.nit) ?? issuerConfig.nit,
      nombre:               issuerConfig.name,
      nombreResponsable:    responsable.nombre,
      tipoDocResponsable:   responsable.tipoDocumento,
      numeroDocResponsable: responsable.numeroDocumento,
      tipoEstablecimiento:  issuerConfig.establishment_type_code,
      codEstableMH:         issuerConfig.cod_estable_mh,
      codPuntoVentaMH:      issuerConfig.cod_punto_venta_mh,
      telefono,
      correo:               issuerConfig.email,
    },
    detalleDTE: items.map((it) => ({
      noItem: it.no_item,
      tipoDoc: it.dte_type_code,
      codigoGeneracion: it.generation_code.toUpperCase(),
    })),
    motivo: { fInicio, fFin, hInicio: periodStartTime, hFin: periodEndTime, tipoContingencia, motivoContingencia },
  };

  const check = validateMhEventJson("CONT", eventJson);
  if (!check.ok) {
    return {
      ok:    false,
      error: `El JSON del Evento de Contingencia no cumple el schema MH. Errores: ${check.validation_errors.map((e) => `${e.path}: ${e.message}`).join(" | ")}`,
    };
  }
  return { ok: true, eventJson };
}
