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
import { getAnyOpenCashSessionForLocation } from "../../cash/queries/get-any-open-cash-session-for-location";
import { isCashPayment, applyCashPaymentToSession } from "../../cash/services/cash-session-payment.service";

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
          customer_id:            input.customer_id              ?? null,
          sale_code,
          sale_year:              year,
          sale_month:             month,
          sale_sequence:          sequence,
          sale_date:              new Date(input.sale_date + "T00:00:00"),
          status:                 "DRAFT",
          payment_status:         "UNPAID",
          primary_dte_type_code:    input.primary_dte_type_code      ?? "01",
          payment_method_code:      input.payment_method_code        ?? null,
          condition_operation_code: input.condition_operation_code   ?? null,
          payment_term_code:        input.payment_term_code          ?? null,
          payment_term_value:       input.payment_term_value         ?? null,
          notes:                    input.notes                      ?? null,
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
      ...(input.customer_id               !== undefined && { customer_id:               input.customer_id }),
      ...(input.primary_dte_type_code     !== undefined && { primary_dte_type_code:     input.primary_dte_type_code }),
      ...(input.payment_method_code       !== undefined && { payment_method_code:       input.payment_method_code }),
      ...(input.condition_operation_code  !== undefined && { condition_operation_code:  input.condition_operation_code }),
      ...(input.payment_term_code         !== undefined && { payment_term_code:         input.payment_term_code }),
      ...(input.payment_term_value        !== undefined && { payment_term_value:        input.payment_term_value }),
      ...(input.notes                     !== undefined && { notes:                     input.notes }),
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

// ── Descartar borrador (eliminar físicamente) ─────────────────────
// Solo para ventas en DRAFT. No deja registro CANCELLED.

export async function discardDraftSale(
  sale_id:     string,
  tenant_id:   string,
  location_id: string,
): Promise<SaleResult> {
  const sale = await prisma.sale.findFirst({
    where:  { id: sale_id, tenant_id, location_id },
    select: { id: true, status: true },
  });
  if (!sale) {
    return { ok: false, error: "La venta no existe o no pertenece a la location activa." };
  }
  if (sale.status !== "DRAFT") {
    return { ok: false, error: "Solo se pueden descartar ventas en estado DRAFT." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.saleItem.deleteMany({ where: { sale_id } });
    await tx.salePayment.deleteMany({ where: { sale_id } });
    await tx.sale.delete({ where: { id: sale_id } });
  });

  return { ok: true };
}

// ── Confirmar venta: DRAFT → CONFIRMED + SALE_OUT ─────────────────
//
// Fase 4H: confirma (DRAFT → CONFIRMED) y aplica movimientos SALE_OUT.
// También procesa ventas ya CONFIRMED con inventory_moved=false.
// No genera DTE. La transacción es atómica.
//
// Casos:
//   DRAFT                        → validar + CONFIRMED + SALE_OUT + inventory_moved=true
//   CONFIRMED + !inventory_moved → solo SALE_OUT + inventory_moved=true
//   CONFIRMED + inventory_moved  → error (ya aplicado)
//   CANCELLED                    → error
//
// Por qué se inlinea el movimiento (igual que confirmPurchase):
//   recordInventoryMovement usa su propia prisma.$transaction interna,
//   imposibilitando la composición atómica sin modificar su firma.
//   SALE_OUT es siempre sustractivo: resulting_stock = stock_before - quantity.

