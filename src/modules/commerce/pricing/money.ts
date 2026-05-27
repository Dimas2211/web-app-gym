// ─────────────────────────────────────────────────────────────────
// commerce/pricing — money.ts
//
// ÚNICA fuente de verdad para cálculos monetarios con IVA.
//
// Política de precios activa:
//   - unit_price en SaleItem es el precio COMERCIAL CON IVA.
//   - line_total = round2(unit_price × qty − discount)          (con IVA)
//   - line_subtotal = round2(line_total / (1 + rate/100))       (sin IVA — base gravada)
//   - tax_amount = round2(line_total − line_subtotal)           (IVA extraído)
//
// Razón: almacenar el precio con IVA evita la doble pérdida de
// precisión que ocurre al dividir por 1.13 y redondear antes de
// multiplicar nuevamente. Ejemplo: 100/1.13 = 88.4955… → 88.50
// → 88.50 × 1.13 = 100.005 → round = 100.01 (error de $0.01).
// Guardando 100.00 directamente: line_total = 100.00 siempre.
// ─────────────────────────────────────────────────────────────────

/** Redondeo monetario a 2 decimales con Math.round (half-up). */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Cálculo de una línea de venta ─────────────────────────────────

export interface VatIncludedLineInput {
  quantity:         number;
  unitPriceWithVat: number;  // precio comercial CON IVA (fuente principal)
  discountWithVat:  number;  // descuento CON IVA (reduce el precio final)
  taxRate:          number | null;  // porcentaje (ej. 13), o null/0 si exento
}

export interface VatIncludedLineResult {
  /** Total de línea CON IVA — lo que paga el cliente */
  line_total:    number;
  /** Base gravada SIN IVA — para DTE y contabilidad */
  line_subtotal: number;
  /** IVA = line_total − line_subtotal */
  tax_amount:    number;
}

export function calculateVatIncludedLine(input: VatIncludedLineInput): VatIncludedLineResult {
  const { quantity, unitPriceWithVat, discountWithVat, taxRate } = input;

  // Total comercial de línea (con IVA)
  const line_total = roundMoney(quantity * unitPriceWithVat - discountWithVat);

  if (!taxRate || taxRate <= 0) {
    return { line_total, line_subtotal: line_total, tax_amount: 0 };
  }

  // Extraer base gravada y IVA desde el total con IVA
  const taxFactor     = 1 + taxRate / 100;
  const line_subtotal = roundMoney(line_total / taxFactor);
  const tax_amount    = roundMoney(line_total - line_subtotal);

  return { line_total, line_subtotal, tax_amount };
}

// ── Totales de la cabecera de venta ───────────────────────────────

export interface SaleLineForTotals {
  line_subtotal:   number;
  tax_amount:      number;
  line_total:      number;
  discount_amount: number;
}

export interface SaleTotalsResult {
  subtotal:        number;
  discount_amount: number;
  tax_amount:      number;
  total_amount:    number;
}

export function calculateSaleTotals(lines: SaleLineForTotals[]): SaleTotalsResult {
  return {
    subtotal:        roundMoney(lines.reduce((s, l) => s + l.line_subtotal,   0)),
    discount_amount: roundMoney(lines.reduce((s, l) => s + l.discount_amount, 0)),
    tax_amount:      roundMoney(lines.reduce((s, l) => s + l.tax_amount,      0)),
    total_amount:    roundMoney(lines.reduce((s, l) => s + l.line_total,      0)),
  };
}

// ── Separar IVA de un monto total con IVA ─────────────────────────
// Útil para campos informativos de DTE (ivaItem, etc.)

export function splitVatIncludedAmount(
  totalWithVat: number,
  taxRatePct:   number,
): { base: number; iva: number } {
  const taxFactor = 1 + taxRatePct / 100;
  const base      = roundMoney(totalWithVat / taxFactor);
  const iva       = roundMoney(totalWithVat - base);
  return { base, iva };
}
