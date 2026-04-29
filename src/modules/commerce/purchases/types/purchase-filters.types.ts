// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-filters.types.ts
//
// Tipos de filtrado y paginación para el listado de compras.
// ─────────────────────────────────────────────────────────────────

import type { PurchaseStatus } from "./purchase.types";

export type PurchaseSortField =
  | "purchase_code"
  | "purchase_date"
  | "supplier_name"
  | "total_amount"
  | "status"
  | "created_at";

export interface PurchaseFilters {
  // Requeridos — siempre se filtran por identidad transversal
  tenant_id:   string;
  location_id: string;

  // Opcionales
  status?:          PurchaseStatus;
  supplier_id?:     string;
  supplier_search?: string;   // busca en supplier.name (contains, insensitive)
  date_from?:       string;   // ISO date "YYYY-MM-DD"
  date_to?:         string;   // ISO date "YYYY-MM-DD"
  search?:          string;   // busca en purchase_code (contains, insensitive)

  sort_field?:      PurchaseSortField;
  sort_direction?:  "asc" | "desc";
  page?:            number;
  page_size?:       number;
}
