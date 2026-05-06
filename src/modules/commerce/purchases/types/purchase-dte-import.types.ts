// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-dte-import.types.ts
//
// Tipos de dominio para la importación de documentos DTE.
// Sin "use server" — importable desde services, queries y route handlers.
// ─────────────────────────────────────────────────────────────────

// ── Estado del ciclo de revisión ──────────────────────────────────

export type DteImportStatus =
  | "UPLOADED"
  | "PENDING_REVIEW"
  | "READY_TO_CREATE_PURCHASE"
  | "LINKED"
  | "REJECTED";

// ── Metadata extraída del JSON DTE ────────────────────────────────
// Todos los campos son opcionales; si el campo no existe en el JSON
// recibido, queda null sin lanzar error.

export interface DteMetadata {
  dte_type:         string | null;  // identificacion.tipoDte
  generation_code:  string | null;  // identificacion.codigoGeneracion
  control_number:   string | null;  // identificacion.numeroControl
  environment_code: string | null;  // identificacion.ambiente ("00" prueba, "01" prod)
  issuer_nit:       string | null;  // emisor.nit
  issuer_nrc:       string | null;  // emisor.nrc
  issuer_name:      string | null;  // emisor.nombre
  issued_at:        string | null;  // ISO 8601 derivado de fecEmi + horEmi
  subtotal:         number | null;  // resumen.subTotal
  tax_amount:       number | null;  // resumen.totalIva
  total_amount:     number | null;  // resumen.totalPagar o resumen.montoTotalOperacion
  item_count:       number | null;  // cuerpoDocumento.length
}

// ── Registro completo de importación DTE ─────────────────────────

export interface PurchaseDteImportRecord {
  id:               string;
  tenant_id:        string;
  location_id:      string;
  status:           DteImportStatus;
  dte_type:         string | null;
  generation_code:  string | null;
  control_number:   string | null;
  environment_code: string | null;
  issuer_nit:       string | null;
  issuer_nrc:       string | null;
  issuer_name:      string | null;
  issued_at:        Date | null;
  subtotal:         number | null;
  tax_amount:       number | null;
  total_amount:     number | null;
  item_count:       number | null;
  purchase_id:      string | null;
  raw_json:         unknown;
  created_at:       Date;
  updated_at:       Date;
  created_by:       string | null;
}
