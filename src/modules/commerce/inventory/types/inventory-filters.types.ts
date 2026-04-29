// ─────────────────────────────────────────────────────────────────
// commerce/inventory — inventory-filters.types.ts
//
// Tipos para filtros, búsqueda y ordenamiento de las grillas
// principales del módulo inventory.
//
// Dos conjuntos independientes:
//   ProductLocationFilters  → grilla de stock por location
//   InventoryMovementFilters → grilla de historial de movimientos
// ─────────────────────────────────────────────────────────────────

import type { StockAlertLevel } from "./inventory.types";
import type { MovementType } from "./inventory-movement.types";

// ── Ordenamiento ─────────────────────────────────────────────────

export type SortDirection = "asc" | "desc";

export type ProductLocationSortField =
  | "product_code"
  | "product_name"
  | "current_stock"
  | "min_stock"
  | "warehouse"
  | "updated_at";

export type InventoryMovementSortField =
  | "created_at"
  | "movement_type"
  | "quantity"
  | "resulting_stock"
  | "product_code";

// ── Filtros de stock por location ────────────────────────────────

export interface ProductLocationFilters {
  /** Requerido — todo el módulo opera dentro de un tenant */
  tenant_id: string;

  /** Requerido — el stock siempre es por location */
  location_id: string;

  /** Búsqueda por código de producto */
  search_code?: string;

  /** Búsqueda por nombre de producto */
  search_name?: string;

  /** Filtrar por estado de activación en esta location */
  is_active?: boolean;

  /** Filtrar por nivel de alerta derivado de stock */
  stock_alert?: StockAlertLevel;

  /** Filtrar por bodega dentro de la location */
  warehouse?: string;

  /** Filtrar por categoría del producto */
  category_id?: string;

  // ── Ordenamiento ──────────────────────────────────────────────
  sort_field?: ProductLocationSortField;
  sort_direction?: SortDirection;

  // ── Tamaño de resultado ───────────────────────────────────────
  // Sin paginación visual clásica; se usa un límite alto con scroll.
  page_size?: number;
}

// ── Filtros de historial de movimientos ──────────────────────────

export interface InventoryMovementFilters {
  /** Requerido */
  tenant_id: string;

  /** Requerido — el historial siempre es por location */
  location_id: string;

  /** Acotar al historial de un producto específico */
  product_id?: string;

  /** Acotar al historial de un registro product_location específico */
  product_location_id?: string;

  /** Filtrar por tipo de movimiento */
  movement_type?: MovementType;

  /** Filtrar desde esta fecha */
  date_from?: Date;

  /** Filtrar hasta esta fecha */
  date_to?: Date;

  /** Filtrar por operador que realizó el movimiento */
  performed_by?: string;

  // ── Ordenamiento ──────────────────────────────────────────────
  sort_field?: InventoryMovementSortField;
  sort_direction?: SortDirection;

  // ── Tamaño de resultado ───────────────────────────────────────
  page_size?: number;
}
