// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte.types.ts
// ─────────────────────────────────────────────────────────────────

export type DteEnvironment = "TEST" | "PRODUCTION";

export type DteOutgoingStatus =
  | "NOT_REQUIRED"
  | "PENDING_GENERATION"
  | "GENERATED"
  | "SCHEMA_VALIDATED"
  | "SIGNED"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "OBSERVED"
  | "CONTINGENCY_PENDING"
  | "INVALIDATION_PENDING"
  | "INVALIDATED";

// Tipos DTE permitidos en MVP
export const DTE_MVP_TYPE_CODES = ["01", "03"] as const;
export type DteMvpTypeCode = typeof DTE_MVP_TYPE_CODES[number];

// ── Configuración del emisor ──────────────────────────────────────

export interface DteIssuerConfigDetail {
  id:                      string;
  tenant_id:               string;
  location_id:             string;
  environment:             DteEnvironment;
  nit:                     string;
  nrc:                     string | null;
  name:                    string;
  legal_name:              string | null;
  activity_code:           string | null;
  activity_name:           string | null;
  establishment_code:      string | null;
  establishment_type_code: string | null;
  point_of_sale_code:      string | null;
  cod_estable_mh:          string | null;
  cod_punto_venta_mh:      string | null;
  dept_code:               string | null;
  municipality_code:       string | null;
  address_complement:      string | null;
  phone:                   string | null;
  email:                   string | null;
  is_active:               boolean;
  created_at:              Date;
  updated_at:              Date;
  created_by:              string | null;
  updated_by:              string | null;
}

// ── Documento DTE emitido ─────────────────────────────────────────

export interface DteOutgoingDocumentDetail {
  id:               string;
  tenant_id:        string;
  location_id:      string;
  sale_id:          string;
  issuer_config_id: string | null;
  dte_type_code:    string;
  generation_code:  string | null;
  control_number:   string | null;
  reception_stamp:  string | null;
  environment:      DteEnvironment;
  dte_status:       DteOutgoingStatus;
  rejection_reason: string | null;
  retry_count:      number;
  issued_at:        Date | null;
  generated_at:     Date | null;
  signed_at:        Date | null;
  sent_at:          Date | null;
  accepted_at:      Date | null;
  rejected_at:      Date | null;
  invalidated_at:   Date | null;
  created_at:       Date;
  updated_at:       Date;
}

// ── Log de transmisión ────────────────────────────────────────────

export interface DteTransmissionLogEntry {
  id:              string;
  dte_document_id: string;
  attempt_number:  number;
  operation_type:  string;
  request_url:     string | null;
  http_status:     number | null;
  error_message:   string | null;
  created_at:      Date;
}

// ── Resultados de operaciones ─────────────────────────────────────

export type DteResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

export type CreateDteIssuerConfigResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

export type CreatePendingDteResult =
  | { ok: true; dte_document_id: string }
  | { ok: false; error: string };

export type GenerateFeJsonResult =
  | { ok: true }
  | { ok: false; error: string };
