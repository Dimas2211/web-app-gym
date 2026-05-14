// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale.types.ts
// ─────────────────────────────────────────────────────────────────

export type SaleStatus        = "DRAFT" | "CONFIRMED" | "CANCELLED";
export type SalePaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED";

// ── Línea de venta ────────────────────────────────────────────────

export interface SaleItemDetail {
  id:                    string;
  sale_id:               string;
  product_id:            string;
  line_number:           number;

  // Snapshots del producto al momento de la venta
  product_code_snapshot: string;
  product_name_snapshot: string;
  product_type_snapshot: string | null;
  is_stockable_snapshot: boolean;

  quantity:       number;
  unit_price:     number;
  discount_amount: number;
  tax_rate_snapshot: number | null;
  tax_amount:     number;
  line_subtotal:  number;
  line_total:     number;

  notes:      string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Cabecera de venta — vista de lista ────────────────────────────

export interface SaleListItem {
  id:             string;
  tenant_id:      string;
  location_id:    string;
  customer_id:    string | null;
  customer_name:  string | null;
  sale_code:      string;
  sale_date:      Date;
  sale_date_label: string;
  status:         SaleStatus;
  payment_status: SalePaymentStatus;
  primary_dte_type_code: string;
  subtotal:       number;
  discount_amount: number;
  tax_amount:     number;
  total_amount:   number;
  item_count:     number;
  created_at:     Date;
  created_at_label: string;
}

// ── Documento DTE asociado a la venta ────────────────────────────

export interface SaleDteDocument {
  id:              string;
  dte_type_code:   string;
  generation_code: string | null;
  control_number:  string | null;
  reception_stamp: string | null;
  dte_status:      string;
  environment:     string;
  created_at:      Date;
}

// ── Detalle completo de venta ─────────────────────────────────────

export interface SaleDetail extends Omit<SaleListItem, "item_count"> {
  sale_year:               number;
  sale_month:              number;
  sale_sequence:           number;
  payment_method_code:      string | null;
  condition_operation_code: string | null;
  payment_term_code:        string | null;
  payment_term_value:       number | null;
  inventory_moved:          boolean;
  cash_session_id:         string | null;
  notes:                   string | null;

  confirmed_at:       Date | null;
  confirmed_at_label: string | null;
  confirmed_by:       string | null;
  confirmed_by_name:  string | null;

  cancelled_at:       Date | null;
  cancelled_at_label: string | null;
  cancelled_by:       string | null;
  cancelled_by_name:  string | null;

  created_by:      string | null;
  created_by_name: string | null;
  updated_at:      Date;
  updated_at_label: string;
  updated_by:      string | null;
  updated_by_name: string | null;

  // Datos fiscales del customer (disponibles al cargar un draft con customer_id)
  customer_nit:           string | null;
  customer_nrc:           string | null;
  customer_dui:           string | null;
  customer_taxpayer_type: string | null;
  customer_activity_code: string | null;

  items:        SaleItemDetail[];
  dte_document: SaleDteDocument | null;
}

// ── Resultados de operaciones ─────────────────────────────────────

export type SaleResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

export type CreateSaleResult =
  | { ok: true; id: string; sale_code: string }
  | { ok: false; error: string; field?: string };

export type AddSaleItemResult =
  | { ok: true; item_id: string; line_number: number }
  | { ok: false; error: string; field?: string };

// ── Lookup de producto para venta ─────────────────────────────────

export interface ProductForSaleLookup {
  id:           string;
  product_code: string;
  name:         string;
  product_type: string;
  is_stockable: boolean;
  allow_sale:   boolean;
  unit_symbol:  string;
  sale_price:   number | null;
  tax_rate:     number | null;
}

// ── Totales calculados ────────────────────────────────────────────

export interface SaleItemTotals {
  line_subtotal:  number;
  tax_amount:     number;
  line_total:     number;
}

export interface SaleTotals {
  subtotal:        number;
  discount_amount: number;
  tax_amount:      number;
  total_amount:    number;
}
