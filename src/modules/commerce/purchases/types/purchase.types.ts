// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase.types.ts
//
// Tipos de dominio para el módulo de compras.
// Solo tipos de lectura y proyección; los tipos de escritura
// se derivan de los schemas Zod en schemas/.
// ─────────────────────────────────────────────────────────────────

// ── Estado del ciclo de vida ──────────────────────────────────────

export type PurchaseStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";

// ── Línea de compra ───────────────────────────────────────────────

export interface PurchaseItemDetail {
  id:          string;
  purchase_id: string;
  product_id:  string;

  // Denormalizado del catálogo — no requiere joins en el consumidor
  product_code: string;
  product_name: string;
  product_type: string;   // "PRODUCT" | "SERVICE" — string por patrón del proyecto
  is_stockable: boolean;
  unit_symbol:  string;

  // Montos de línea
  quantity:      number;
  unit_cost:     number;
  tax_amount:    number;
  line_subtotal: number;
  line_total:    number;

  notes:      string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Cabecera de compra — vista de lista ───────────────────────────

export interface PurchaseListItem {
  id:            string;
  tenant_id:     string;
  location_id:   string;
  supplier_id:   string;
  supplier_name: string;
  supplier_nrc:  string | null;
  purchase_code: string;
  purchase_date: Date;
  purchase_date_label: string;
  document_series:   string | null;
  document_number:   string | null;
  payment_condition: string | null;
  cancellation_type: string | null;
  status:        PurchaseStatus;
  source_type:   string | null;
  subtotal:      number;
  tax_amount:    number;
  total_amount:  number;
  item_count:    number;
  created_at:    Date;
  created_at_label: string;
}

// ── Detalle completo de compra ────────────────────────────────────

export interface PurchaseDetail extends Omit<PurchaseListItem, "item_count"> {
  notes: string | null;

  // Campos documentales base
  document_type:     string | null;
  document_series:   string | null;
  document_number:   string | null;
  payment_condition: string | null;
  cancellation_type: string | null;
  supplier_nrc:      string | null;

  // Campos DTE — solo presentes cuando source_type = "DTE_IMPORT"
  generation_code:     string | null;
  control_number:      string | null;
  reception_stamp:     string | null;
  dte_environment_code: string | null;
  dte_processed_at:    Date | null;

  // Retención IVA 1%
  retention_1pct_applies: boolean;
  retention_1pct_amount:  number;
  net_to_pay:             number;  // calculado: total_amount - retention_1pct_amount

  // Auditoría de confirmación
  confirmed_at:       Date | null;
  confirmed_at_label: string | null;
  confirmed_by:       string | null;
  confirmed_by_name:  string | null;

  // Auditoría de cancelación (Etapa 12A — simétrico a confirmación)
  cancelled_at:       Date | null;
  cancelled_at_label: string | null;
  cancelled_by:       string | null;
  cancelled_by_name:  string | null;

  // Auditoría de creación y última modificación
  created_by:      string | null;
  created_by_name: string | null;
  updated_at:      Date;
  updated_at_label: string;
  updated_by:      string | null;
  updated_by_name: string | null;

  items: PurchaseItemDetail[];
}

// ── Lookups para formularios ──────────────────────────────────────

export interface ProductForPurchaseLookup {
  id:           string;
  product_code: string;
  name:         string;
  product_type: string;
  is_stockable: boolean;
  unit_symbol:  string;
  cost_price:   number | null;   // sugerencia de precio de costo del catálogo
  tax_rate:     number | null;   // tasa de impuesto del catálogo (%)
  current_stock: number | null;  // null = sin registro en product_locations para la location activa
}

// Re-export del tipo canónico que vive en el maestro de proveedores.
// purchases consume el lookup rico (id, supplier_code, name, taxpayer_type, nit, nrc, status)
// desde getSuppliersForLookup() en commerce/suppliers/queries/get-suppliers-for-lookup.ts.
export type { SupplierForPurchaseLookup } from "../../suppliers/types/supplier.types";
