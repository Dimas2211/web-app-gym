// ─────────────────────────────────────────────────────────────────
// commerce/dte — spec/dte-invalidation-deadlines.ts
//
// MH20 (Fase 6, IMP20-018/024) — plazos del Evento de Invalidación 2.0 y
// tipos invalidables por perfil.
//
// REGLA: ningún plazo oficial se fija por inferencia (INC-004 / INC-009 /
// INC-013 siguen ABIERTOS). La tabla registra las fuentes en conflicto tal
// cual (01-discrepancias-documentales.md) y:
//
//   MH_1_2              → comportamiento histórico de Zolvi: sin control de
//                         plazo en el emisor (MH valida). Sin cambios.
//   MH_2_0 + PRODUCTION → plazo UNSET → bloqueo explícito
//                         (INV_DEADLINE_UNSET). No hay valor por defecto.
//   MH_2_0 + TEST       → se evalúa el valor MÁS RESTRICTIVO de las fuentes,
//                         marcado PROVISIONAL, y solo produce ADVERTENCIAS
//                         (nunca bloquea una prueba legítima ni amplía la
//                         ventana que valide MH).
//
// Fuentes por tipo (Normativa 2.0):
//   CCFE 03 / NCE 05 : Cuadro 6 p.28 = 10 primeros días hábiles del mes
//                      siguiente al sello · Anexo V campo 47 p.127 = 1 día
//                      posterior al sello  → PROVISIONAL TEST: 1 día.
//   FE 01 / FEXE 11 / FSEE 14: 3 meses desde el SELLO del invalidado
//                      (Cuadro 6 p.28, Anexo V campo 9 núm. 6 p.124 y MF
//                      p. impresa 11 coinciden; 2 años para medicamentos,
//                      INC-009, no soportado) → PROVISIONAL: 3 meses.
//                      Fase 9.0: el cómputo pasa de fecEmi al sello
//                      (verificación visual N2.0 p.124 y MF pp. impresas 11-12).
//   Retorno 18 / OE 17 (evento invalidado): Cuadro 6 = 10 días hábiles del
//                      mes siguiente · Anexo V campo 47 = 4 días calendario
//                      → PROVISIONAL TEST: 4 días calendario.
//
// Fase 6.1 — INC-006 (fecha del evento) RESUELTO_DOCUMENTALMENTE
// (consultas-mh-verificadas.md §8; N2.0 Anexo V campo 9 núm. 4 y 5 p.123,
// regla 13.1.1.1 p.29, MF PDF pp.14-15). Regla aplicada en el builder v3
// mediante resolveInvalidationEventDate():
//   - tipos distintos de FE/FEXE/FSEE y eventos → la MISMA fecha que la
//     fecha de generación del documento/evento invalidado;
//   - FE 01 / FEXE 11 / FSEE 14 → fecha actual, que debe estar entre la
//     fecha de generación y 3 meses después de ella.
// Los PLAZOS DE TRANSMISIÓN (INC-004, Anexo V campo 47) siguen abiertos.
// ─────────────────────────────────────────────────────────────────

import type { DteSpecProfile } from "./dte-spec-profile";

// ── Tipos invalidables por perfil ─────────────────────────────────
//
// MH_1_2: conjunto histórico de Zolvi (create-invalidation-event.service.ts):
//   01, 03, 05, 11 (FEX desde 58a00a8). FSE 14 NO es invalidable en Zolvi.
// MH_2_0: Fase 6.1 — FSEE 14 habilitada. Fuentes: N2.0 Cuadro 6 p.28 (FE,
//   FEXE y FSEE: 3 meses), Anexo V campo 9 núm. 5 p.123 (fecha del evento
//   para FE/FEXE/FSEE) y MF PDF pp.14-15 (consultas-mh-verificadas.md §7-§8).
//   No requiere M-migración: la invalidación no tiene efectos comerciales.
//   Historial: excluida en Fase 6 "hasta decisión de producto". MH_1_2 NO
//   cambia (14 sigue sin ser invalidable con el perfil histórico).
//   El Retorno 18 es invalidable (MH20-046) mediante su propio flujo
//   (create-return-invalidation-event.service.ts), no por este conjunto.

const INVALIDABLE_DTE_TYPES_BY_PROFILE: Readonly<Record<DteSpecProfile, ReadonlySet<string>>> = Object.freeze({
  MH_1_2: new Set(["01", "03", "05", "11"]),
  MH_2_0: new Set(["01", "03", "05", "11", "14"]),
});

export function isInvalidableDteType(profile: DteSpecProfile, dteTypeCode: string): boolean {
  return INVALIDABLE_DTE_TYPES_BY_PROFILE[profile].has(dteTypeCode);
}

// ── Tabla de plazos (MH_2_0) ──────────────────────────────────────

export type InvalidationDeadlineUnit = "DAYS_AFTER_STAMP" | "CALENDAR_DAYS_AFTER_STAMP" | "MONTHS_AFTER_STAMP";