export async function confirmSale(
  sale_id:     string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
): Promise<SaleResult> {
  // 1. Cargar venta con líneas
  const sale = await prisma.sale.findFirst({
    where: { id: sale_id, tenant_id, location_id },
    select: {
      id:                    true,
      status:                true,
      sale_code:             true,
      total_amount:          true,
      payment_method_code:   true,
      primary_dte_type_code: true,
      customer_id:           true,
      inventory_moved:       true,
      items: {
        select: {
          id:                    true,
          product_id:            true,
          product_name_snapshot: true,
          quantity:              true,
          unit_price:            true,
          line_total:            true,
          is_stockable_snapshot: true,
        },
      },
    },
  });

  if (!sale) {
    return { ok: false, error: "La venta no existe o no pertenece a la location activa." };
  }

  // 2. Validar estado
  if (sale.status === "CANCELLED") {
    return { ok: false, error: "No se puede confirmar una venta cancelada." };
  }
  if (sale.status === "CONFIRMED" && sale.inventory_moved) {
    return { ok: false, error: "La venta ya tiene inventario aplicado." };
  }
  if (sale.status !== "DRAFT" && !(sale.status === "CONFIRMED" && !sale.inventory_moved)) {
    return { ok: false, error: "La venta no puede procesarse en su estado actual." };
  }

  const isDraft = sale.status === "DRAFT";

  // 3. Validaciones de documento — solo para primera confirmación (DRAFT)
  if (isDraft) {
    if (sale.items.length === 0) {
      return { ok: false, error: "La venta no tiene líneas. Agrega al menos un producto antes de confirmar." };
    }

    for (const item of sale.items) {
      if (Number(item.quantity) <= 0) {
        return { ok: false, error: `La línea "${item.product_name_snapshot}" tiene cantidad inválida.` };
      }
      if (Number(item.unit_price) < 0) {
        return { ok: false, error: `La línea "${item.product_name_snapshot}" tiene precio inválido.` };
      }
      if (Number(item.line_total) < 0) {
        return { ok: false, error: `La línea "${item.product_name_snapshot}" tiene total inválido.` };
      }
    }

    if (Number(sale.total_amount) < 0) {
      return { ok: false, error: "El total de la venta no puede ser negativo." };
    }

    const ACTIVE_DTE_TYPES = ["01", "03"] as const;
    type ActiveDteType = typeof ACTIVE_DTE_TYPES[number];
    if (!ACTIVE_DTE_TYPES.includes(sale.primary_dte_type_code as ActiveDteType)) {
      return {
        ok:    false,
        error: `Tipo de DTE "${sale.primary_dte_type_code}" no está activo para confirmación.`,
      };
    }

    if (sale.primary_dte_type_code === "03" && !sale.customer_id) {
      return {
        ok:    false,
        error: "El Comprobante de Crédito Fiscal (CCFE 03) requiere un cliente seleccionado.",
      };
    }
  }

  // 4. Preparar entradas SALE_OUT: agrupar cantidades por product_id stockable
  const stockableItems = sale.items.filter((i) => i.is_stockable_snapshot);

  const totalQtyByProduct = new Map<string, number>();
  for (const item of stockableItems) {
    totalQtyByProduct.set(
      item.product_id,
      (totalQtyByProduct.get(item.product_id) ?? 0) + Number(item.quantity),
    );
  }

  // Pre-validar ProductLocations y stock (lectura fuera de tx para errores rápidos)
  type PlEntry = { id: string; current_stock: number };
  const plByProductId = new Map<string, PlEntry>();

  if (totalQtyByProduct.size > 0) {
    const stockableProductIds = [...totalQtyByProduct.keys()];

    const productLocations = await prisma.productLocation.findMany({
      where: {
        tenant_id,
        location_id,
        product_id: { in: stockableProductIds },
        is_active:  true,
      },
      select: { id: true, product_id: true, current_stock: true },
    });

    for (const pl of productLocations) {
      plByProductId.set(pl.product_id, {
        id:            pl.id,
        current_stock: Number(pl.current_stock),
      });
    }

    for (const [productId, totalQty] of totalQtyByProduct) {
      const itemName = stockableItems.find((i) => i.product_id === productId)?.product_name_snapshot ?? productId;

      if (!plByProductId.has(productId)) {
        return {
          ok:    false,
          error: `El producto "${itemName}" no tiene registro de stock en esta sucursal. Configura su inventario antes de confirmar.`,
        };
      }

      const available = plByProductId.get(productId)!.current_stock;
      if (available < totalQty) {
        return {
          ok:    false,
          error: `Stock insuficiente para "${itemName}". Disponible: ${available}, requerido: ${totalQty}.`,
        };
      }
    }
  }

  // 5. Buscar sesión de caja OPEN para el mismo tenant/location.
  //    Si existe, se asocia a la venta. Si no, cash_session_id queda null.
  //    No bloquea ni lanza error si no hay caja abierta.
  //    Solo aplica en la primera confirmación (isDraft); el path de recuperación
  //    (CONFIRMED + !inventory_moved) no sobrescribe cash_session_id.
  let openCashSessionId: string | null = null;
  if (isDraft) {
    const openSession = await getAnyOpenCashSessionForLocation({ tenant_id, location_id });
    openCashSessionId = openSession?.id ?? null;
  }

  // 5b. Preparar creación de SalePayment (solo en primera confirmación).
  //     payment_method_code en Sale usa códigos CAT-017, equivale a mh_payment_form_code.
  //     No se crea SalePayment si no hay método de pago o el total es 0.
  const pmCode    = sale.payment_method_code;
  const saleTotal = Number(sale.total_amount);
  const shouldCreatePayment = isDraft && !!pmCode && saleTotal > 0;
  const paymentIsCash       = shouldCreatePayment
    ? isCashPayment({ mh_payment_form_code: pmCode, payment_method_code: pmCode })
    : false;

  // 6. Transacción atómica: reclamar venta + SALE_OUT por cada producto stockable
  //
  //    Garantías de concurrencia:
  //    a) La venta se reclama con updateMany condicional al inicio de la tx.
  //       Solo la tx que obtenga count=1 avanza; las demás hacen rollback de inmediato.
  //       Esto elimina la ventana TOCTOU del patrón findFirst+throw.
  //    b) El stock se decrementa con updateMany + { decrement: qty } + guardia
  //       current_stock >= qty. Si otra tx lo decrementó primero y el stock baja,
  //       count=0 → rollback. No hay stock negativo ni decrementos perdidos.
  //    c) Si cualquier paso falla → rollback total → venta y stock sin cambios.
  try {
    await prisma.$transaction(async (tx) => {
      // Paso A: Reclamar la venta atómicamente.
      //   DRAFT        → CONFIRMED + inventory_moved=true (todo en un solo write)
      //   CONFIRMED+   → inventory_moved=true
      //   Si otra tx ya reclamó la venta, count=0 → rollback sin tocar stock.
      const claimResult = await tx.sale.updateMany({
        where: isDraft
          ? { id: sale_id, tenant_id, location_id, status: "DRAFT",     inventory_moved: false }
          : { id: sale_id, tenant_id, location_id, status: "CONFIRMED", inventory_moved: false },
        data: isDraft
          ? {
              status:          "CONFIRMED",
              confirmed_at:    new Date(),
              confirmed_by:    user_id,
              inventory_moved: true,
              cash_session_id: openCashSessionId,
              updated_by:      user_id,
            }
          : {
              inventory_moved: true,
              updated_by:      user_id,
            },
      });

      if (claimResult.count !== 1) {
        throw new Error("La venta ya fue confirmada o el inventario ya fue aplicado.");
      }

      // Paso B: Crear SalePayment y actualizar expected_cash_amount si aplica.
      //         Solo en primera confirmación (isDraft). El path de recuperación
      //         (CONFIRMED + !inventory_moved) no crea pagos duplicados.
      if (shouldCreatePayment) {
        await tx.salePayment.create({
          data: {
            sale_id,
            payment_method_code:  pmCode!,
            mh_payment_form_code: pmCode,
            amount:          new Prisma.Decimal(saleTotal),
            paid_at:         new Date(),
            cash_session_id: openCashSessionId,
            created_by:      user_id,
          },
        });

        // Solo efectivo (mh_payment_form_code "01") incrementa expected_cash_amount.
        // Si la sesión cerró concurrentemente, applyCashPaymentToSession lo ignora.
        if (paymentIsCash && openCashSessionId) {
          await applyCashPaymentToSession(tx, {
            cash_session_id: openCashSessionId,
            amount:          saleTotal,
          });
        }
      }

      // Paso C: Por cada producto stockable agrupado, decrementar stock y crear SALE_OUT.
      for (const [productId, totalQty] of totalQtyByProduct) {
        const plEntry  = plByProductId.get(productId)!;
        const itemName = stockableItems.find((i) => i.product_id === productId)?.product_name_snapshot ?? productId;

        // Decrementar atómicamente con guardia de stock suficiente y producto activo.
        // Si otra tx ya decrementó y el stock bajó por debajo de totalQty, count=0 → rollback.
        const decrementResult = await tx.productLocation.updateMany({
          where: {
            id:            plEntry.id,
            tenant_id,
            location_id,
            product_id:    productId,
            is_active:     true,
            current_stock: { gte: totalQty },
          },
          data: {
            current_stock: { decrement: totalQty },
            updated_by:    user_id,
          },
        });

        if (decrementResult.count !== 1) {
          throw new Error(
            `Stock insuficiente para "${itemName}". El stock puede haber cambiado desde la última lectura.`,
          );
        }

        // Leer saldo resultante para materializar el movimiento con valores reales.
        const updatedPl = await tx.productLocation.findFirst({
          where:  { id: plEntry.id },
          select: { current_stock: true },
        });

        const resulting_stock = Number(updatedPl!.current_stock);
        const stock_before    = resulting_stock + totalQty;

        await tx.inventoryMovement.create({
          data: {
            tenant_id,
            location_id,
            product_id:          productId,
            product_location_id: plEntry.id,
            movement_type:       "SALE_OUT",
            quantity:            totalQty,
            stock_before,
            resulting_stock,
            reference_entity:    "sale",
            reference_id:        sale_id,
            reference_code:      sale.sale_code,
            performed_by:        user_id,
          },
        });
      }
    });

    return { ok: true };
  } catch (e) {
    if (e instanceof Error) return { ok: false, error: e.message };
    throw e;
  }
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
