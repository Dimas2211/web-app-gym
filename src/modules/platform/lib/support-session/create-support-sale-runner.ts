// ─────────────────────────────────────────────────────────────────
// platform/lib/support-session — create-support-sale-runner.ts
//
// F1-B1: Runner SERVER-ONLY para crear una venta de prueba
// directamente CONFIRMED en la base cliente de un PlatformDatabaseProfile.
//
// Replica (sin modificar) las fórmulas y el flujo de
// commerce/sales/services/sale.service.ts:
//   - line_subtotal / tax_amount / line_total  → sale-calculations.ts
//   - sale_code (VTA-YYYY-MM-NNNN)              → sale-correlative.ts
//   - SALE_OUT + decremento de stock con guardia → mismo patrón que confirmSale
//   - SalePayment + expected_cash_amount         → cash-session-payment.service.ts
//
// Garantías:
// - No genera DTE. No crea DteOutgoingDocument.
// - No crea CashMovement. No exige caja abierta.
// - No escribe Product, Customer, Supplier, Branch, User ni catálogos.
// - created_by/confirmed_by/performed_by quedan null — no existe un User
//   correspondiente al admin de Platform en la base cliente (evita violar
//   la FK real de Sale.created_by → User.id).
// - Todo ocurre en una sola transacción atómica sobre el cliente dinámico.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[create-support-sale-runner] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { PrismaClient, Prisma } from "@prisma/client";
import {
  calculateSaleItemTotals,
  calculateSaleTotals,
} from "../../../commerce/sales/utils/sale-calculations";
import {
  extractSaleDateParts,
  getNextSaleSequence,
  buildSaleCode,
} from "../../../commerce/sales/utils/sale-correlative";
import {
  isCashPayment,
  applyCashPaymentToSession,
} from "../../../commerce/cash/services/cash-session-payment.service";
import { SUPPORT_SALE_ACTIVE_DTE_TYPES } from "./create-support-sale.constants";
import type {
  CreateSupportSaleInput,
  CreateSupportSalePreviewResult,
  CreateSupportSaleResult,
  SupportSaleComputedItem,
} from "../../types/platform.types";

// ── Validación compartida entre preview y ejecución ───────────────

interface ValidatedItem {
  product_id:     string;
  product_code:   string;
  product_name:   string;
  product_type:   string;
  is_stockable:   boolean;
  quantity:       number;
  unit_price:     number;
  tax_rate:       number | null;
  computed:       ReturnType<typeof calculateSaleItemTotals>;
  available_stock: number | null;
  product_location_id: string | null;
}

interface ValidatedSale {
  location_id:           string;
  customer_id:           string | null;
  primary_dte_type_code: "01" | "03";
  payment_method_code:   string | null;
  notes:                 string | null;
  items:                 ValidatedItem[];
  totals:                ReturnType<typeof calculateSaleTotals>;
  willCreatePayment:     boolean;
  warnings:              string[];
}

type ValidationResult =
  | { ok: true; data: ValidatedSale }
  | { ok: false; error: string; field?: string };