export interface InvalidationDeadlineEntry {
  targetType:  string;
  /** Fuentes oficiales en conflicto (texto literal resumido). */
  sources:     readonly string[];
  /** Incidencias abiertas que impiden fijar el valor productivo. */
  openIssues:  readonly string[];
  /** Valor más restrictivo de las fuentes, SOLO para advertencias en TEST. */
  provisionalTest: { unit: InvalidationDeadlineUnit; value: number };
  /** Siempre UNSET: no existe valor productivo hasta confirmación oficial. */
  production:  "UNSET";
}

const DEADLINES: Readonly<Record<string, InvalidationDeadlineEntry>> = Object.freeze({
  "03": {
    targetType: "03",
    sources: ["N2.0 Cuadro 6 p.28: 10 primeros días hábiles del mes siguiente al sello", "N2.0 Anexo V campo 47 p.127: 1 día posterior al sello"],
    openIssues: ["INC-004"],
    provisionalTest: { unit: "DAYS_AFTER_STAMP", value: 1 },
    production: "UNSET",
  },
  "05": {
    targetType: "05",
    sources: ["N2.0 Cuadro 6 p.28: 10 primeros días hábiles del mes siguiente al sello", "N2.0 Anexo V campo 47 p.127: 1 día posterior al sello"],
    openIssues: ["INC-004"],
    provisionalTest: { unit: "DAYS_AFTER_STAMP", value: 1 },
    production: "UNSET",
  },
  "01": {
    targetType: "01",
    sources: ["N2.0 Cuadro 6 p.28: 3 meses (2 años medicamentos)", "N2.0 Anexo V campo 47 p.127: 3 meses"],
    openIssues: ["INC-004", "INC-009"],
    provisionalTest: { unit: "MONTHS_AFTER_STAMP", value: 3 },
    production: "UNSET",
  },
  "11": {
    targetType: "11",
    sources: ["N2.0 Cuadro 6 p.28: 3 meses", "N2.0 Anexo V campo 47 p.127: 3 meses"],
    openIssues: ["INC-004"],
    provisionalTest: { unit: "MONTHS_AFTER_STAMP", value: 3 },
    production: "UNSET",
  },
  "14": {
    targetType: "14",
    sources: ["N2.0 Cuadro 6 p.28: 3 meses (FE, FEXE, FSEE)", "N2.0 Anexo V campo 47 p.127: 3 meses desde el sello"],
    openIssues: ["INC-004"],
    provisionalTest: { unit: "MONTHS_AFTER_STAMP", value: 3 },
    production: "UNSET",
  },
  "18": {
    targetType: "18",
    sources: ["N2.0 Cuadro 6 fila 4 p.28: 10 primeros días hábiles del mes siguiente", "N2.0 Anexo V campo 47 p.127: 4 días calendario"],
    openIssues: ["INC-004", "INC-008"],
    provisionalTest: { unit: "CALENDAR_DAYS_AFTER_STAMP", value: 4 },
    production: "UNSET",
  },
});

export function getInvalidationDeadlineEntry(targetType: string): InvalidationDeadlineEntry | null {
  return DEADLINES[targetType] ?? null;
}

export type EvaluateInvalidationDeadlineResult =
  | { ok: true; enforced: false; warnings: string[] }
  | { ok: false; code: "INV_DEADLINE_UNSET" | "INV_DEADLINE_UNKNOWN_TYPE"; error: string };

const DAY_MS = 86_400_000;

/**
 * Suma meses a una fecha AAAA-MM-DD, ajustando al último día del mes de
 * destino cuando el día no existe (MF p. impresa 12: sello 30-11-2025 →
 * límite 28-02-2026). Antes de Fase 9.0 se usaba setUTCMonth, que
 * desbordaba al mes siguiente (30-11 + 3 → 02-03).
 */
export function addMonthsClampedIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" en America/El_Salvador (UTC-6, sin DST). */
function svDate(d: Date): string {
  return d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" }).split(" ")[0];
}

/**
 * Evalúa plazo y fecha del evento. Nunca amplía ni fija un plazo
 * productivo; ver cabecera.
 */
