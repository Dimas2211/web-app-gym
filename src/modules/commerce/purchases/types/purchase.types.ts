// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase.types.ts
//
// Tipos de dominio para el módulo de compras.
// Solo tipos de lectura y proyección; los tipos de escritura
// se derivan de los schemas Zod en schemas/.
// ─────────────────────────────────────────────────────────────────

// ── Estado del ciclo de vida ──────────────────────────────────────

export type PurchaseStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";

// Naturaleza del pago — relevante para Retención de Renta en FSE 14.
// Espejo del enum PurchasePaymentNature del schema Prisma.
export type PurchasePaymentNature =
  | "GOODS"
  | "SERVICES"
  | "GOODS_AND_SERVICES"
  | "LUMP_SUM_CONTRACT"
  | "OTHER";

// Clasificación persona natural/jurídica del proveedor.
// Espejo del enum SupplierPersonType del schema Prisma.
export type SupplierPersonType = "NATURAL_PERSON" | "LEGAL_ENTITY" | "UNKNOWN";

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

  // Naturaleza del pago — decide (junto a supplier_fiscal.person_type) si
  // la Retención de Renta se calcula automáticamente. Null en histórico.
  payment_nature: PurchasePaymentNature | null;

  // Retención de Renta — relevante para FSE 14. NO se deriva automáticamente
  // de Supplier.taxpayer_type — el usuario decide si aplica por compra.
  income_tax_withholding_applies: boolean;
  income_tax_withholding_rate:    number | null;
  income_tax_withholding_amount:  number;
  income_tax_withholding_base:    number;

  // Fiscal DTE — presente solo cuando la compra tiene un DteOutgoingDocument
  // tipo 14 (FSE) asociado (purchase_id).
  dte_document:      PurchaseDteDocument | null;
  external_delivery: PurchaseExternalDeliverySummary;
  dte_transmission_logs: PurchaseDteTransmissionLogRow[];

  // Snapshot fiscal del proveedor, solo relevante cuando document_type === "FSE".
  supplier_fiscal: PurchaseSupplierFiscalSnapshot;

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

// ── Fiscal DTE (FSE 14) ────────────────────────────────────────────

export interface PurchaseDteDocument {
  id:               string;
  dte_type_code:    string;
  generation_code:  string | null;
  control_number:   string | null;
  reception_stamp:  string | null;
  dte_status:       string;
  environment:      string;
  rejection_reason: string | null;
  issued_at:        Date | null;
  generated_at:     Date | null;
  accepted_at:      Date | null;
  rejected_at:      Date | null;
  created_at:       Date;

  // Diagnóstico / detalle técnico — F-UI-FSE14-1
  issuer_config_id:       string | null;
  transmission_type_code: string;
  retry_count:            number;
  json_document:          unknown; // JSON FSE pre-firma — nunca incluye signed_jws/credenciales
  mh_estado:              string | null;
  codigo_msg:             string | null;
  descripcion_msg:        string | null;
  observations:           unknown;
  cod_estable_mh:         string | null;
  cod_punto_venta_mh:     string | null;
}

export interface PurchaseExternalDeliverySummary {
  hasSuccessfulDelivery: boolean;
  lastAttemptAt:         Date | null;
  lastErrorMessage:      string | null;
  attemptsCount:         number;
}

// ── Historial de transmisión (DteTransmissionLog) — F-UI-FSE14-1 ──

export interface PurchaseDteTransmissionLogRow {
  id:              string;
  operation_type:  string;
  http_status:     number | null;
  created_at:      Date;
  mh_estado:       string | null;
  codigo_msg:      string | null;
  descripcion_msg: string | null;
  error_message:   string | null;
}

// ── Validación fiscal del sujeto excluido (Supplier) — F-UI-FSE14-1 ──
// Espejo de presentación de mapSupplierToSujetoExcluido — reutiliza esa
// misma función (utils/supplier-to-sujeto-excluido.mapper.ts) para no
// duplicar reglas fiscales en frontend.

export interface PurchaseSupplierFiscalSnapshot {
  is_excluded_subject:    boolean; // taxpayer_type === "EXCLUDED_SUBJECT"
  taxpayer_type:          string;
  person_type:            SupplierPersonType; // Persona natural/jurídica — decide automatización de Renta
  id_type_code:           string | null;
  masked_document_number: string | null;
  name:                   string;
  legal_name:             string | null;
  activity_code:          string | null;
  activity_name:          string | null;
  dept_name:              string | null;
  municipality_name:      string | null;
  address_complement:     string | null;
  phone:                  string | null;
  email:                  string | null;
  validation_ok:          boolean;
  missing_fields:         string[];
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