async function validateSupportSale(
  client:    PrismaClient,
  tenantId:  string,
  input:     CreateSupportSaleInput,
): Promise<ValidationResult> {
  const warnings: string[] = [];

  // 1. Sucursal existe, activa y pertenece al tenant
  const branch = await client.branch.findFirst({
    where:  { id: input.location_id, gym_id: tenantId, status: "active" },
    select: { id: true },
  });
  if (!branch) {
    return {
      ok: false, field: "location_id",
      error: "La sucursal no existe, está inactiva o no pertenece al tenant de este perfil.",
    };
  }

  // 2. Cliente (opcional para FE 01, requerido para CCFE 03)
  if (input.primary_dte_type_code === "03" && !input.customer_id) {
    return {
      ok: false, field: "customer_id",
      error: "El Comprobante de Crédito Fiscal (CCFE 03) requiere un cliente seleccionado.",
    };
  }
  if (input.customer_id) {
    const customer = await client.customer.findFirst({
      where:  { id: input.customer_id, tenant_id: tenantId, status: "active" },
      select: { id: true },
    });
    if (!customer) {
      return {
        ok: false, field: "customer_id",
        error: "El cliente no existe o está inactivo en este tenant.",
      };
    }
  }

  // 3. Tipo de DTE permitido en F1-B1
  if (!SUPPORT_SALE_ACTIVE_DTE_TYPES.includes(input.primary_dte_type_code)) {
    return {
      ok: false, field: "primary_dte_type_code",
      error: `Tipo de DTE "${input.primary_dte_type_code}" no está permitido en F1-B1.`,
    };
  }

  // 4. Al menos una línea
  if (!input.items || input.items.length === 0) {
    return { ok: false, error: "La venta debe tener al menos una línea." };
  }

  // 5. Validar y calcular cada línea
  const validatedItems: ValidatedItem[] = [];
  for (const line of input.items) {
    if (line.quantity <= 0) {
      return { ok: false, field: "quantity", error: "La cantidad debe ser mayor que cero." };
    }
    if (line.unit_price < 0) {
      return { ok: false, field: "unit_price", error: "El precio unitario no puede ser negativo." };
    }

    const product = await client.product.findFirst({
      where: {
        id:         line.product_id,
        tenant_id:  tenantId,
        allow_sale: true,
        status:     { notIn: ["BLOCKED_SALE", "INACTIVE", "DISCONTINUED"] },
      },
      select: {
        id: true, product_code: true, name: true,
        product_type: true, is_stockable: true,
        tax_rate: { select: { rate: true } },
      },
    });
    if (!product) {
      return {
        ok: false, field: "product_id",
        error: `El producto (${line.product_id}) no existe, no está activo o no permite ventas.`,
      };
    }

    const tax_rate = product.tax_rate?.rate != null ? Number(product.tax_rate.rate) : null;
    const computed = calculateSaleItemTotals({
      quantity:        line.quantity,
      unit_price:      line.unit_price,
      discount_amount: 0,
      tax_rate,
    });

    let available_stock: number | null = null;
    let product_location_id: string | null = null;

    if (product.is_stockable) {
      const pl = await client.productLocation.findFirst({
        where: {
          tenant_id: tenantId, location_id: input.location_id,
          product_id: product.id, is_active: true,
        },
        select: { id: true, current_stock: true },
      });
      if (!pl) {
        return {
          ok: false, field: "product_id",
          error: `El producto "${product.name}" no tiene registro de stock en esta sucursal.`,
        };
      }
      available_stock     = Number(pl.current_stock);
      product_location_id = pl.id;
    }

    validatedItems.push({
      product_id:   product.id,
      product_code: product.product_code,
      product_name: product.name,
      product_type: String(product.product_type),
      is_stockable: product.is_stockable,
      quantity:     line.quantity,
      unit_price:   line.unit_price,
      tax_rate,
      computed,
      available_stock,
      product_location_id,
    });
  }

  // 6. Validar stock suficiente agrupando por producto
  const qtyByProduct = new Map<string, number>();
  for (const item of validatedItems) {
    if (!item.is_stockable) continue;
    qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) ?? 0) + item.quantity);
  }
  for (const item of validatedItems) {
    if (!item.is_stockable) continue;
    const totalQty = qtyByProduct.get(item.product_id)!;
    if ((item.available_stock ?? 0) < totalQty) {
      return {
        ok: false, field: "product_id",
        error: `Stock insuficiente para "${item.product_name}". Disponible: ${item.available_stock}, requerido: ${totalQty}.`,
      };
    }
  }

  // 7. Totales de cabecera — recalculados server-side, nunca confiar en el cliente
  const totals = calculateSaleTotals(
    validatedItems.map((i) => ({
      line_subtotal:   i.computed.line_subtotal,
      tax_amount:      i.computed.tax_amount,
      line_total:      i.computed.line_total,
      discount_amount: 0,
    })),
  );
  if (totals.total_amount < 0) {
    return { ok: false, error: "El total de la venta no puede ser negativo." };
  }

  const willCreatePayment = !!input.payment_method_code && totals.total_amount > 0;
  if (input.payment_method_code && totals.total_amount === 0) {
    warnings.push("Se especificó método de pago pero el total de la venta es cero — no se creará SalePayment.");
  }

  return {
    ok: true,
    data: {
      location_id:           input.location_id,
      customer_id:           input.customer_id ?? null,
      primary_dte_type_code: input.primary_dte_type_code,
      payment_method_code:   input.payment_method_code ?? null,
      notes:                 input.notes ?? null,
      items:                 validatedItems,
      totals,
      willCreatePayment,
      warnings,
    },
  };
}

