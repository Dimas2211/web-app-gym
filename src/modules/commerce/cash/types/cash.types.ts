// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash.types.ts
//
// Tipos de dominio para el módulo de caja.
// ─────────────────────────────────────────────────────────────────

// ── Estado del ciclo de vida ──────────────────────────────────────

export type CashSessionStatus = "OPEN" | "CLOSED" | "CANCELLED";

// ── Tipos de movimiento de caja ───────────────────────────────────

export type CashMovementType =
  | "MANUAL_IN"
  | "MANUAL_OUT"
  | "CASH_WITHDRAWAL"
  | "PETTY_EXPENSE"
  | "ADJUSTMENT_UP"
  | "ADJUSTMENT_DOWN"
  | "REFUND_OUT";

export type CashMovementDirection = "IN" | "OUT";

// ── Proyección de un movimiento de caja ──────────────────────────

export interface CashMovementItem {
  id:               string;
  tenant_id:        string;
  location_id:      string;
  cash_session_id:  string;
  cash_register_id: string;
  movement_type:       CashMovementType;
  movement_type_label: string;
  direction:           CashMovementDirection;
  amount:           number;
  reason:           string | null;
  reference:        string | null;
  notes:            string | null;
  performed_by:      string;
  performed_by_name: string | null;
  performed_at:     Date;
  created_at:       Date;
  updated_at:       Date;
}

// ── Resultado de registrar un movimiento ─────────────────────────

export interface CashMovementCreateResult {
  movement:             CashMovementItem;
  expected_cash_amount: number;
}

// ── Sesión abierta de una caja ────────────────────────────────────

export interface CashOpenSessionInfo {
  id:               string;
  cash_register_id: string;
  opened_by:        string;
  opened_by_name:   string | null;
  opened_at:        Date;
  opening_amount:       number;
  expected_cash_amount: number;
  declared_cash_amount: number | null;
  difference_amount:    number | null;
  status: CashSessionStatus;
  notes:  string | null;
}

// ── Caja — vista de lista (incluye sesión OPEN si existe) ─────────

export interface CashRegisterListItem {
  id:          string;
  tenant_id:   string;
  location_id: string;
  code:        string;
  name:        string;
  is_active:   boolean;
  created_at:  Date;
  updated_at:  Date;
  open_session: CashOpenSessionInfo | null;
}

// ── Caja — detalle completo ───────────────────────────────────────

export interface CashRegisterDetail {
  id:          string;
  tenant_id:   string;
  location_id: string;
  code:        string;
  name:        string;
  is_active:   boolean;
  created_at:  Date;
  updated_at:  Date;
  open_session: CashOpenSessionInfo | null;
}

// ── Estado del workspace de caja ─────────────────────────────────
//
// Proyección mínima para que la futura UI cargue en una sola llamada
// la lista de cajas y el estado de la caja seleccionada.

export interface CashWorkspaceState {
  registers:        CashRegisterListItem[];
  selected_register: CashRegisterDetail | null;
  open_session:     CashOpenSessionInfo | null;
}

// ── Estado derivado de corte ──────────────────────────────────────

export type CashCutStatus =
  | "OPEN"
  | "CLOSED_BALANCED"
  | "CLOSED_OVER"
  | "CLOSED_SHORT"
  | "CANCELLED";

// ── Sesión en historial ───────────────────────────────────────────

export interface CashSessionHistoryItem {
  id:                   string;
  tenant_id:            string;
  location_id:          string;
  cash_register_id:     string;
  cash_register_code:   string;
  cash_register_name:   string;
  opened_by:            string;
  opened_by_name:       string | null;
  closed_by:            string | null;
  closed_by_name:       string | null;
  opened_at:            Date;
  closed_at:            Date | null;
  opening_amount:       number;
  expected_cash_amount: number;
  declared_cash_amount: number | null;
  difference_amount:    number | null;
  status:               CashSessionStatus;
  cut_status:           CashCutStatus;
  notes:                string | null;
  movements_count:      number;
  created_at:           Date;
  updated_at:           Date;
}

// ── Resumen de forma de pago en corte ────────────────────────────

export interface CashPaymentMethodSummary {
  payment_method_code:  string;
  mh_payment_form_code: string | null;
  label:                string;
  total_amount:         number;
  count:                number;
}

// ── Resumen de ventas en corte ────────────────────────────────────

export interface CashSalesSummary {
  sales_count:    number;
  total_amount:   number;
  paid_amount:    number;
  unpaid_amount:  number;
}

// ── Reporte de corte de una sesión ────────────────────────────────
//
// Contrato pensado como base para vista imprimible, PDF y Excel
// en fases posteriores. Pagos y ventas pueden estar vacíos/en cero
// si todavía no hay integración sales → cash en producción.

export interface CashSessionCutReport {
  session_id:           string;
  tenant_id:            string;
  location_id:          string;
  cash_register_id:     string;
  cash_register_code:   string;
  cash_register_name:   string;
  status:               CashSessionStatus;
  cut_status:           CashCutStatus;
  opened_by_name:       string | null;
  closed_by_name:       string | null;
  opened_at:            Date;
  closed_at:            Date | null;
  opening_amount:       number;
  manual_in_total:      number;
  manual_out_total:     number;
  expected_cash_amount: number;
  declared_cash_amount: number | null;
  difference_amount:    number | null;
  movements_count:      number;
  payments_summary:     CashPaymentMethodSummary[];
  sales_summary:        CashSalesSummary;
  movements:            CashMovementItem[];
}
