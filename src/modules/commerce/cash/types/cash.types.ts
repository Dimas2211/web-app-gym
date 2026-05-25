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