// ── Preview (dry-run) — solo lectura ──────────────────────────────

export async function previewSupportSale(
  client:   PrismaClient,
  tenantId: string,
  input:    CreateSupportSaleInput,
): Promise<
  | { ok: true; preview: CreateSupportSalePreviewResult }
  | { ok: false; error: string; field?: string }
> {
  const validation = await validateSupportSale(client, tenantId, input);
  if (!validation.ok) return validation;

  const { data } = validation;

  const items: SupportSaleComputedItem[] = data.items.map((i) => ({
    product_id:      i.product_id,
    product_code:    i.product_code,
    product_name:    i.product_name,
    is_stockable:    i.is_stockable,
    quantity:        i.quantity,
    unit_price:      i.unit_price,
    tax_rate:        i.tax_rate,
    line_subtotal:   i.computed.line_subtotal,
    tax_amount:      i.computed.tax_amount,
    line_total:      i.computed.line_total,
    available_stock: i.available_stock,
  }));

  return {
    ok: true,
    preview: {
      items,
      totals:            data.totals,
      willCreatePayment: data.willCreatePayment,
      warnings:          data.warnings,
    },
  };
}

// ── Ejecución real — transacción atómica ──────────────────────────

export async function createSupportSaleRunner(
  client:   PrismaClient,
  tenantId: string,
  input:    CreateSupportSaleInput,
): Promise<
  | { ok: true; result: CreateSupportSaleResult }
  | { ok: false; error: string; field?: string }