export function evaluateInvalidationDeadline(params: {
  profile:          DteSpecProfile;
  environment:      string;
  targetType:       string;
  /** Fecha del sello del documento/evento invalidado (accepted_at). */
  stampedAt:        Date | null;
  /** identificacion.fecEmi del documento/evento invalidado (YYYY-MM-DD). */
  targetFecEmi:     string | null;
  now:              Date;
}): EvaluateInvalidationDeadlineResult {
  // targetFecEmi se conserva en la firma (compatibilidad); el plazo de
  // transmisión se mide desde el sello (Fase 9.0).
  const { profile, environment, targetType, stampedAt, now } = params;
  if (profile === "MH_1_2") return { ok: true, enforced: false, warnings: [] };

  const entry = getInvalidationDeadlineEntry(targetType);
  if (!entry) {
    return {
      ok:    false,
      code:  "INV_DEADLINE_UNKNOWN_TYPE",
      error: `No hay tabla de plazos de invalidación MH 2.0 para el tipo "${targetType}".`,
    };
  }
  if (environment === "PRODUCTION") {
    return {
      ok:    false,
      code:  "INV_DEADLINE_UNSET",
      error:
        `El plazo del Evento de Invalidación 2.0 para el tipo "${targetType}" no está confirmado ` +
        `(${entry.openIssues.join(", ")}; fuentes en conflicto: ${entry.sources.join(" / ")}). ` +
        `Invalidación 2.0 bloqueada en PRODUCTION.`,
    };
  }

  const warnings: string[] = [];
  const { unit, value } = entry.provisionalTest;
  if (unit === "MONTHS_AFTER_STAMP") {
    // Plazo de TRANSMISIÓN: se cuenta desde el sello (fecha de transmisión
    // del invalidado), no desde fecEmi. La fecha del evento (ventana desde
    // la generación) la controla resolveInvalidationEventDate.
    if (stampedAt) {
      const limit = addMonthsClampedIso(svDate(stampedAt), value);
      if (svDate(now) > limit) {
        warnings.push(`PROVISIONAL (${entry.openIssues.join(", ")}): supera ${value} meses desde el sello (límite ${limit}).`);
      }
    }
  } else if (stampedAt) {
    const limit = stampedAt.getTime() + value * DAY_MS;
    if (now.getTime() > limit) {
      warnings.push(
        `PROVISIONAL (${entry.openIssues.join(", ")}): supera ${value} día(s) desde el sello; ` +
        `otra fuente oficial admite un plazo mayor.`,
      );
    }
  }
  // Fase 6.1: la fecha del evento (antes advertencia INC-006) se fija en el
  // builder v3 con resolveInvalidationEventDate (regla confirmada).
  return { ok: true, enforced: false, warnings };
}

// ── Fecha del evento de invalidación (Fase 6.1, consultas §8) ─────

/** Tipos cuya fecha de evento es "hasta 3 meses" desde la generación. */
const OPEN_DATE_WINDOW_TYPES: ReadonlySet<string> = new Set(["01", "11", "14"]);
const ISO_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export type ResolveInvalidationEventDateResult =
  | { ok: true; fecEmi: string; rule: "SAME_AS_TARGET" | "WITHIN_3_MONTHS" }
  | { ok: false; code: "INV_EVENT_DATE_INVALID_TARGET" | "INV_EVENT_DATE_BEFORE_TARGET" | "INV_EVENT_DATE_OUT_OF_WINDOW"; error: string };

/**
 * Fecha (fecEmi) del Evento de Invalidación v3:
 *  - documentos distintos de FE/FEXE/FSEE y eventos → misma fecha que la
 *    generación del invalidado (N2.0 Anexo V campo 9 núm. 4; MF p.11);
 *  - FE/FEXE/FSEE → fecha de hoy (America/El_Salvador), que debe estar
 *    entre la fecha de generación y 3 meses después (campo 9 núm. 5; regla
 *    13.1.1.1). Fuera de ventana → error (no se ajusta la fecha).
 * El caso "2 años para medicamentos" (INC-009) no se soporta: fail-closed.
 */
export function resolveInvalidationEventDate(params: {
  targetType:   string;
  targetFecEmi: string;
  now:          Date;
}): ResolveInvalidationEventDateResult {
  const { targetType, targetFecEmi, now } = params;
  if (!ISO_DATE_RE.test(targetFecEmi)) {
    return { ok: false, code: "INV_EVENT_DATE_INVALID_TARGET", error: `La fecha de generación del documento a invalidar ("${targetFecEmi}") no es AAAA-MM-DD.` };
  }
  if (!OPEN_DATE_WINDOW_TYPES.has(targetType)) {
    return { ok: true, fecEmi: targetFecEmi, rule: "SAME_AS_TARGET" };
  }
  const today = svDate(now);
  if (today < targetFecEmi) {
    return {
      ok: false, code: "INV_EVENT_DATE_BEFORE_TARGET",
      error: `La fecha del evento (${today}) es anterior a la fecha de generación del documento (${targetFecEmi}).`,
    };
  }
  const limit = addMonthsClampedIso(targetFecEmi, 3);
  if (today > limit) {
    return {
      ok: false, code: "INV_EVENT_DATE_OUT_OF_WINDOW",
      error:
        `La fecha del evento (${today}) supera los 3 meses desde la generación (${targetFecEmi}, límite ${limit}) ` +
        `establecidos en el Anexo V campo 9 núm. 5 (el plazo de 2 años para medicamentos, INC-009, no está soportado).`,
    };
  }
  return { ok: true, fecEmi: today, rule: "WITHIN_3_MONTHS" };
}
