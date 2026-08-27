// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase.service.ts
//
// Lógica de negocio del módulo de compras.
// Sin "use server" — importable desde actions y route handlers.
//
// Operaciones:
//   createPurchase              — crea un documento en DRAFT
//   addPurchaseItem             — agrega o reemplaza una línea en DRAFT
//   updatePurchaseItem          — edita una línea existente en DRAFT
//   removePurchaseItem          — elimina una línea en DRAFT
//   confirmPurchase             — DRAFT → CONFIRMED + genera movimientos PURCHASE_IN
//   cancelPurchase              — DRAFT → CANCELLED
//   cancelConfirmedPurchase     — CONFIRMED → CANCELLED + reversión RETURN_OUT por stockables
//
// Regla crítica de stock en confirmPurchase:
//   Los movimientos PURCHASE_IN y el cambio de estado a CONFIRMED ocurren
//   en una sola prisma.$transaction. Si cualquier movimiento falla, el
//   rollback deja la compra en DRAFT sin movimientos registrados.
//   La lógica de movimiento se inlinea aquí (no usa recordInventoryMovement)
//   porque ese service usa su propia tx interna, haciendo imposible la composición
//   atómica sin modificar su firma. PURCHASE_IN es siempre aditivo.
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CreatePurchaseInput } from "../schemas/create-purchase.schema";
import type { AddPurchaseItemInput, UpdatePurchaseItemInput } from "../schemas/purchase-item.schema";
import { getNextPurchaseCode } from "../queries/get-next-purchase-code";
import { RETENTION_1PCT_APPLICABLE_DOCTYPES, isFseDocumentType } from "../constants/purchase-document.constants";
import {
  computeIncomeTaxWithholding,
  type PaymentNature,
  type SupplierPersonType,
} from "./income-tax-withholding.util";

// Estados del DTE de la compra a partir de los cuales los datos fiscales
// de Renta ya no pueden editarse por esta vía — mismo corte que "canSign"
// en el Panel Fiscal DTE (dte-status.utils / purchase-dte-fiscal-panel.tsx).
// Antes de SIGNED, el JSON aún no se firmó: es seguro recalcular.
const DTE_STATUSES_ALLOWING_NATURE_EDIT: readonly string[] = [
  "PENDING_GENERATION", "GENERATED", "SCHEMA_VALIDATED",
];

// ── Tipos de resultado ────────────────────────────────────────────

export type PurchaseResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

export type CreatePurchaseResult =
  | { ok: true; id: string; purchase_code: string }
  | { ok: false; error: string; field?: string };

// ── Helpers internos ──────────────────────────────────────────────

