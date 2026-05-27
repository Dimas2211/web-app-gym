// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale-calculations.ts
//
// Funciones puras para cálculo de totales de venta.
// No tienen side effects ni dependen de Prisma.
//
// Política activa de precios (ver pricing/money.ts):
//   unit_price = precio comercial CON IVA (fuente principal).
//   line_total    = round2(unit_price × qty − discount)
//   line_subtotal = round2(line_total / (1 + rate/100))   ← base gravada sin IVA
//   tax_amount    = round2(line_total − line_subtotal)    ← IVA extraído
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import type { SaleItemTotals, SaleTotals } from "../types/sale.types";
import { calculateVatIncludedLine } from "../../pricing/money";

// ── Calcular totales de una línea ─────────────────────────────────
//
// unit_price y discount_amount son precios CON IVA.

export interface SaleItemCalcInput {
  quantity:        number;
  unit_price:      number;  // CON IVA — precio comercial que paga el cliente
  discount_amount: number;  // CON IVA — descuento sobre el precio final
  tax_rate:        number | null;
}

export function calculateSaleItemTotals(input: SaleItemCalcInput): SaleItemTotals {
  const { quantity, unit_price, discount_amount, tax_rate } = input;

  const result = calculateVatIncludedLine({
    quantity,
    unitPriceWithVat: unit_price,
    discountWithVat:  discount_amount,
    taxRate:          tax_rate,
  });

  return {
    line_subtotal: result.line_subtotal,
    tax_amount:    result.tax_amount,
    line_total:    result.line_total,
  };
}

// ── Calcular totales de la cabecera a partir de las líneas ────────

export interface SaleItemForTotals {
  line_subtotal:  number | Prisma.Decimal;
  tax_amount:     number | Prisma.Decimal;
  line_total:     number | Prisma.Decimal;
  discount_amount: number | Prisma.Decimal;
}

export function calculateSaleTotals(items: SaleItemForTotals[]): SaleTotals {
  const subtotal        = items.reduce((s, i) => s + Number(i.line_subtotal),  0);
  const discount_amount = items.reduce((s, i) => s + Number(i.discount_amount), 0);
  const tax_amount      = items.reduce((s, i) => s + Number(i.tax_amount),     0);
  const total_amount    = items.reduce((s, i) => s + Number(i.line_total),     0);

  return {
    subtotal:        round2(subtotal),
    discount_amount: round2(discount_amount),
    tax_amount:      round2(tax_amount),
    total_amount:    round2(total_amount),
  };
}

// ── Normalizar line_number secuencial ─────────────────────────────

export interface LineItem {
  id:          string;
  line_number: number;
}

export function normalizeSaleLineNumbers(
  items: LineItem[],
): Array<{ id: string; line_number: number }> {
  return [...items]
    .sort((a, b) => a.line_number - b.line_number)
    .map((item, index) => ({ id: item.id, line_number: index + 1 }));
}

// ── Guard: la venta debe estar en DRAFT ───────────────────────────

export function assertSaleIsDraft(status: string): void {
  if (status !== "DRAFT") {
    throw new Error(
      `La operación requiere que la venta esté en estado DRAFT. Estado actual: ${status}.`,
    );
  }
}

// ── DTO seguro para SaleItem ──────────────────────────────────────

export interface RawSaleItem {
  id:                    string;
  sale_id:               string;
  product_id:            string;
  line_number:           number;
  product_code_snapshot: string;
  product_name_snapshot: string;
  product_type_snapshot: string | null;
  is_stockable_snapshot: boolean;
  quantity:              number | Prisma.Decimal;
  unit_price:            number | Prisma.Decimal;
  discount_amount:       number | Prisma.Decimal;
  tax_rate_snapshot:     number | Prisma.Decimal | null;
  tax_amount:            number | Prisma.Decimal;
  line_subtotal:         number | Prisma.Decimal;
  line_total:            number | Prisma.Decimal;
  notes:                 string | null;
  created_at:            Date;
  updated_at:            Date;
}

export function mapSaleItemToDTO(item: RawSaleItem) {
  return {
    id:                    item.id,
    sale_id:               item.sale_id,
    product_id:            item.product_id,
    line_number:           item.line_number,
    product_code_snapshot: item.product_code_snapshot,
    product_name_snapshot: item.product_name_snapshot,
    product_type_snapshot: item.product_type_snapshot,
    is_stockable_snapshot: item.is_stockable_snapshot,
    quantity:              Number(item.quantity),
    unit_price:            Number(item.unit_price),
    discount_amount:       Number(item.discount_amount),
    tax_rate_snapshot:     item.tax_rate_snapshot != null
      ? Number(item.tax_rate_snapshot)
      : null,
    tax_amount:    Number(item.tax_amount),
    line_subtotal: Number(item.line_subtotal),
    line_total:    Number(item.line_total),
    notes:         item.notes,
    created_at:    item.created_at,
    updated_at:    item.updated_at,
  };
}

// ── Helpers internos ──────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
