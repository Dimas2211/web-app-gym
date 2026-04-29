// ─────────────────────────────────────────────────────────────────
// commerce/products — product-filters.types.ts
//
// Tipos para filtros, búsqueda y ordenamiento de la lista de
// productos. Usados en queries, API routes y componentes de UI.
//
// Filtros de inventory (warehouse, stock_level) están presentes en
// la interfaz pero NO se envían al servidor mientras commerce/inventory
// no esté implementado (Etapa 12). La pantalla los muestra como
// controles deshabilitados para expresar el contrato funcional completo.
// ─────────────────────────────────────────────────────────────────

import type { ProductStatus, ProductType } from "./product.types";

// ── Filtros de lista ─────────────────────────────────────────────

export interface ProductFilters {
  /** Búsqueda por código de producto (campo product_code) */
  search_code?: string;

  /** Búsqueda por nombre de producto (campo name) */
  search_name?: string;

  /** Filtrar por estado del producto */
  status?: ProductStatus;

  /** Filtrar por tipo */
  product_type?: ProductType;

  /** Filtrar por categoría */
  category_id?: string;

  /** Filtrar por línea (requiere category_id coherente en la UI) */
  line_id?: string;

  /** Filtrar por sublínea (requiere line_id coherente en la UI) */
  subline_id?: string;

  /** Filtrar por proveedor principal */
  supplier_id?: string;

  /** Filtrar por marca (texto libre, insensitivo a mayúsculas) */
  brand?: string;

  /** Solo productos habilitados para compra */
  allow_purchase?: boolean;

  /** Solo productos habilitados para venta */
  allow_sale?: boolean;

  /** Solo productos con control de stock */
  is_stockable?: boolean;

  // ── Filtros pendientes de commerce/inventory (Etapa 12) ────────
  // Los controles de bodega y nivel de stock son visibles en la UI
  // como selects deshabilitados. No se incluyen en esta interfaz
  // porque no tienen backend todavía.
  //
  // Cuando se implemente inventory, agregar aquí:
  //   warehouse_id?: string;
  //   stock_level?:  "low" | "zero" | "normal";
}

// ── Ordenamiento ─────────────────────────────────────────────────

export type ProductSortField =
  | "name"           // nombre
  | "product_code"   // código
  | "status"         // estado
  | "product_type"   // tipo
  | "sale_price"     // precio sin IVA
  | "created_at"     // fecha de ingreso
  | "line_name"      // línea + nombre (compuesto)
  | "line_code"      // línea + código (compuesto)
  | "supplier_name"; // proveedor + nombre (compuesto)
  // "existencia" (stock actual) → commerce/inventory (Etapa 12)
  // Se muestra en el selector pero como opción deshabilitada.

export type SortDirection = "asc" | "desc";

export interface ProductSort {
  field: ProductSortField;
  direction: SortDirection;
}

// ── Paginación ───────────────────────────────────────────────────

export interface ProductPagination {
  page: number;
  pageSize: number;
}

// ── Parámetros completos de consulta ─────────────────────────────

export interface ProductQueryParams {
  filters?: ProductFilters;
  sort?: ProductSort;
  pagination?: ProductPagination;
}

// ── Respuesta paginada ───────────────────────────────────────────

export interface ProductListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