/** Extrae { year, month } de un string YYYY-MM-DD o de un Date. */
function extractYearMonth(date: Date | string): { year: number; month: number } {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

async function evalRetention1pct(
  tx:         Prisma.TransactionClient,
  purchaseId: string,
  subtotal:   number,
): Promise<{ applies: boolean; amount: number }> {
  const purchase = await tx.purchase.findFirst({
    where:  { id: purchaseId },
    select: { document_type: true, supplier_id: true, tenant_id: true },
  });

  if (
    !purchase?.document_type ||
    !RETENTION_1PCT_APPLICABLE_DOCTYPES.includes(purchase.document_type)
  ) {
    return { applies: false, amount: 0 };
  }

  const [supplier, fiscalConfig] = await Promise.all([
    tx.supplier.findFirst({
      where:  { id: purchase.supplier_id },
      select: { is_subject_to_1pct_retention: true },
    }),
    tx.tenantFiscalConfig.findFirst({
      where:  { tenant_id: purchase.tenant_id },
      select: { is_retention_agent: true, retention_threshold_amount: true },
    }),
  ]);

  if (!supplier?.is_subject_to_1pct_retention || !fiscalConfig?.is_retention_agent) {
    return { applies: false, amount: 0 };
  }

  const threshold = Number(fiscalConfig.retention_threshold_amount ?? 100);
  if (subtotal <= threshold) {
    return { applies: false, amount: 0 };
  }

  const amount = Math.round(subtotal * 0.01 * 100) / 100;
  return { applies: true, amount };
}

async function recalcPurchaseTotals(
  tx:         Prisma.TransactionClient,
  purchaseId: string,
  updatedBy:  string,
): Promise<void> {
  const items = await tx.purchaseItem.findMany({
    where:  { purchase_id: purchaseId },
    select: { line_subtotal: true, tax_amount: true },
  });

  const subtotal     = items.reduce((s, i) => s + Number(i.line_subtotal), 0);
  const tax_amount   = items.reduce((s, i) => s + Number(i.tax_amount),    0);
  const total_amount = subtotal + tax_amount;

  const { applies, amount } = await evalRetention1pct(tx, purchaseId, subtotal);

  // ── Renta: re-seguir el totalCompra (subtotal) si ya hay una naturaleza
  //    de pago declarada. Nunca se infiere una naturaleza nueva aquí —
  //    solo se recalcula el monto sobre la base vigente, para que Purchase
  //    nunca conserve una retención vieja calculada sobre un subtotal
  //    distinto (ver "Recalculo" en el flujo FSE 14).
  const purchase = await tx.purchase.findFirst({
    where:  { id: purchaseId },
    select: {
      payment_nature:                 true,
      income_tax_withholding_applies: true,
      income_tax_withholding_base:    true,
      supplier: { select: { person_type: true } },
    },
  });

  let incomeTaxUpdate: Partial<{
    income_tax_withholding_applies: boolean;
    income_tax_withholding_rate:    Prisma.Decimal | null;
    income_tax_withholding_amount:  Prisma.Decimal;
    income_tax_withholding_base:    Prisma.Decimal;
  }> = {};

  if (purchase?.payment_nature) {
    const nature = purchase.payment_nature as PaymentNature;
    const manualBase = nature === "GOODS_AND_SERVICES"
      ? Number(purchase.income_tax_withholding_base)
      : undefined;

    const calc = computeIncomeTaxWithholding({
      paymentNature:      nature,
      supplierPersonType: purchase.supplier.person_type as SupplierPersonType,
      totalCompra:        subtotal,
      manualBase,
    });

    // Si el recálculo ya no es válido (p.ej. GOODS_AND_SERVICES cuya base
    // manual quedó por encima del nuevo subtotal más bajo), no se bloquea
    // el guardado de líneas — se conserva el último estado fiscal válido
    // y el usuario debe revisar la Naturaleza del pago manualmente.
    if (calc.ok) {
      incomeTaxUpdate = {
        income_tax_withholding_applies: calc.result.applies,
        income_tax_withholding_rate:    calc.result.rate == null ? null : new Prisma.Decimal(calc.result.rate),
        income_tax_withholding_amount:  new Prisma.Decimal(calc.result.amount),
        income_tax_withholding_base:    new Prisma.Decimal(calc.result.base),
      };
    }
  }

  await tx.purchase.update({
    where: { id: purchaseId },
    data: {
      subtotal:               new Prisma.Decimal(subtotal),
      tax_amount:             new Prisma.Decimal(tax_amount),
      total_amount:           new Prisma.Decimal(total_amount),
      retention_1pct_applies: applies,
      retention_1pct_amount:  new Prisma.Decimal(amount),
      ...incomeTaxUpdate,
      updated_by:             updatedBy,
    },
  });
}

// ── Crear compra en DRAFT ─────────────────────────────────────────

export async function createPurchase(
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       CreatePurchaseInput,
): Promise<CreatePurchaseResult> {
  // Verificar que el proveedor existe y pertenece al tenant
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplier_id, tenant_id, status: "active" },
    select: { id: true },
  });
  if (!supplier) {
    return {
      ok:    false,
      field: "supplier_id",
      error: "El proveedor no existe o está inactivo en este tenant.",
    };
  }

  const { year, month } = extractYearMonth(input.purchase_date);

  // Si viene correlativo manual, normaliza (entero sin ceros a la izquierda).
  // Si no viene, calcula MAX+1 del mes para la location.
  const purchase_code = input.purchase_code
    ? String(parseInt(input.purchase_code, 10))
    : String(await getNextPurchaseCode(location_id, year, month));

  try {
    const purchase = await prisma.purchase.create({
      data: {
        tenant_id,
        location_id,
        supplier_id:    input.supplier_id,
        purchase_code,
        purchase_year:  year,
        purchase_month: month,
        purchase_date:  new Date(input.purchase_date + "T00:00:00"),
        status:         "DRAFT",
        document_type:     input.document_type     ?? null,
        document_series:   input.document_series   ?? null,
        document_number:   input.document_number   ?? null,
        payment_condition: input.payment_condition ?? null,
        cancellation_type: input.cancellation_type ?? null,
        notes:          input.notes ?? null,
        subtotal:       0,
        tax_amount:     0,
        total_amount:   0,
        created_by:     user_id,
        updated_by:     user_id,
      },
      select: { id: true, purchase_code: true },
    });
    return { ok: true, id: purchase.id, purchase_code: purchase.purchase_code };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok:    false,
        field: "purchase_code",
        error: "Ya existe una compra con ese correlativo en este mes. El sistema sugirió uno nuevo — reintenta.",
      };
    }
    throw e;
  }
}

