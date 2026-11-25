// ─────────────────────────────────────────────────────────────────
// commerce/dte — build-special-ops-event-json.service.ts
//
// MH20 (Fase 6, IMP20-023) — Evento de Operaciones Especiales (tipo 17,
// v2_0/fe-eop-v1.json; MH20-043..045).
//
// Estado: PARCIAL / BLOQUEADO por diseño.
//   - Solo existe para emisores AUTORIZADOS por la AT para documentos no
//     electrónicos (FVS / CCI u otra autorización equivalente). Zolvi no
//     tiene hoy un modelo de autorización: el llamador debe aportarla
//     explícitamente y el builder falla cerrado sin ella. NO hay migración
//     M3 ni persistencia (ver 06-migration-status.md).
//   - Registro: (MH_2_0, "17") `blocked` + `transmissionBlocked` MT-GAP-001.
//     Este builder no consulta el registro porque es puro; el flujo
//     persistido no existe.
//   - INC-001 (docDel/docAl): se respeta la forma literal del schema
//     (string|null, máx. 36). La semántica de rango no se infiere.
//
// Puro: sin base de datos, sin firma, sin red.
// ─────────────────────────────────────────────────────────────────

import { normalizeNitForDte } from "../utils/fiscal-id.utils";
import { numeroALetras } from "../utils/numero-a-letras";
import { validateMhEventJson } from "../spec/validate-mh-event-json";

const UUID_RE = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SpecialOpsAuthorization {
  /** Tipo de autorización AT (p. ej. "FVS", "CCI"). */
  type:      string;
  /** Número / referencia de la resolución de autorización. */
  reference: string;
  /** true solo si la autorización fue verificada para el emisor y ambiente. */
  verified:  boolean;
  /** Fin de vigencia (YYYY-MM-DD) o null si indefinida. */
  validUntil: string | null;
}

export interface SpecialOpsLine {
  codigoGeneracionRef: string | null;
  tipoDocumento:       string;
  numDocumento:        string | null;
  fechaEmision:        string | null;
  cantidad:            number;
  descripcion:         string;
  docDel:              string | null;
  docAl:               string | null;
  precioUni:           number;
  ventaNoSuj:          number;
  ventaExenta:         number;
  ventaGravada:        number;
  /** Códigos de tributo (2 caracteres) o null. */
  tributos:            string[] | null;
}

export interface BuildSpecialOpsEventParams {
  issuer:              { nit: string | null; name: string | null; environment: string };
  authorization:       SpecialOpsAuthorization | null;
  eventGenerationCode: string;
  lines:               SpecialOpsLine[];
  /** Tributos del resumen (código, descripción, valor) o null. */
  resumenTributos:     { codigo: string; descripcion: string; valor: number }[] | null;
  apendice?:           { campo: string; etiqueta: string; valor: string }[] | null;
  now?:                Date;
}

export type BuildSpecialOpsEventResult =
  | { ok: true; eventJson: Record<string, unknown>; warnings: string[] }
  | { ok: false; code: "OE_NOT_AUTHORIZED" | "OE_INVALID"; error: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r8 = (n: number) => Math.round(n * 1e8) / 1e8;

function svDateTime(d: Date): { date: string; time: string } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/El_Salvador" });
  const [date, time] = s.split(" ");
  return { date, time: time.slice(0, 8) };
}

