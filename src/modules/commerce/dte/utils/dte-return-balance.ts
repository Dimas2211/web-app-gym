// ─────────────────────────────────────────────────────────────────
// commerce/dte — utils/dte-return-balance.ts
//
// MH20 (Fase 6, IMP20-022, MH20-059) — saldo elegible de retorno por
// línea del DTE original. Puro.
//
// Regla oficial (MF 2.0 X cond. 4; N2.0 13.3.1): pueden aplicarse "n"
// retornos a un DTE siempre que la suma de todos no exceda el valor del
// DTE; el retorno no es un descuento ni puede exceder lo vendido/comprado.
//
// Zolvi lo aplica de forma más estricta y verificable, POR LÍNEA Y POR
// CAMPO: cantidad, descuento, ventas (no sujeta/exenta/gravada), compra
// (FSE), IVA del ítem y no gravado acumulados nunca superan los de la
// línea original. La suma por documento nunca supera totalPagar.
//
// La propuesta proporcional (proposeProportionalReturnAmounts) es una
// AYUDA de cálculo al precio unitario original; el último retorno de una
// línea toma el remanente exacto, para que la suma nunca exceda la línea
// por redondeo. Fórmula marcada PROVISIONAL (sin regla oficial de
// prorrateo; ver 06-pending-activation-blockers.md, RET-FORMULAS).
// ─────────────────────────────────────────────────────────────────

import type { ReturnLineAmounts } from "../types/dte-return-event-json.types";

export const RETURN_AMOUNT_FIELDS = [
  "quantity", "montoDescu", "ventaNoSuj", "ventaExenta", "ventaGravada", "compra", "ivaItem", "noGravado",
] as const satisfies readonly (keyof ReturnLineAmounts)[];

/** Línea original normalizada (campos ausentes del tipo = 0 / null). */
export interface ReturnOriginLine extends ReturnLineAmounts {
  numItem:     number;
  tipoItem:    number | null;
  codigo:      string | null;
  uniMedida:   number;
  descripcion: string;
  precioUni:   number;
  codTributo:  string | null;
  tributos:    string[] | null;
  psv:         number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
export function round8(v: number): number {
  return Math.round((v + Number.EPSILON) * 1e8) / 1e8;
}

/** Lee la línea numItem del cuerpoDocumento original; null si no existe. */
export function readReturnOriginLine(jsonDocument: unknown, numItem: number): ReturnOriginLine | null {
  if (!isObj(jsonDocument) || !Array.isArray(jsonDocument.cuerpoDocumento)) return null;
  const line = (jsonDocument.cuerpoDocumento as unknown[]).find((l) => isObj(l) && l.numItem === numItem);
  if (!isObj(line)) return null;
  return {
    numItem,
    tipoItem:     typeof line.tipoItem === "number" ? line.tipoItem : null,
    codigo:       typeof line.codigo === "string" ? line.codigo : null,
    uniMedida:    num(line.uniMedida),
    descripcion:  typeof line.descripcion === "string" ? line.descripcion : "",
    precioUni:    num(line.precioUni),
    codTributo:   typeof line.codTributo === "string" ? line.codTributo : null,
    tributos:     Array.isArray(line.tributos) ? (line.tributos as string[]) : null,
    psv:          num(line.psv),
    quantity:     num(line.cantidad),
    montoDescu:   num(line.montoDescu),
    ventaNoSuj:   num(line.ventaNoSuj),
    ventaExenta:  num(line.ventaExenta),
    ventaGravada: num(line.ventaGravada),
    compra:       num(line.compra),
    ivaItem:      num(line.ivaItem),
    noGravado:    num(line.noGravado),
  };
}

export function zeroReturnAmounts(): ReturnLineAmounts {
  return { quantity: 0, montoDescu: 0, ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 0, compra: 0, ivaItem: 0, noGravado: 0 };
}

export function addReturnAmounts(a: ReturnLineAmounts, b: ReturnLineAmounts): ReturnLineAmounts {
  const r = zeroReturnAmounts();
  for (const f of RETURN_AMOUNT_FIELDS) r[f] = f === "quantity" ? round8(a[f] + b[f]) : round2(a[f] + b[f]);
  return r;
}

/** Saldo elegible = original − acumulado vigente (nunca negativo). */
export function remainingReturnAmounts(original: ReturnLineAmounts, returned: ReturnLineAmounts): ReturnLineAmounts {
  const r = zeroReturnAmounts();
  for (const f of RETURN_AMOUNT_FIELDS) {
    const v = original[f] - returned[f];
    r[f] = f === "quantity" ? round8(Math.max(0, v)) : round2(Math.max(0, v));
  }
  return r;
}

/** Importe sin IVA devuelto (ventas + compra). */
export function returnedBaseAmount(a: ReturnLineAmounts): number {
  return round2(a.ventaNoSuj + a.ventaExenta + a.ventaGravada + a.compra);
}

/** Lista de campos que superan el saldo elegible (vacía = válido). */
export function returnExcessFields(requested: ReturnLineAmounts, remaining: ReturnLineAmounts): string[] {
  const out: string[] = [];
  for (const f of RETURN_AMOUNT_FIELDS) {
    if (requested[f] < 0) out.push(`${f} negativo`);
    else if (requested[f] - remaining[f] > (f === "quantity" ? 1e-8 : 0.0049)) {
      out.push(`${f} ${requested[f]} > saldo ${remaining[f]}`);
    }
  }
  return out;
}

/** Propuesta proporcional (PROVISIONAL); el retorno total toma el remanente exacto. */
export function proposeProportionalReturnAmounts(
  original: ReturnLineAmounts,
  returned: ReturnLineAmounts,
  quantity: number,
): ReturnLineAmounts {
  const remaining = remainingReturnAmounts(original, returned);
  if (original.quantity <= 0) return zeroReturnAmounts();
  if (quantity >= remaining.quantity - 1e-8) return remaining;
  const factor = quantity / original.quantity;
  const r = zeroReturnAmounts();
  r.quantity = round8(quantity);
  for (const f of RETURN_AMOUNT_FIELDS) {
    if (f === "quantity") continue;
    r[f] = Math.min(remaining[f], round2(original[f] * factor));
  }
  return r;
}