// ── Agregar línea a una compra en DRAFT ───────────────────────────

export async function addPurchaseItem(
  purchase_id: string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       AddPurchaseItemInput,
): Promise<PurchaseResult> {
  // Verificar que la compra existe, pertenece al tenant+location y está en DRAFT
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchase_id, tenant_id, location_id },
    select: { id: true, status: true, document_type: true },
  });
  if (!purchase) {
    return { ok: false, error: "La compra no existe o no pertenece a la location activa." };
  }
  if (purchase.status !== "DRAFT") {
    return { ok: false, error: "Solo se pueden agregar líneas a compras en estado DRAFT." };
  }

  // Verificar que el producto existe en el tenant y es válido para compra
  const product = await prisma.product.findFirst({
    where: {
      id:             input.product_id,
      tenant_id,
      allow_purchase: true,
      status:         { notIn: ["BLOCKED_PURCHASE", "INACTIVE", "DISCONTINUED"] },
    },
    select: { id: true },
  });
  if (!product) {
    return {
      ok:    false,
      field: "product_id",
      error: "El producto no existe, no está activo, o no permite compras.",
    };
  }

  // FSE (compra a sujeto excluido) nunca genera crédito fiscal IVA — el
  // servidor ignora cualquier tax_amount enviado por el cliente y fuerza 0,
  // sin importar Product.tax_rate. No basta con ocultarlo en la UI.
  const isFse    = isFseDocumentType(purchase.document_type);
  const taxInput = isFse ? 0 : input.tax_amount;

  // Calcular totales de línea
  const line_subtotal = input.quantity * input.unit_cost;
  const line_total    = line_subtotal + taxInput;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.purchaseItem.create({
        data: {
          purchase_id:   purchase_id,
          product_id:    input.product_id,
          quantity:      input.quantity,
          unit_cost:     input.unit_cost,
          tax_amount:    taxInput,
          line_subtotal: new Prisma.Decimal(line_subtotal),
          line_total:    new Prisma.Decimal(line_total),
          notes:         input.notes ?? null,
        },
      });
      await recalcPurchaseTotals(tx, purchase_id, user_id);
    });
    return { ok: true };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok:    false,
        field: "product_id",
        error: "Este producto ya está en la compra. Edita la línea existente para cambiar cantidad o costo.",
      };
    }
    throw e;
  }
}

// ── Editar línea existente en DRAFT ──────────────────────────────

export async function updatePurchaseItem(
  item_id:     string,
  purchase_id: string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       UpdatePurchaseItemInput,
): Promise<PurchaseResult> {
  // Verificar compra en DRAFT
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchase_id, tenant_id, location_id },
    select: { id: true, status: true, document_type: true },
  });
  if (!purchase) {
    return { ok: false, error: "La compra no existe o no pertenece a la location activa." };
  }
  if (purchase.status !== "DRAFT") {
    return { ok: false, error: "Solo se pueden editar líneas de compras en estado DRAFT." };
  }

  // Leer la línea actual para recalcular
  const item = await prisma.purchaseItem.findFirst({
    where: { id: item_id, purchase_id },
    select: {
      id:            true,
      quantity:      true,
      unit_cost:     true,
      tax_amount:    true,
    },
  });
  if (!item) {
    return { ok: false, error: "La línea de compra no existe en este documento." };
  }

  // FSE nunca genera crédito fiscal IVA — se ignora cualquier tax_amount
  // enviado, sin importar Product.tax_rate. Ver isFseDocumentType.
  const isFse      = isFseDocumentType(purchase.document_type);
  const quantity    = input.quantity   ?? Number(item.quantity);
  const unit_cost   = input.unit_cost  ?? Number(item.unit_cost);
  const tax_amount  = isFse ? 0 : (input.tax_amount ?? Number(item.tax_amount));

  const line_subtotal = quantity * unit_cost;
  const line_total    = line_subtotal + tax_amount;

  await prisma.$transaction(async (tx) => {
    await tx.purchaseItem.update({
      where: { id: item_id },
      data: {
        quantity:      quantity,
        unit_cost:     unit_cost,
        tax_amount:    tax_amount,
        line_subtotal: new Prisma.Decimal(line_subtotal),
        line_total:    new Prisma.Decimal(line_total),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
    await recalcPurchaseTotals(tx, purchase_id, user_id);
  });

  return { ok: true };
}

// ── Eliminar línea de una compra en DRAFT ─────────────────────────

export async function removePurchaseItem(
  item_id:     string,
  purchase_id: string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
): Promise<PurchaseResult> {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchase_id, tenant_id, location_id },
    select: { id: true, status: true },
  });
  if (!purchase) {
    return { ok: false, error: "La compra no existe o no pertenece a la location activa." };
  }
  if (purchase.status !== "DRAFT") {
    return { ok: false, error: "Solo se pueden eliminar líneas de compras en estado DRAFT." };
  }

  const item = await prisma.purchaseItem.findFirst({
    where: { id: item_id, purchase_id },
    select: { id: true },
  });
  if (!item) {
    return { ok: false, error: "La línea de compra no existe en este documento." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseItem.delete({ where: { id: item_id } });
    await recalcPurchaseTotals(tx, purchase_id, user_id);
  });

  return { ok: true };
}