export function buildSpecialOpsEventJson(p: BuildSpecialOpsEventParams): BuildSpecialOpsEventResult {
  const now = p.now ?? new Date();
  const { date: fecEmi, time: horEmi } = svDateTime(now);

  // ── Guardia de autorización (fail closed) ───────────────────────
  const a = p.authorization;
  if (!a || !a.verified || !a.type?.trim() || !a.reference?.trim()) {
    return {
      ok: false, code: "OE_NOT_AUTHORIZED",
      error: "El emisor no tiene una autorización verificada de la AT para operaciones especiales (FVS/CCI): el Evento 17 no se genera.",
    };
  }
  if (a.validUntil && (!DATE_RE.test(a.validUntil) || a.validUntil < fecEmi)) {
    return { ok: false, code: "OE_NOT_AUTHORIZED", error: "La autorización de operaciones especiales está vencida o tiene fecha inválida." };
  }

  if (!p.issuer.nit || !p.issuer.name) return { ok: false, code: "OE_INVALID", error: "El emisor no tiene NIT o nombre configurado." };
  const code = p.eventGenerationCode.toUpperCase();
  if (!UUID_RE.test(code)) return { ok: false, code: "OE_INVALID", error: "eventGenerationCode no tiene formato UUID en mayúsculas." };
  if (p.lines.length < 1 || p.lines.length > 2000) return { ok: false, code: "OE_INVALID", error: "El Evento 17 debe tener entre 1 y 2000 líneas." };

  let totalNoSuj = 0, totalExenta = 0, totalGravada = 0;
  const cuerpoDocumento = p.lines.map((l, i) => {
    totalNoSuj += l.ventaNoSuj; totalExenta += l.ventaExenta; totalGravada += l.ventaGravada;
    return {
      numItem:             i + 1,
      codigoGeneracionRef: l.codigoGeneracionRef ? l.codigoGeneracionRef.toUpperCase() : null,
      tipoDocumento:       l.tipoDocumento,
      numDocumento:        l.numDocumento,
      fechaEmision:        l.fechaEmision,
      cantidad:            l.cantidad,
      descripcion:         l.descripcion,
      docDel:              l.docDel,
      docAl:               l.docAl,
      precioUni:           r8(l.precioUni),
      ventaNoSuj:          r8(l.ventaNoSuj),
      ventaExenta:         r8(l.ventaExenta),
      ventaGravada:        r8(l.ventaGravada),
      tributos:            l.tributos && l.tributos.length > 0 ? l.tributos : null,
    };
  });
  for (const l of p.lines) {
    if (l.fechaEmision && l.fechaEmision > fecEmi) {
      return { ok: false, code: "OE_INVALID", error: "Una línea tiene fechaEmision posterior a la fecha del evento." };
    }
  }

  const subTotal = r2(totalNoSuj + totalExenta + totalGravada);
  const tributosValor = (p.resumenTributos ?? []).reduce((s, t) => s + t.valor, 0);
  const total = r2(subTotal + tributosValor);

  const eventJson: Record<string, unknown> = {
    identificacion: {
      version: 1, ambiente: p.issuer.environment === "PRODUCTION" ? "01" : "00",
      tipoModelo: 1, tipoOperacion: 1, tipoEvento: "17",
      codigoGeneracion: code, fecEmi, horEmi, tipoMoneda: "USD",
    },
    emisor: { nit: normalizeNitForDte(p.issuer.nit) ?? p.issuer.nit, nombre: p.issuer.name },
    cuerpoDocumento,
    resumen: {
      totalNoSuj: r2(totalNoSuj), totalExenta: r2(totalExenta), totalGravada: r2(totalGravada),
      subTotal,
      tributos: p.resumenTributos && p.resumenTributos.length > 0 ? p.resumenTributos.map((t) => ({ ...t, valor: r2(t.valor) })) : null,
      total,
      totalLetras: numeroALetras(total),
    },
    apendice: p.apendice && p.apendice.length > 0 ? p.apendice : null,
  };

  const check = validateMhEventJson("17", eventJson);
  if (!check.ok) {
    return {
      ok: false, code: "OE_INVALID",
      error: `El JSON del Evento 17 no cumple fe-eop-v1. Errores: ${check.validation_errors.map((e) => `${e.path}: ${e.message}`).join(" | ")}`,
    };
  }
  return {
    ok: true, eventJson,
    warnings: [
      "Evento 17 PROVISIONAL: fórmulas de resumen y semántica docDel/docAl (INC-001) sin confirmación oficial.",
      "Transmisión bloqueada: MT-GAP-001 (endpoint de eventos no documentado).",
    ],
  };
}
