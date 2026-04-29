// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — supplier-filters.types.ts
//
// Tipos para filtros, búsqueda, ordenamiento y resultado paginado
// del maestro de proveedores.
// ─────────────────────────────────────────────────────────────────

import type { SupplierStatus, TaxpayerType } from "./supplier.types";

// ── Ordenamiento ─────────────────────────────────────────────────

export type SortDirection = "asc" | "desc";

export type SupplierSortField =
  | "supplier_code"   // código interno
  | "name"            // nombre / razón social
  | "taxpayer_type"   // clasificación tributaria
  | "nit"             // NIT
  | "status"          // estado
  | "created_at";     // fecha de alta

export interface SupplierSort {
  field:     SupplierSortField;
  direction: SortDirection;
}

// ── Filtros de lista ─────────────────────────────────────────────

export interface SupplierFilters {
  /**
   * Requerido — el maestro siempre opera dentro de un tenant.
   * No se envía desde la UI; se inyecta en el service desde la sesión.
   */
  tenant_id: string;

  /** Búsqueda por código interno del proveedor */
  search_code?: string;

  /** Búsqueda por nombre o razón social (insensible a mayúsculas) */
  search_name?: string;

  /** Filtrar por clasificación tributaria */
  taxpayer_type?: TaxpayerType;

  /** Filtrar por estado */
  status?: SupplierStatus;

  // ── Ordenamiento inline (patrón inventory) ─────────────────────
  sort_field?:      SupplierSortField;
  sort_direction?:  SortDirection;

  // ── Tamaño de resultado ────────────────────────────────────────
  // Sin paginación visual clásica; scroll con límite alto (patrón inventory).
  page_size?: number;
}

// ── Resultado paginado ───────────────────────────────────────────

/**
 * Respuesta estándar para listas paginadas.
 * Misma forma que ProductListResult — genérico reutilizable.
 */
export interface SupplierListResult<T> {
  items:      T[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}
