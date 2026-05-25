// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash.types.ts
//
// Tipos de dominio para el módulo de caja.
// Solo tipos de lectura y proyección; los tipos de escritura
// se derivarán de schemas Zod en fases posteriores.
// ─────────────────────────────────────────────────────────────────

// ── Estado del ciclo de vida ──────────────────────────────────────

export type CashSessionStatus = "OPEN" | "CLOSED" | "CANCELLED";

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
