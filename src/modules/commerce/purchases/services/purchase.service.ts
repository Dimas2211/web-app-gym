// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase.service.ts
//
// Lógica de negocio del módulo de compras.
// Sin "use server" — importable desde actions y route handlers.
//
// Operaciones:
//   createPurchase       — crea un documento en DRAFT
//   addPurchaseItem      — agrega o reemplaza una línea en DRAFT
//   updatePurchaseItem   — edita una línea existente en DRAFT
//   removePurchaseItem   — elimina una línea en DRAFT
//   confirmPurchase      — DRAFT → CONFIRMED + genera movimientos PURCHASE_IN
//   cancelPurchase       — DRAFT → CANCELLED
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
import { RETENTION_1PCT_APPLICABLE_DOCTYPES } from "../constants/purchase-document.constants";

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

  await tx.purchase.update({
    where: { id: purchaseId },
    data: {
      subtotal:               new Prisma.Decimal(subtotal),
      tax_amount:             new Prisma.Decimal(tax_amount),
      total_amount:           new Prisma.Decimal(total_amount),
      retention_1pct_applies: applies,
      retention_1pct_amount:  new Prisma.Decimal(amount),
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
    select: { id: true, status: true },
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

  // Calcular totales de línea
  const line_subtotal = input.quantity * input.unit_cost;
  const line_total    = line_subtotal + input.tax_amount;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.purchaseItem.create({
        data: {
          purchase_id:   purchase_id,
          product_id:    input.product_id,
          quantity:      input.quantity,
          unit_cost:     input.unit_cost,
          tax_amount:    input.tax_amount,
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
    select: { id: true, status: true },
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

  const quantity   = input.quantity   ?? Number(item.quantity);
  const unit_cost  = input.unit_cost  ?? Number(item.unit_cost);
  const tax_amount = input.tax_amount ?? Number(item.tax_amount);

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
      id:            true,
      status:        true,
      purchase_code: true,
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
    select: { id: true, status: true, purchase_date: true },
  });

  if (!purchase) {
    return { ok: false, error: "La compra no existe o no pertenece a la location activa." };
  }
  if (purchase.status !== "DRAFT") {
    return { ok: false, error: "Solo se pueden editar compras en estado DRAFT." };
  }

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
          updated_by: user_id,
        },
      });
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
