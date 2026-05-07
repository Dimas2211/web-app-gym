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
  reception_stamp:  string | null;  // selloRecibido desde respuestaHacienda u otras rutas
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
  reception_stamp:  string | null;
  purchase_id:      string | null;
  raw_json:         unknown;
  created_at:       Date;
  updated_at:       Date;
  created_by:       string | null;
}

// ── Tipos de matching sugerido ────────────────────────────────────

export type MatchTypeSupplier =
  | "NRC_EXACT"
  | "NIT_EXACT"
  | "NAME_SIMILAR"
  | "NONE";

export type MatchTypeProduct =
  | "CODE_EXACT"
  | "SKU_EXACT"
  | "NAME_SIMILAR"
  | "PARTIAL_WORDS"
  | "NONE";

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

// ── Proveedor detectado desde el emisor del DTE ───────────────────

export interface DteSupplierDetected {
  nit:  string | null;
  nrc:  string | null;
  name: string | null;
}

export interface DteSupplierSuggestion {
  supplier_id:   string | null;
  supplier_code: string | null;
  supplier_name: string | null;
  supplier_nit:  string | null;
  supplier_nrc:  string | null;
  match_type:    MatchTypeSupplier;
  confidence:    MatchConfidence;
  score:         number;
}

export interface DteSupplierMatch {
  detected:     DteSupplierDetected;
  suggestion:   DteSupplierSuggestion;
  alternatives: DteSupplierSuggestion[];
}

// ── Producto detectado desde una línea del cuerpoDocumento ────────

export interface DteItemDetected {
  code:               string | null;
  description:        string | null;
  quantity:           number | null;
  unit_code:          number | null;
  unit_price:         number | null;
  discount_amount:    number | null;
  taxable_amount:     number | null;  // ventaGravada
  exempt_amount:      number | null;  // ventaExenta
  non_subject_amount: number | null;  // ventaNoSuj
  tax_amount:         number | null;
  line_total:         number | null;
}

export interface DteProductSuggestion {
  product_id:   string | null;
  product_code: string | null;
  product_name: string | null;
  match_type:   MatchTypeProduct;
  confidence:   MatchConfidence;
  score:        number;
}

export interface DteItemMatch {
  line_number:  number;
  detected:     DteItemDetected;
  suggestion:   DteProductSuggestion;
  alternatives: DteProductSuggestion[];
}

// ── Resultado completo de matching de un DTE importado ────────────

export interface DteMatchResult {
  dte_import_id:    string;
  supplier_match:   DteSupplierMatch;
  item_matches:     DteItemMatch[];
  // Metadata documental del DTE — devuelta por el endpoint match
  dte_type?:         string | null;
  generation_code?:  string | null;
  control_number?:   string | null;
  environment_code?: string | null;
  issued_at?:        string | null;
  total_amount?:     number | null;
  reception_stamp?:  string | null;
}
