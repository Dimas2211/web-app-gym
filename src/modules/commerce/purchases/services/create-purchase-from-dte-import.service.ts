// ─────────────────────────────────────────────────────────────────
// commerce/purchases — create-purchase-from-dte-import.service.ts
//
// Crea una Purchase DRAFT a partir de un PurchaseDteImport ya revisado.
//
// Responsabilidades:
//   - Validar que no haya product_ids duplicados en el payload.
//   - Validar que el DteImport exista, pertenezca al tenant/location y no esté LINKED.
//   - Validar supplier (existe, activo, mismo tenant).
//   - Validar products (existen, activos, allow_purchase, mismo tenant).
//   - Derivar purchase_date, document_type y campos DTE del raw_json.
//   - Calcular totales desde las líneas aprobadas.
//   - Crear Purchase + PurchaseItems + actualizar PurchaseDteImport en una tx atómica.
//
// No crea proveedores, no crea productos, no genera inventario,
// no confirma la compra, no llama servicios externos.
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CreatePurchaseFromDteInput } from "../schemas/dte-import.schema";
import { extractDteMetadata } from "./purchase-dte-import.service";
import { getNextPurchaseCode } from "../queries/get-next-purchase-code";

// ── Tipos de resultado ────────────────────────────────────────────

export type CreatePurchaseFromDteResult =
  | {
      ok:         true;
      purchase:   { id: string; status: string; source_type: string; supplier_id: string; total_amount: number };
      dte_import: { id: string; status: string; purchase_id: string };
    }
  | { ok: false; error: string; httpStatus: number };

// ── Servicio principal ────────────────────────────────────────────