> {
  // Validación fuera de la transacción — fail fast sin abrir tx innecesaria.
  const validation = await validateSupportSale(client, tenantId, input);
  if (!validation.ok) return validation;

  const { data } = validation;

  try {
    const result = await client.$transaction(async (tx) => {
      // 1. Correlativo interno de venta (mismo patrón que createSaleDraft)
      const today        = new Date();
      const isoDate       = today.toISOString().slice(0, 10);
      const { year, month } = extractSaleDateParts(isoDate);
      const sequence      = await getNextSaleSequence(tx, tenantId, data.location_id, year, month);
      const sale_code     = buildSaleCode(year, month, sequence);

      // 2. Crear venta DRAFT
      const sale = await tx.sale.create({
        data: {
          tenant_id:             tenantId,
          location_id:           data.location_id,
          customer_id:           data.customer_id,
          sale_code,
          sale_year:             year,
          sale_month:            month,
          sale_sequence:         sequence,
          sale_date:             new Date(isoDate + "T00:00:00"),
          status:                "DRAFT",
          payment_status:        "UNPAID",
          primary_dte_type_code: data.primary_dte_type_code,
          payment_method_code:   data.payment_method_code,
          notes:                 data.notes,
          subtotal:              new Prisma.Decimal(0),
          discount_amount:       new Prisma.Decimal(0),
          tax_amount:            new Prisma.Decimal(0),
          total_amount:          new Prisma.Decimal(0),
        },
        select: { id: true, sale_code: true },
      });

      // 3. Crear líneas
      let lineNumber = 1;
      for (const item of data.items) {
        await tx.saleItem.create({
          data: {
            sale_id:               sale.id,
            product_id:            item.product_id,
            line_number:           lineNumber++,
            product_code_snapshot: item.product_code,
            product_name_snapshot: item.product_name,
            product_type_snapshot: item.product_type,
            is_stockable_snapshot: item.is_stockable,
            quantity:              item.quantity,
            unit_price:            item.unit_price,
            discount_amount:       new Prisma.Decimal(0),
            tax_rate_snapshot:     item.tax_rate != null ? new Prisma.Decimal(item.tax_rate) : null,
            tax_amount:            new Prisma.Decimal(item.computed.tax_amount),
            line_subtotal:         new Prisma.Decimal(item.computed.line_subtotal),
            line_total:            new Prisma.Decimal(item.computed.line_total),
          },
        });
      }

      // 4. Recalcular totales de cabecera server-side (nunca confiar en el cliente)
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          subtotal:        new Prisma.Decimal(data.totals.subtotal),
          discount_amount: new Prisma.Decimal(data.totals.discount_amount),
          tax_amount:      new Prisma.Decimal(data.totals.tax_amount),
          total_amount:    new Prisma.Decimal(data.totals.total_amount),
        },
      });

      // 5. Caja abierta (opcional) — solo asociar, no exigir ni crear CashMovement
      const openSession = await tx.cashSession.findFirst({
        where:   { tenant_id: tenantId, location_id: data.location_id, status: "OPEN" },
        orderBy: { opened_at: "desc" },
        select:  { id: true },
      });
      const openCashSessionId = openSession?.id ?? null;

      // 6. Confirmar venta: DRAFT → CONFIRMED + inventory_moved
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status:          "CONFIRMED",
          confirmed_at:    new Date(),
          inventory_moved: true,
          cash_session_id: openCashSessionId,
        },
      });

      // 7. SalePayment (solo si hay método de pago y total > 0)
      if (data.willCreatePayment && data.payment_method_code) {
        const paymentIsCash = isCashPayment({
          mh_payment_form_code: data.payment_method_code,
          payment_method_code:  data.payment_method_code,
        });

        await tx.salePayment.create({
          data: {
            sale_id:              sale.id,
            payment_method_code:  data.payment_method_code,
            mh_payment_form_code: data.payment_method_code,
            amount:               new Prisma.Decimal(data.totals.total_amount),
            paid_at:              new Date(),
            cash_session_id:      openCashSessionId,
          },
        });

        if (paymentIsCash && openCashSessionId) {
          await applyCashPaymentToSession(tx, {
            cash_session_id: openCashSessionId,
            amount:          data.totals.total_amount,
          });
        }
      }

      // 8. SALE_OUT por producto stockable — mismo patrón de guardia que confirmSale
      const qtyByProduct = new Map<string, { qty: number; plId: string; name: string }>();
      for (const item of data.items) {
        if (!item.is_stockable || !item.product_location_id) continue;
        const existing = qtyByProduct.get(item.product_id);
        qtyByProduct.set(item.product_id, {
          qty:  (existing?.qty ?? 0) + item.quantity,
          plId: item.product_location_id,
          name: item.product_name,
        });
      }

      for (const [productId, entry] of qtyByProduct) {
        const decrementResult = await tx.productLocation.updateMany({
          where: {
            id: entry.plId, tenant_id: tenantId, location_id: data.location_id,
            product_id: productId, is_active: true,
            current_stock: { gte: entry.qty },
          },
          data: { current_stock: { decrement: entry.qty } },
        });

        if (decrementResult.count !== 1) {
          throw new Error(
            `Stock insuficiente para "${entry.name}". El stock puede haber cambiado desde la última lectura.`,
          );
        }

        const updatedPl = await tx.productLocation.findFirst({
          where:  { id: entry.plId },
          select: { current_stock: true },
        });
        const resulting_stock = Number(updatedPl!.current_stock);
        const stock_before    = resulting_stock + entry.qty;

        await tx.inventoryMovement.create({
          data: {
            tenant_id:           tenantId,
            location_id:         data.location_id,
            product_id:          productId,
            product_location_id: entry.plId,
            movement_type:       "SALE_OUT",
            quantity:            entry.qty,
            stock_before,
            resulting_stock,
            reference_entity:    "sale",
            reference_id:        sale.id,
            reference_code:      sale.sale_code,
          },
        });
      }

      return {
        saleId:         sale.id,
        saleCode:       sale.sale_code,
        status:         "CONFIRMED" as const,
        total:          data.totals.total_amount,
        inventoryMoved: true,
        itemsCount:     data.items.length,
        warnings:       data.warnings,
      };
    });

    return { ok: true, result };
  } catch (e) {
    if (e instanceof Error) return { ok: false, error: e.message };
    throw e;
  }
}