// ── Confirmar compra: DRAFT → CONFIRMED ───────────────────────────

export async function confirmPurchase(
  purchase_id: string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
): Promise<PurchaseResult> {
  // 1. Leer la compra completa con sus líneas.
  //    Lectura fuera de transacción: solo validación, sin mutación.
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchase_id, tenant_id, location_id },
    select: {
      id:             true,
      status:         true,
      purchase_code:  true,
      document_type:  true,
      payment_nature: true,
      items: {
        select: {
          id:         true,
          product_id: true,
          quantity:   true,
          unit_cost:  true,
          product: {
            select: {
              is_stockable:   true,
              allow_purchase: true,
              status:         true,
            },
          },
        },
      },
    },
  });

  if (!purchase) {
    return { ok: false, error: "La compra no existe o no pertenece a la location activa." };
  }

  // Guard único de estado: solo se puede confirmar desde DRAFT.
  if (purchase.status !== "DRAFT") {
    if (purchase.status === "CONFIRMED") {
      return { ok: false, error: "Esta compra ya fue confirmada." };
    }
    if (purchase.status === "CANCELLED") {
      return { ok: false, error: "No se puede confirmar una compra anulada." };
    }
    return { ok: false, error: "La compra no está en estado DRAFT y no puede confirmarse." };
  }

  if (purchase.items.length === 0) {
    return { ok: false, error: "La compra no tiene líneas. Agrega al menos un producto antes de confirmar." };
  }

  // FSE: la Naturaleza del pago debe quedar decidida ANTES de confirmar —
  // no es una configuración post-confirmación. Ver updatePurchasePaymentNature.
  if (isFseDocumentType(purchase.document_type) && !purchase.payment_nature) {
    return {
      ok:    false,
      error: "Define la Naturaleza del pago antes de confirmar esta compra FSE (bloque 'Naturaleza del pago y Retención de Renta').",
    };
  }

  // 2. Validar que todos los productos siguen siendo elegibles.
  //    El catálogo puede haber cambiado mientras la compra estaba en DRAFT.
  const BLOCKED_STATUSES = ["BLOCKED_PURCHASE", "INACTIVE", "DISCONTINUED"] as const;
  for (const item of purchase.items) {
    if (!item.product.allow_purchase) {
      return {
        ok:    false,
        error: `El producto ${item.product_id} ya no permite compras. Elimina la línea antes de confirmar.`,
      };
    }
    if (BLOCKED_STATUSES.includes(item.product.status as typeof BLOCKED_STATUSES[number])) {
      return {
        ok:    false,
        error: `El producto ${item.product_id} está en estado ${item.product.status}. Elimina la línea antes de confirmar.`,
      };
    }
  }

  // 3. Asegurar ProductLocation para cada línea stockable.
  //
  //    Se usa upsert (no findFirst+create) para evitar la race condition
  //    que generaría P2002 si dos requests intentan crear el mismo PL simultáneamente.
  //    @@unique([tenant_id, location_id, product_id]) lo hace seguro.
  //
  //    Side effect documentado: si la transacción de la fase 4 falla,
  //    el PL recién creado queda con current_stock=0 y sin movimientos.
  //    Es inofensivo — un registro vacío que no corrompe el inventario.
  //    No se puede evitar sin envolver también el upsert en la misma tx,
  //    lo que requeriría crear el PL dentro de la tx de confirmación
  //    y complicaría innecesariamente la lógica en esta etapa.
  const stockableItems = purchase.items.filter((i) => i.product.is_stockable);

  const entries: {
    plId:      string;
    productId: string;
    quantity:  number;
    unitCost:  number;
  }[] = [];

  for (const item of stockableItems) {
    const pl = await prisma.productLocation.upsert({
      where: {
        tenant_id_location_id_product_id: {
          tenant_id,
          location_id,
          product_id: item.product_id,
        },
      },
      create: {
        tenant_id,
        location_id,
        product_id:       item.product_id,
        current_stock:    0,
        min_stock:        0,
        reorder_quantity: 0,
        is_active:        true,
        created_by:       user_id,
        updated_by:       user_id,
      },
      update: {}, // si ya existe, no se toca nada
      select: { id: true, is_active: true },
    });

    if (!pl.is_active) {
      return {
        ok:    false,
        error: `El producto ${item.product_id} está inactivo en el inventario de esta location. Reactívalo antes de confirmar.`,
      };
    }

    entries.push({
      plId:      pl.id,
      productId: item.product_id,
      quantity:  Number(item.quantity),
      unitCost:  Number(item.unit_cost),
    });
  }

  // 4. Transacción atómica: marcar CONFIRMED + registrar todos los PURCHASE_IN.
  //
  //    Por qué se inlinea la lógica de movimiento en lugar de llamar a recordInventoryMovement():
  //    recordInventoryMovement usa prisma.$transaction internamente, lo que hace imposible
  //    componerlo atómicamente con el update de la compra sin modificar su firma.
  //    PURCHASE_IN es siempre aditivo — no requiere getMovementDirection().
  //
  //    Garantías de esta transacción:
  //    - Si cualquier movimiento falla → rollback completo → compra queda en DRAFT.
  //    - Si el update de CONFIRMED falla → rollback completo → sin movimientos registrados.
  //    - No hay estado intermedio visible: o todo ocurre, o nada.
  //
  //    Nota de concurrencia: stock_before se lee dentro de la tx para capturar
  //    el saldo vigente al momento exacto del movimiento, no el de la fase 3.
  try {
    await prisma.$transaction(async (tx) => {
      // Marcar la compra como CONFIRMED
      await tx.purchase.update({
        where: { id: purchase_id },
        data: {
          status:       "CONFIRMED",
          confirmed_at: new Date(),
          confirmed_by: user_id,
          updated_by:   user_id,
        },
      });

      // Registrar PURCHASE_IN por cada línea stockable
      for (const entry of entries) {
        // Leer saldo actual dentro de la tx para capturar el estado más reciente
        const pl = await tx.productLocation.findFirst({
          where:  { id: entry.plId, tenant_id, location_id },
          select: { current_stock: true, is_active: true },
        });

        if (!pl) {
          throw new Error(
            `Registro de inventario no encontrado para producto ${entry.productId}.`,
          );
        }
        if (!pl.is_active) {
          throw new Error(
            `El producto ${entry.productId} fue desactivado en el inventario durante la confirmación.`,
          );
        }

        const stock_before    = Number(pl.current_stock);
        const resulting_stock = stock_before + entry.quantity; // PURCHASE_IN: siempre aditivo

        await tx.inventoryMovement.create({
          data: {
            tenant_id,
            location_id,
            product_id:          entry.productId,
            product_location_id: entry.plId,
            movement_type:       "PURCHASE_IN",
            quantity:            entry.quantity,
            unit_cost:           entry.unitCost,
            stock_before,
            resulting_stock,
            reference_entity:    "purchase",
            reference_id:        purchase_id,
            reference_code:      purchase.purchase_code,
            performed_by:        user_id,
          },
        });

        await tx.productLocation.update({
          where: { id: entry.plId },
          data:  { current_stock: resulting_stock, updated_by: user_id },
        });
      }
    });

    return { ok: true };
  } catch (e) {
    if (e instanceof Error) return { ok: false, error: e.message };
    throw e;
  }
}

// ── Editar cabecera de compra en DRAFT ───────────────────────────

// ── Resincronizar impuesto de líneas al cruzar la frontera FSE ─────
//
// Solo actúa cuando isFseDocumentType() cambia de valor (gravado↔FSE).
// Cambiar entre dos tipos NO-FSE (ej. CCF → FAC) no toca las líneas.
//
//   gravado → FSE: tax_amount = 0, line_total = line_subtotal en todas
//                  las líneas existentes (sin importar Product.tax_rate).
//   FSE → gravado: se restaura tax_amount = line_subtotal * (Product.tax_rate/100),
//                  usando la tasa vigente del catálogo — misma lógica que
//                  ya usa el cliente para prellenar líneas nuevas.
async function resyncLineTaxesForFseTransition(
  tx:          Prisma.TransactionClient,
  purchaseId:  string,
  wasFse:      boolean,
  isFseNow:    boolean,
): Promise<void> {
  if (wasFse === isFseNow) return;

  const items = await tx.purchaseItem.findMany({
    where:  { purchase_id: purchaseId },
    select: {
      id:            true,
      line_subtotal: true,
      product: { select: { tax_rate: { select: { rate: true } } } },
    },
  });

  for (const item of items) {
    const lineSubtotal = Number(item.line_subtotal);
    const tax_amount = isFseNow
      ? 0
      : Math.round(lineSubtotal * (Number(item.product.tax_rate?.rate ?? 0) / 100) * 100) / 100;
    // Redondeo a 2 decimales — evita arrastrar binarios tipo 376.65999999999997.
    const line_total = Math.round((lineSubtotal + tax_amount) * 100) / 100;

    await tx.purchaseItem.update({
      where: { id: item.id },
      data: {
        tax_amount: new Prisma.Decimal(tax_amount),
        line_total: new Prisma.Decimal(line_total),
      },
    });
  }
}

export interface UpdatePurchaseHeaderInput {
  supplier_id?:      string;
  purchase_date?:    string;       // YYYY-MM-DD
  purchase_code?:    string;       // solo numérico
  notes?:            string | null;
  document_type?:    string | null;
  document_series?:  string | null;
  document_number?:  string | null;
  payment_condition?: string | null;
  cancellation_type?: string | null;
}

export async function updatePurchaseHeader(
  purchase_id: string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       UpdatePurchaseHeaderInput,
): Promise<PurchaseResult> {
  const purchase = await prisma.purchase.findFirst({
    where:  { id: purchase_id, tenant_id, location_id },
    select: { id: true, status: true, purchase_date: true, document_type: true },
  });

  if (!purchase) {
    return { ok: false, error: "La compra no existe o no pertenece a la location activa." };
  }
  if (purchase.status !== "DRAFT") {
    return { ok: false, error: "Solo se pueden editar compras en estado DRAFT." };
  }

  const wasFse = isFseDocumentType(purchase.document_type);
  const isFseNow = isFseDocumentType(
    input.document_type !== undefined ? input.document_type : purchase.document_type,
  );

  if (input.supplier_id) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplier_id, tenant_id, status: "active" },
      select: { id: true },
    });
    if (!supplier) {
      return { ok: false, field: "supplier_id", error: "El proveedor no existe o está inactivo." };
    }
  }

  const newDate = input.purchase_date
    ? new Date(input.purchase_date + "T00:00:00")
    : purchase.purchase_date;
  const { year, month } = extractYearMonth(newDate);

  let purchase_code: string | undefined;
  if (input.purchase_code !== undefined) {
    purchase_code = String(parseInt(input.purchase_code, 10));
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: purchase_id },
        data: {
          ...(input.supplier_id   && { supplier_id: input.supplier_id }),
          ...(input.purchase_date && {
            purchase_date:  newDate,
            purchase_year:  year,
            purchase_month: month,
          }),
          ...(purchase_code !== undefined && { purchase_code }),
          ...(input.notes !== undefined  && { notes: input.notes }),
          ...(input.document_type    !== undefined && { document_type:    input.document_type    }),
          ...(input.document_series  !== undefined && { document_series:  input.document_series  }),
          ...(input.document_number  !== undefined && { document_number:  input.document_number  }),
          ...(input.payment_condition !== undefined && { payment_condition: input.payment_condition }),
          ...(input.cancellation_type !== undefined && { cancellation_type: input.cancellation_type }),
          // Al salir de FSE, la naturaleza del pago y el snapshot de Renta dejan
          // de tener sentido — se limpian explícitamente en vez de dejarlos
          // stale. Al entrar a FSE no se toca payment_nature: debe ser una
          // decisión explícita nueva del usuario (nunca se infiere).
          ...(wasFse && !isFseNow && {
            payment_nature:                 null,
            income_tax_withholding_applies: false,
            income_tax_withholding_rate:    null,
            income_tax_withholding_amount:  0,
            income_tax_withholding_base:    0,
          }),
          updated_by: user_id,
        },
      });
      // Cruce de frontera FSE↔gravado: recalcular tax_amount de todas las
      // líneas existentes ANTES de recalcular los totales de cabecera.
      await resyncLineTaxesForFseTransition(tx, purchase_id, wasFse, isFseNow);
      // Re-evaluate retention after any header change (doc_type or supplier may have changed)
      await recalcPurchaseTotals(tx, purchase_id, user_id);
    });
    return { ok: true };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok:    false,
        field: "purchase_code",
        error: "Ya existe una compra con ese correlativo en ese mes. Usa un número distinto.",
      };
    }
    throw e;
  }
}

// ── Naturaleza del pago + Retención de Renta (FSE 14) ─────────────
//
// El servidor es la única fuente de verdad: el cliente nunca envía
// rate/amount calculados, solo payment_nature y (para GOODS_AND_SERVICES)
// manual_base. Este service recalcula todo con computeIncomeTaxWithholding
// y persiste el snapshot fiscal en Purchase. El builder FSE 14
// (generate-fse-json.service.ts) solo LEE income_tax_withholding_amount —
// nunca vuelve a decidir el 10% por sí mismo.

export interface UpdatePurchasePaymentNatureInput {
  payment_nature: PaymentNature;
  manual_base?:    number | null;
}

export type UpdatePurchasePaymentNatureResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

export async function updatePurchasePaymentNature(
  purchase_id: string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       UpdatePurchasePaymentNatureInput,
): Promise<UpdatePurchasePaymentNatureResult> {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchase_id, tenant_id, location_id },
    select: {
      id:       true,
      status:   true,
      subtotal: true,
      supplier: { select: { person_type: true } },
      dte_documents: {
        orderBy: { created_at: "desc" },
        take:    1,
        select:  { dte_status: true },
      },
    },
  });

  if (!purchase) {
    return { ok: false, error: "La compra no existe o no pertenece a la location activa." };
  }
  if (purchase.status === "CANCELLED") {
    return { ok: false, error: "No se puede editar una compra anulada." };
  }

  // Documento fiscal ya firmado/transmitido/aceptado → los datos fiscales
  // de Renta quedan congelados. No se recalcula ni se modifica silenciosamente
  // un DTE que ya salió del sistema. Ver DTE_STATUSES_ALLOWING_NATURE_EDIT.
  const latestDteStatus = purchase.dte_documents[0]?.dte_status ?? null;
  if (latestDteStatus && !DTE_STATUSES_ALLOWING_NATURE_EDIT.includes(latestDteStatus)) {
    return {
      ok:    false,
      error: `Esta compra ya tiene un documento fiscal en estado ${latestDteStatus}. ` +
             "No se pueden modificar los datos de Retención de Renta de un DTE ya firmado o transmitido.",
    };
  }

  const calc = computeIncomeTaxWithholding({
    paymentNature:      input.payment_nature,
    supplierPersonType: purchase.supplier.person_type as SupplierPersonType,
    totalCompra:        Number(purchase.subtotal),
    manualBase:         input.manual_base,
  });

  if (!calc.ok) {
    return { ok: false, error: calc.error, field: calc.field };
  }

  await prisma.purchase.update({
    where: { id: purchase_id },
    data: {
      payment_nature:                 input.payment_nature,
      income_tax_withholding_applies: calc.result.applies,
      income_tax_withholding_rate:    calc.result.rate == null ? null : new Prisma.Decimal(calc.result.rate),
      income_tax_withholding_amount:  new Prisma.Decimal(calc.result.amount),
      income_tax_withholding_base:    new Prisma.Decimal(calc.result.base),
      updated_by:                     user_id,
    },
  });

  return { ok: true };
}

// ── Eliminar compra en DRAFT (borrado físico) ─────────────────────

export async function deleteDraftPurchase(
  purchase_id: string,
  tenant_id:   string,
  location_id: string,
): Promise<PurchaseResult> {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchase_id, tenant_id, location_id },
    select: { id: true, status: true },
  });

  if (!purchase) {
    return { ok: false, error: "La compra no existe o no pertenece a la location activa." };
  }
  if (purchase.status !== "DRAFT") {
    return { ok: false, error: "Solo se pueden eliminar compras en estado DRAFT." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseItem.deleteMany({ where: { purchase_id } });
    await tx.purchase.delete({ where: { id: purchase_id } });
  });

  return { ok: true };
}

// ── Cancelar compra en DRAFT ──────────────────────────────────────

export async function cancelPurchase(
  purchase_id: string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
): Promise<PurchaseResult> {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchase_id, tenant_id, location_id },
    select: { id: true, status: true },
  });

  if (!purchase) {
    return { ok: false, error: "La compra no existe o no pertenece a la location activa." };
  }
  if (purchase.status === "CONFIRMED") {
    return { ok: false, error: "No se puede anular una compra ya confirmada." };
  }
  if (purchase.status === "CANCELLED") {
    return { ok: false, error: "La compra ya está anulada." };
  }

  await prisma.purchase.update({
    where: { id: purchase_id },
    data: {
      status:       "CANCELLED",
      cancelled_at: new Date(),
      cancelled_by: user_id,
      updated_by:   user_id,
    },
  });

  return { ok: true };
}

// ── Anular compra CONFIRMED con reversión de inventario ───────────
//
// Solo acepta CONFIRMED → CANCELLED.
// Por cada línea stockable que originó un PURCHASE_IN, se crea un
// movimiento RETURN_OUT que revierte el stock de forma trazable.
// Si la reversión dejaría stock negativo, la operación se bloquea.
// Todo ocurre en una sola prisma.$transaction: si cualquier paso
// falla, la compra queda CONFIRMED y ningún movimiento queda registrado.

