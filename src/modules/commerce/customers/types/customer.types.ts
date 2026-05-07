// ─────────────────────────────────────────────────────────────────
// commerce/customers — customer.types.ts
// ─────────────────────────────────────────────────────────────────

export type CustomerStatus = "active" | "inactive";

export type CustomerTaxpayerType =
  | "FINAL_CONSUMER"
  | "REGISTERED_TAXPAYER"
  | "EXCLUDED_SUBJECT";

// ── Vista de lista ────────────────────────────────────────────────

export interface CustomerListItem {
  id:            string;
  tenant_id:     string;
  customer_code: string;
  name:          string;
  legal_name:    string | null;
  taxpayer_type: CustomerTaxpayerType | null;
  nit:           string | null;
  nrc:           string | null;
  dui:           string | null;
  email:         string | null;
  phone:         string | null;
  status:        CustomerStatus;
  created_at:    Date;
}

// ── Detalle completo ──────────────────────────────────────────────

export interface CustomerDetail extends CustomerListItem {
  id_type_code:       string | null;
  activity_code:      string | null;
  activity_name:      string | null;
  dept_code:          string | null;
  municipality_code:  string | null;
  address_complement: string | null;
  updated_at:         Date;
  created_by:         string | null;
  created_by_name:    string | null;
  updated_by:         string | null;
  updated_by_name:    string | null;
}

// ── Lookup para formulario de venta ──────────────────────────────

export interface CustomerForSaleLookup {
  id:            string;
  customer_code: string;
  name:          string;
  taxpayer_type: CustomerTaxpayerType | null;
  nit:           string | null;
  nrc:           string | null;
  dui:           string | null;
  activity_code: string | null;
}

// ── Resultado de validación para DTE ─────────────────────────────

export type CustomerDteValidationResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };
