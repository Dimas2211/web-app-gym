// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale.service.ts
//
// Operaciones:
//   createSaleDraft          — crea venta en DRAFT
//   updateSaleDraft          — edita cabecera de venta DRAFT
//   addSaleItemToDraft       — agrega línea a venta DRAFT
//   updateSaleItemInDraft    — edita línea de venta DRAFT
//   removeSaleItemFromDraft  — elimina línea de venta DRAFT
//   recalculateSaleTotals    — recalcula totales de la cabecera
//   cancelDraftSale          — cancela venta DRAFT
//
// Reglas críticas:
//   - Solo operaciones sobre ventas en estado DRAFT.
//   - No se confirman ventas aquí (Fase 3B o posterior).
//   - No se mueve inventario aquí.
//   - No se genera DTE aquí.
//   - Los totales siempre se calculan en el service, nunca se aceptan del cliente.
//   - tenant_id, location_id y user_id siempre provienen de la capa superior.
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CreateSaleDraftInput, UpdateSaleDraftInput, AddSaleItemInput, UpdateSaleItemInput } from "../schemas/sale.schemas";
import type { SaleResult, CreateSaleResult, AddSaleItemResult } from "../types/sale.types";
import {
  calculateSaleItemTotals,
  calculateSaleTotals,
  assertSaleIsDraft,
} from "../utils/sale-calculations";
import {
  extractSaleDateParts,
  getNextSaleSequence,
  buildSaleCode,
} from "../utils/sale-correlative";

// ── Recalcular totales de la cabecera ─────────────────────────────

async function recalcSaleTotals(
  tx:      Prisma.TransactionClient,
  sale_id: string,
  user_id: string,
): Promise<void> {
  const items = await tx.saleItem.findMany({
    where:  { sale_id },
    select: {
      line_subtotal:   true,
      tax_amount:      true,
      line_total:      true,
      discount_amount: true,
    },
  });

  const totals = calculateSaleTotals(items);

  await tx.sale.update({
    where: { id: sale_id },
    data: {
      subtotal:        new Prisma.Decimal(totals.subtotal),
      discount_amount: new Prisma.Decimal(totals.discount_amount),
      tax_amount:      new Prisma.Decimal(totals.tax_amount),
      total_amount:    new Prisma.Decimal(totals.total_amount),
      updated_by:      user_id,
    },
  });
}

// ── Helper: siguiente line_number disponible ──────────────────────

async function getNextLineNumber(
  tx:      Prisma.TransactionClient,
  sale_id: string,
): Promise<number> {
  const result = await tx.saleItem.aggregate({
    where: { sale_id },
    _max:  { line_number: true },
  });
  return (result._max.line_number ?? 0) + 1;
}

// ── Crear venta en DRAFT ──────────────────────────────────────────

export async function createSaleDraft(
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       CreateSaleDraftInput,
): Promise<CreateSaleResult> {
  // Validar customer si se especificó
  if (input.customer_id) {
    const customer = await prisma.customer.findFirst({
      where:  { id: input.customer_id, tenant_id, status: "active" },
      select: { id: true },
    });
    if (!customer) {
      return {
        ok:    false,
        field: "customer_id",
        error: "El cliente no existe o está inactivo en este tenant.",
      };
    }
  }

  const { year, month } = extractSaleDateParts(input.sale_date);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sequence  = await getNextSaleSequence(tx, tenant_id, location_id, year, month);
      const sale_code = buildSaleCode(year, month, sequence);

      const sale = await tx.sale.create({
        data: {
          tenant_id,
          location_id,
          customer_id:         input.customer_id         ?? null,
          sale_code,
          sale_year:           year,
          sale_month:          month,
          sale_sequence:       sequence,
          sale_date:           new Date(input.sale_date + "T00:00:00"),
          status:              "DRAFT",
          payment_status:      "UNPAID",
          payment_method_code: input.payment_method_code ?? null,
          notes:               input.notes               ?? null,
          subtotal:            0,
          discount_amount:     0,
          tax_amount:          0,
          total_amount:        0,
          created_by:          user_id,
          updated_by:          user_id,
        },
        select: { id: true, sale_code: true },
      });

      return sale;
    });

    return { ok: true, id: result.id, sale_code: result.sale_code };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok:    false,
        field: "sale_code",
        error: "Conflicto de correlativo. El sistema generó uno nuevo — reintenta.",
      };
    }
    throw e;
  }
}

// ── Actualizar cabecera de venta DRAFT ────────────────────────────

export async function updateSaleDraft(
  sale_id:     string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       UpdateSaleDraftInput,
): Promise<SaleResult> {
  const sale = await prisma.sale.findFirst({
    where:  { id: sale_id, tenant_id, location_id },
    select: { id: true, status: true },
  });
  if (!sale) {
    return { ok: false, error: "La venta no existe o no pertenece a la location activa." };
  }
  try {
    assertSaleIsDraft(sale.status);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (input.customer_id !== undefined && input.customer_id !== null) {
    const customer = await prisma.customer.findFirst({
      where:  { id: input.customer_id, tenant_id, status: "active" },
      select: { id: true },
    });
    if (!customer) {
      return {
        ok:    false,
        field: "customer_id",
        error: "El cliente no existe o está inactivo en este tenant.",
      };
    }
  }

  const dateData = input.sale_date
    ? {
        sale_date:  new Date(input.sale_date + "T00:00:00"),
        sale_year:  extractSaleDateParts(input.sale_date).year,
        sale_month: extractSaleDateParts(input.sale_date).month,
      }
    : {};

  await prisma.sale.update({
    where: { id: sale_id },
    data: {
      ...dateData,
      ...(input.customer_id        !== undefined && { customer_id:         input.customer_id }),
      ...(input.payment_method_code !== undefined && { payment_method_code: input.payment_method_code }),
      ...(input.notes              !== undefined && { notes:               input.notes }),
      updated_by: user_id,
    },
  });

  return { ok: true };
}

// ── Agregar línea a venta DRAFT ───────────────────────────────────

export async function addSaleItemToDraft(
  sale_id:     string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       AddSaleItemInput,
): Promise<AddSaleItemResult> {
  const sale = await prisma.sale.findFirst({
    where:  { id: sale_id, tenant_id, location_id },
    select: { id: true, status: true },
  });
  if (!sale) {
    return { ok: false, error: "La venta no existe o no pertenece a la location activa." };
  }
  try {
    assertSaleIsDraft(sale.status);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Validar producto
  const product = await prisma.product.findFirst({
    where: {
      id:         input.product_id,
      tenant_id,
      allow_sale: true,
      status:     { notIn: ["BLOCKED_SALE", "INACTIVE", "DISCONTINUED"] },
    },
    select: {
      id:           true,
      product_code: true,
      name:         true,
      product_type: true,
      is_stockable: true,
      sale_price:   true,
      tax_rate:     { select: { rate: true } },
    },
  });
  if (!product) {
    return {
      ok:    false,
      field: "product_id",
      error: "El producto no existe, no está activo o no permite ventas.",
    };
  }

  // Determinar tax_rate: override del input o del catálogo
  const tax_rate = input.tax_rate_override != null
    ? input.tax_rate_override
    : (product.tax_rate?.rate != null ? Number(product.tax_rate.rate) : null);

  // Calcular totales de línea
  const lineTotals = calculateSaleItemTotals({
    quantity:        input.quantity,
    unit_price:      input.unit_price,
    discount_amount: input.discount_amount ?? 0,
    tax_rate,
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const line_number = await getNextLineNumber(tx, sale_id);

      const item = await tx.saleItem.create({
        data: {
          sale_id,
          product_id:            input.product_id,
          line_number,
          product_code_snapshot: product.product_code,
          product_name_snapshot: product.name,
          product_type_snapshot: product.product_type,
          is_stockable_snapshot: product.is_stockable,
          quantity:              input.quantity,
          unit_price:            input.unit_price,
          discount_amount:       new Prisma.Decimal(input.discount_amount ?? 0),
          tax_rate_snapshot:     tax_rate != null ? new Prisma.Decimal(tax_rate) : null,
          tax_amount:            new Prisma.Decimal(lineTotals.tax_amount),
          line_subtotal:         new Prisma.Decimal(lineTotals.line_subtotal),
          line_total:            new Prisma.Decimal(lineTotals.line_total),
          notes:                 input.notes ?? null,
        },
        select: { id: true, line_number: true },
      });

      await recalcSaleTotals(tx, sale_id, user_id);

      return item;
    });

    return { ok: true, item_id: result.id, line_number: result.line_number };
  } catch (e) {
    if (e instanceof Error) return { ok: false, error: e.message };
    throw e;
  }
}

// ── Editar línea de venta DRAFT ───────────────────────────────────

export async function updateSaleItemInDraft(
  item_id:     string,
  sale_id:     string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       UpdateSaleItemInput,
): Promise<SaleResult> {
  const sale = await prisma.sale.findFirst({
    where:  { id: sale_id, tenant_id, location_id },
    select: { id: true, status: true },
  });
  if (!sale) {
    return { ok: false, error: "La venta no existe o no pertenece a la location activa." };
  }
  try {
    assertSaleIsDraft(sale.status);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const item = await prisma.saleItem.findFirst({
    where:  { id: item_id, sale_id },
    select: {
      id:              true,
      quantity:        true,
      unit_price:      true,
      discount_amount: true,
      tax_rate_snapshot: true,
    },
  });
  if (!item) {
    return { ok: false, error: "La línea de venta no existe en este documento." };
  }

  const quantity        = input.quantity        ?? Number(item.quantity);
  const unit_price      = input.unit_price      ?? Number(item.unit_price);
  const discount_amount = input.discount_amount ?? Number(item.discount_amount);
  const tax_rate        = input.tax_rate_override !== undefined
    ? input.tax_rate_override
    : (item.tax_rate_snapshot != null ? Number(item.tax_rate_snapshot) : null);

  const lineTotals = calculateSaleItemTotals({
    quantity,
    unit_price,
    discount_amount,
    tax_rate,
  });

  await prisma.$transaction(async (tx) => {
    await tx.saleItem.update({
      where: { id: item_id },
      data: {
        quantity:          quantity,
        unit_price:        unit_price,
        discount_amount:   new Prisma.Decimal(discount_amount),
        tax_rate_snapshot: tax_rate != null ? new Prisma.Decimal(tax_rate) : null,
        tax_amount:        new Prisma.Decimal(lineTotals.tax_amount),
        line_subtotal:     new Prisma.Decimal(lineTotals.line_subtotal),
        line_total:        new Prisma.Decimal(lineTotals.line_total),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
    await recalcSaleTotals(tx, sale_id, user_id);
  });

  return { ok: true };
}

// ── Eliminar línea de venta DRAFT ─────────────────────────────────

export async function removeSaleItemFromDraft(
  item_id:     string,
  sale_id:     string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
): Promise<SaleResult> {
  const sale = await prisma.sale.findFirst({
    where:  { id: sale_id, tenant_id, location_id },
    select: { id: true, status: true },
  });
  if (!sale) {
    return { ok: false, error: "La venta no existe o no pertenece a la location activa." };
  }
  try {
    assertSaleIsDraft(sale.status);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const item = await prisma.saleItem.findFirst({
    where:  { id: item_id, sale_id },
    select: { id: true },
  });
  if (!item) {
    return { ok: false, error: "La línea de venta no existe en este documento." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.saleItem.delete({ where: { id: item_id } });
    await recalcSaleTotals(tx, sale_id, user_id);
  });

  return { ok: true };
}

// ── Recalcular totales explícitamente ─────────────────────────────

export async function recalculateSaleTotals(
  sale_id:     string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
): Promise<SaleResult> {
  const sale = await prisma.sale.findFirst({
    where:  { id: sale_id, tenant_id, location_id },
    select: { id: true, status: true },
  });
  if (!sale) {
    return { ok: false, error: "La venta no existe o no pertenece a la location activa." };
  }
  try {
    assertSaleIsDraft(sale.status);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  await prisma.$transaction(async (tx) => {
    await recalcSaleTotals(tx, sale_id, user_id);
  });

  return { ok: true };
}

// ── Cancelar venta DRAFT ──────────────────────────────────────────

export async function cancelDraftSale(
  sale_id:     string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
): Promise<SaleResult> {
  const sale = await prisma.sale.findFirst({
    where:  { id: sale_id, tenant_id, location_id },
    select: { id: true, status: true },
  });
  if (!sale) {
    return { ok: false, error: "La venta no existe o no pertenece a la location activa." };
  }
  if (sale.status === "CONFIRMED") {
    return { ok: false, error: "No se puede cancelar una venta ya confirmada." };
  }
  if (sale.status === "CANCELLED") {
    return { ok: false, error: "La venta ya está cancelada." };
  }

  await prisma.sale.update({
    where: { id: sale_id },
    data: {
      status:       "CANCELLED",
      cancelled_at: new Date(),
      cancelled_by: user_id,
      updated_by:   user_id,
    },
  });

  return { ok: true };
}
