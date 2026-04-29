// ─────────────────────────────────────────────────────────────────
// commerce/inventory — inventory.types.ts
//
// Tipos del módulo de inventario: estado operativo producto-location.
// NO incluye tipos de movimientos (ver inventory-movement.types.ts).
// NO incluye tipos de filtros (ver inventory-filters.types.ts).
//
// Convención de decimales:
//   Los campos Decimal de Prisma (current_stock, min_stock, etc.)
//   se serializan como number en las queries antes de llegar al cliente.
// ─────────────────────────────────────────────────────────────────

import type { ProductType, ProductStatus } from "../../products/types/product.types";

// ── Nivel de alerta de stock ─────────────────────────────────────
//
// Valor derivado — no se almacena en la base de datos.
// Se calcula a partir de current_stock y min_stock en la query o en render.

export type StockAlertLevel = "OK" | "LOW" | "EMPTY";

export const STOCK_ALERT_LEVEL = {
  OK:    "OK",
  LOW:   "LOW",
  EMPTY: "EMPTY",
} as const satisfies Record<StockAlertLevel, StockAlertLevel>;

/**
 * Deriva el nivel de alerta a partir del saldo actual vs el mínimo.
 * Función de dominio puro — sin efectos secundarios.
 *
 *   EMPTY → current_stock <= 0
 *   LOW   → 0 < current_stock <= min_stock
 *   OK    → current_stock > min_stock
 */
export function deriveStockAlertLevel(
  currentStock: number,
  minStock: number,
): StockAlertLevel {
  if (currentStock <= 0) return STOCK_ALERT_LEVEL.EMPTY;
  if (currentStock <= minStock) return STOCK_ALERT_LEVEL.LOW;
  return STOCK_ALERT_LEVEL.OK;
}

// ── Proyección para tabla / lista ────────────────────────────────

/**
 * Fila de la grilla principal de stock por location.
 * Incluye campos desnormalizados del catálogo para evitar joins en UI.
 * stock_alert se calcula en la query o en el render; nunca viene de la DB.
 */
export interface ProductLocationItem {
  id: string;
  tenant_id: string;
  location_id: string;
  product_id: string;

  // Desnormalizados desde Product (resueltos en la query)
  product_code: string;
  product_name: string;
  product_type: ProductType;
  category_name: string;
  line_name: string | null;
  unit_symbol: string;

  // Estado operativo actual
  current_stock: number;
  min_stock: number;
  reorder_quantity: number;

  // Ubicación física dentro de la location
  warehouse: string | null;
  shelf: string | null;
  position: string | null;

  // Activación por location (independiente del status global del producto)
  is_active: boolean;

  // Derivado — no almacenado
  stock_alert: StockAlertLevel;

  updated_at: Date;
  /** String preformateado en el servidor. Evita hydration mismatch por Intl locale-sensitive. */
  updated_at_label: string;
}

// ── Detalle completo para panel lateral ─────────────────────────

/**
 * Extensión de ProductLocationItem con campos extra para el panel
 * de detalle lateral. Requiere joins adicionales en la query de detalle.
 */
export interface ProductLocationDetail extends ProductLocationItem {
  product_description: string | null;
  product_status: ProductStatus;
  sku: string | null;
  brand: string | null;
  supplier_name: string | null;
  created_at: Date;
  /** String preformateado en el servidor. Evita hydration mismatch por Intl locale-sensitive. */
  created_at_label: string;
  created_by: string | null;
  updated_by: string | null;
}

// ── Resumen para panel de estadísticas ──────────────────────────

export interface InventorySummary {
  location_id: string;
  total_products: number;
  active_products: number;
  products_empty: number;
  products_low: number;
  products_ok: number;
}