export async function createPurchaseDraftFromDteImport(
  dte_import_id: string,
  tenant_id:     string,
  location_id:   string,
  user_id:       string,
  input:         CreatePurchaseFromDteInput,
): Promise<CreatePurchaseFromDteResult> {

  // 1. Rechazar product_ids duplicados en el payload.
  //    @@unique([purchase_id, product_id]) en PurchaseItem impide líneas repetidas.
  //    Soporte completo de líneas repetidas del mismo producto se implementará
  //    cuando se elimine ese constraint en una fase posterior.
  const productIds     = input.items.map((i) => i.product_id);
  const uniqueProducts = new Set(productIds);
  if (uniqueProducts.size !== productIds.length) {
    return {
      ok:         false,
      httpStatus: 400,
      error:
        "El payload contiene líneas con el mismo product_id. " +
        "Las líneas repetidas del mismo producto se implementarán en una fase posterior. " +
        "Consolida las cantidades en una sola línea por producto.",
    };
  }

  // 2. Buscar el DteImport — tenant_id + location_id como guard de acceso.
  const dteImport = await prisma.purchaseDteImport.findFirst({
    where: { id: dte_import_id, tenant_id, location_id },
  });
  if (!dteImport) {
    return {
      ok:         false,
      httpStatus: 404,
      error:      "Registro DTE no encontrado o no pertenece a la location activa.",
    };
  }

  // 3. Validar que el DTE no esté ya vinculado a una compra.
  if (dteImport.purchase_id || dteImport.status === "LINKED") {
    return {
      ok:         false,
      httpStatus: 409,
      error:      "Este DTE importado ya está vinculado a una compra existente.",
    };
  }

  // 4. Validar proveedor — debe existir, estar activo y pertenecer al mismo tenant.
  const supplier = await prisma.supplier.findFirst({
    where:  { id: input.supplier_id, tenant_id, status: "active" },
    select: { id: true },
  });
  if (!supplier) {
    return {
      ok:         false,
      httpStatus: 404,
      error:      "El proveedor no existe o está inactivo en este tenant.",
    };
  }

  // 5. Validar todos los productos en una sola consulta.
  //    Condiciones: pertenece al tenant, allow_purchase = true, status no bloqueado.
  const validProducts = await prisma.product.findMany({
    where: {
      id:             { in: [...uniqueProducts] },
      tenant_id,
      allow_purchase: true,
      status:         { notIn: ["BLOCKED_PURCHASE", "INACTIVE", "DISCONTINUED"] },
    },
    select: { id: true },
  });
  const validProductSet = new Set(validProducts.map((p) => p.id));
  for (const pid of uniqueProducts) {
    if (!validProductSet.has(pid)) {
      return {
        ok:         false,
        httpStatus: 404,
        error:      `El producto ${pid} no existe en este tenant, no está activo, o no permite compras.`,
      };
    }
  }

  // 6. Extraer metadata del raw_json del DTE para derivar campos documentales.
  const rawJson  = dteImport.raw_json as Record<string, unknown>;
  const metadata = extractDteMetadata(rawJson);

  // 7. Derivar purchase_date desde fecEmi; si no está disponible, usar fecha actual.
  let purchaseDateBase: Date;
  if (metadata.issued_at) {
    const parsed = new Date(metadata.issued_at);
    purchaseDateBase = isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    purchaseDateBase = new Date();
  }
  // Normalizar a solo fecha (sin componente horario) para @db.Date
  const purchaseDate = new Date(
    purchaseDateBase.getFullYear(),
    purchaseDateBase.getMonth(),
    purchaseDateBase.getDate(),
  );
  const year  = purchaseDate.getFullYear();
  const month = purchaseDate.getMonth() + 1;

  // 8. Calcular totales de línea y totales del documento desde el payload aprobado.
  //    tax_amount por línea: si viene null/undefined se calcula IVA 13% sobre line_subtotal.
  //    line_total del payload se ignora — se recalcula para garantizar coherencia.
  //    round2: redondea a dos decimales para evitar acumulación de error flotante.
  const round2 = (n: number) => Math.round(n * 100) / 100;

  let subtotalSum = 0;
  let taxSum      = 0;

  const computedItems = input.items.map((item) => {
    const line_subtotal = round2(item.quantity * item.unit_cost);
    const tax_amount    = (item.tax_amount !== null && item.tax_amount !== undefined)
      ? item.tax_amount
      : round2(line_subtotal * 0.13);
    const line_total    = round2(line_subtotal + tax_amount);
    subtotalSum += line_subtotal;
    taxSum      += tax_amount;
    return {
      product_id:    item.product_id,
      quantity:      item.quantity,
      unit_cost:     item.unit_cost,
      tax_amount,
      line_subtotal,
      line_total,
    };
  });
  const totalAmount = subtotalSum + taxSum;

  // 9. Obtener correlativo mensual fuera de la tx.
  //    La unicidad la garantiza @@unique([location_id, purchase_year, purchase_month, purchase_code]).
  //    Si hay colisión concurrente se atrapa P2002 en el catch.
  const purchase_code = String(await getNextPurchaseCode(location_id, year, month));

  // 10. Transacción atómica: Purchase + PurchaseItems + PurchaseDteImport.
  //     Re-verifica el estado del DTE dentro de la tx como guard contra race conditions.
  try {
    const { newPurchase, linkedDte } = await prisma.$transaction(async (tx) => {
      // Guard de race condition: re-leer DTE dentro de la tx
      const dteLock = await tx.purchaseDteImport.findFirst({
        where:  { id: dte_import_id, tenant_id, location_id },
        select: { id: true, status: true, purchase_id: true },
      });
      if (!dteLock || dteLock.purchase_id || dteLock.status === "LINKED") {
        throw new Error("__DTE_ALREADY_LINKED__");
      }

      // Crear la Purchase DRAFT con campos DTE copiados desde el registro de importación
      const purchase = await tx.purchase.create({
        data: {
          tenant_id,
          location_id,
          supplier_id:         input.supplier_id,
          purchase_code,
          purchase_year:       year,
          purchase_month:      month,
          purchase_date:       purchaseDate,
          status:              "DRAFT",
          source_type:         "DTE_IMPORT",
          // Campos documentales derivados del DTE
          document_type:       metadata.dte_type            ?? null,
          generation_code:     dteImport.generation_code    ?? null,
          control_number:      dteImport.control_number     ?? null,
          reception_stamp:     dteImport.reception_stamp    ?? null,
          dte_processed_at:    dteImport.processed_at       ?? null,
          dte_environment_code: dteImport.environment_code  ?? null,
          // Observaciones opcionales
          notes:               input.notes ?? null,
          // Totales calculados desde las líneas aprobadas
          subtotal:            new Prisma.Decimal(subtotalSum),
          tax_amount:          new Prisma.Decimal(taxSum),
          total_amount:        new Prisma.Decimal(totalAmount),
          created_by:          user_id,
          updated_by:          user_id,
        },
        select: {
          id:           true,
          status:       true,
          source_type:  true,
          supplier_id:  true,
          total_amount: true,
        },
      });

      // Crear PurchaseItems según las líneas aprobadas
      for (const item of computedItems) {
        await tx.purchaseItem.create({
          data: {
            purchase_id:   purchase.id,
            product_id:    item.product_id,
            quantity:      item.quantity,
            unit_cost:     item.unit_cost,
            tax_amount:    item.tax_amount,
            line_subtotal: new Prisma.Decimal(item.line_subtotal),
            line_total:    new Prisma.Decimal(item.line_total),
          },
        });
      }

      // Vincular DteImport con la Purchase recién creada y marcarla como LINKED
      const updated = await tx.purchaseDteImport.update({
        where: { id: dte_import_id },
        data: {
          status:      "LINKED",
          purchase_id: purchase.id,
          reviewed_at: new Date(),
          reviewed_by: user_id,
        },
        select: {
          id:          true,
          status:      true,
          purchase_id: true,
        },
      });

      return { newPurchase: purchase, linkedDte: updated };
    });

    return {
      ok:       true,
      purchase: {
        id:           newPurchase.id,
        status:       newPurchase.status,
        source_type:  newPurchase.source_type,
        supplier_id:  newPurchase.supplier_id,
        total_amount: Number(newPurchase.total_amount),
      },
      dte_import: {
        id:          linkedDte.id,
        status:      linkedDte.status,
        purchase_id: linkedDte.purchase_id!,
      },
    };

  } catch (e) {
    if (e instanceof Error && e.message === "__DTE_ALREADY_LINKED__") {
      return {
        ok:         false,
        httpStatus: 409,
        error:      "Este DTE importado ya fue vinculado a una compra por otra operación concurrente.",
      };
    }
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      // Colisión en @@unique del correlativo mensual o en purchase_id@unique de DteImport
      return {
        ok:         false,
        httpStatus: 409,
        error:
          "Conflicto de unicidad al crear la compra. " +
          "El correlativo ya existe para este mes, o el DTE ya fue vinculado. Reintenta la operación.",
      };
    }
    throw e;
  }
}
