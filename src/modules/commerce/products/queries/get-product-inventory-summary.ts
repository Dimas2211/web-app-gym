// ─────────────────────────────────────────────────────────────────
// commerce/products — get-product-inventory-summary.ts
//
// Query read-only: devuelve el resumen de inventario de un producto
// para la location activa del tenant. Solo lectura — no modifica
// stock, no crea registros, no registra movimientos.
//
// Consumido por GET /api/products/[id]/inventory-summary para
// alimentar el bloque Inventario del panel de detalle de productos.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import {
  deriveStockAlertLevel,
  type StockAlertLevel,
} from "../../inventory/types/inventory.types";
import { formatDateLabel } from "../../inventory/utils/format-date-label";

// ── Tipo de retorno ───────────────────────────────────────────────

export interface ProductInventorySummary {
  product_location_id: string;
  current_stock: number;
  min_stock: number;
  reorder_quantity: number;
  warehouse: string | null;
  shelf: string | null;
  position: string | null;
  is_active: boolean;
  stock_alert: StockAlertLevel;
  updated_at_label: string;
}

// ── Query ─────────────────────────────────────────────────────────

/**
 * Devuelve el resumen de inventario de un producto para la location
 * activa. Filtra estrictamente por tenant_id + location_id + product_id.
 * Retorna null si el producto no tiene registro en esa location.
 *
 * @param tenant_id   - De sesión. Nunca del cliente.
 * @param location_id - Location activa resuelta por la sesión.
 * @param product_id  - UUID del producto seleccionado.
 */
export async function getProductInventorySummary(
  tenant_id: string,
  location_id: string,
  product_id: string,
  client: PrismaClient = prisma,
): Promise<ProductInventorySummary | null> {
  const row = await client.productLocation.findFirst({
    where: { tenant_id, location_id, product_id },
    select: {
      id:               true,
      current_stock:    true,
      min_stock:        true,
      reorder_quantity: true,
      warehouse:        true,
      shelf:            true,
      position:         true,
      is_active:        true,
      updated_at:       true,
    },
  });

  if (!row) return null;

  const currentStock = Number(row.current_stock);
  const minStock     = Number(row.min_stock);

  return {
    product_location_id: row.id,
    current_stock:       currentStock,
    min_stock:           minStock,
    reorder_quantity:    Number(row.reorder_quantity),
    warehouse:           row.warehouse,
    shelf:               row.shelf,
    position:            row.position,
    is_active:           row.is_active,
    stock_alert:         deriveStockAlertLevel(currentStock, minStock),
    updated_at_label:    formatDateLabel(row.updated_at),
  };
}