export async function cancelConfirmedPurchase(
  purchase_id: string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
): Promise<PurchaseResult> {
  // 1. Leer la compra con sus líneas stockables
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchase_id, tenant_id, location_id },
    select: {
      id:            true,
      status:        true,
      purchase_code: true,
      items: {
        select: {
          product_id: true,
          quantity:   true,
          unit_cost:  true,
          product:    { select: { is_stockable: true, name: true } },
        },
      },
    },
  });

  if (!purchase) {
    return { ok: false, error: "La compra no existe o no pertenece a la location activa." };
  }
  if (purchase.status === "DRAFT") {
    return { ok: false, error: "Esta acción es solo para compras confirmadas. Para borradores usa la opción de eliminar." };
  }
  if (purchase.status === "CANCELLED") {
    return { ok: false, error: "La compra ya está anulada." };
  }
  if (purchase.status !== "CONFIRMED") {
    return { ok: false, error: "La compra no está en estado CONFIRMED." };
  }

  // 2. Pre-validar stock suficiente para cada línea stockable antes de la tx.
  //    Si cualquier producto no tiene stock suficiente, se bloquea todo con error.
  const stockableItems = purchase.items.filter((i) => i.product.is_stockable);

  type ReversalEntry = {
    plId:      string;
    productId: string;
    name:      string;
    quantity:  number;
    unitCost:  number;
  };

  const reversals: ReversalEntry[] = [];

  for (const item of stockableItems) {
    const pl = await prisma.productLocation.findFirst({
      where:  { tenant_id, location_id, product_id: item.product_id },
      select: { id: true, current_stock: true },
    });

    if (!pl) {
      // Sin registro de inventario → el producto nunca tuvo stock registrado aquí.
      // La compra confirmó pero no generó PL (caso edge tras migración o eliminación manual).
      // No hay nada que revertir para este producto.
      continue;
    }

    const currentStock = Number(pl.current_stock);
    const qty          = Number(item.quantity);

    if (currentStock - qty < 0) {
      return {
        ok: false,
        error: `No se puede anular: "${item.product.name}" tiene stock actual ${currentStock} pero la compra registró ${qty} unidades. Ajusta el inventario manualmente antes de anular.`,
      };
    }

    reversals.push({
      plId:      pl.id,
      productId: item.product_id,
      name:      item.product.name,
      quantity:  qty,
      unitCost:  Number(item.unit_cost),
    });
  }

  // 3. Transacción atómica: movimientos RETURN_OUT + actualizar stock + marcar CANCELLED.
  //    Se re-lee el stock dentro de la tx para capturar cambios concurrentes.
  //    Si la reversión genera stock negativo dentro de la tx, se lanza excepción y rollback.
  try {
    await prisma.$transaction(async (tx) => {
      for (const rev of reversals) {
        const pl = await tx.productLocation.findFirst({
          where:  { id: rev.plId, tenant_id, location_id },
          select: { current_stock: true },
        });

        if (!pl) {
          throw new Error(`Registro de inventario no encontrado para "${rev.name}" al anular.`);
        }

        const stock_before    = Number(pl.current_stock);
        const resulting_stock = stock_before - rev.quantity;

        if (resulting_stock < 0) {
          throw new Error(
            `Stock insuficiente para revertir "${rev.name}" (stock: ${stock_before}, a revertir: ${rev.quantity}).`,
          );
        }

        await tx.inventoryMovement.create({
          data: {
            tenant_id,
            location_id,
            product_id:          rev.productId,
            product_location_id: rev.plId,
            movement_type:       "RETURN_OUT",
            quantity:            rev.quantity,
            unit_cost:           rev.unitCost,
            stock_before,
            resulting_stock,
            reference_entity:    "purchase_cancellation",
            reference_id:        purchase_id,
            reference_code:      purchase.purchase_code,
            performed_by:        user_id,
            notes:               "Reversión por anulación de compra confirmada",
          },
        });

        await tx.productLocation.update({
          where: { id: rev.plId },
          data:  { current_stock: resulting_stock, updated_by: user_id },
        });
      }

      await tx.purchase.update({
        where: { id: purchase_id },
        data: {
          status:       "CANCELLED",
          cancelled_at: new Date(),
          cancelled_by: user_id,
          updated_by:   user_id,
        },
      });
    });

    return { ok: true };
  } catch (e) {
    if (e instanceof Error) return { ok: false, error: e.message };
    throw e;
  }
}
