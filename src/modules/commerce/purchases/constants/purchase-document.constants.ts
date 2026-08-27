// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-document.constants.ts
//
// Constantes cerradas de tipos documentales, formas de pago y
// tipos de cancelación del módulo de compras.
//
// Estrategia de persistencia:
//   - Tipos con equivalente fiscal MH canónico → se persiste el código canónico
//   - Tipos sin equivalente MH (documentos informales/internos) → se persiste el código ERP
//
// Mapeo ERP → código persistido:
//   COC → CCF  (Comprobante de Crédito Fiscal)
//   COF → FAC  (Factura de Consumidor Final)
//   NCR → NCR  (Nota de Crédito — ya canónico)
//   COV → COV  (Comprobante de Venta — sin equivalente MH)
//   NCI → NCI  (Nota de Crédito Interna — documento interno)
//   COP → COP  (Comprobante de Pago — quedán informal)
// ─────────────────────────────────────────────────────────────────

// ── Tipos documentales ────────────────────────────────────────────

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CCF: "Comprobante de Crédito Fiscal",
  FAC: "Factura de Consumidor Final",
  NCR: "Nota de Crédito",
  COV: "Comprobante de Venta",
  NCI: "Nota de Crédito Interna",
  COP: "Comprobante de Pago",
  FSE: "Factura de Sujeto Excluido (DTE 14)",
};

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "CCF", label: "CCF — Comprobante de Crédito Fiscal" },
  { value: "FAC", label: "FAC — Factura de Consumidor Final" },
  { value: "NCR", label: "NCR — Nota de Crédito" },
  { value: "COV", label: "COV — Comprobante de Venta" },
  { value: "NCI", label: "NCI — Nota de Crédito Interna" },
  { value: "COP", label: "COP — Comprobante de Pago" },
  { value: "FSE", label: "FSE — Factura de Sujeto Excluido (DTE 14)" },
] as const;

// FSE marca explícitamente una compra cuya documentación fiscal saliente
// será un DTE 14 (Factura de Sujeto Excluido Electrónica). No reemplaza COV
// (registro interno/no fiscal) — una compra COV existente nunca se convierte
// automáticamente en FSE; el usuario debe elegir FSE explícitamente al
// capturar o editar la compra.
export const VALID_DOCUMENT_TYPES = [
  "CCF", "FAC", "NCR", "COV", "NCI", "COP", "FSE",
] as const;

// Tipos documentales de Purchase habilitados para emitir FSE 14.
export const FSE_ELIGIBLE_DOCUMENT_TYPES: readonly string[] = ["FSE"];

export type DocumentTypeCode = (typeof VALID_DOCUMENT_TYPES)[number];

// La FSE (compra a sujeto excluido) nunca genera crédito fiscal IVA —
// las líneas de una Purchase FSE siempre llevan tax_amount = 0, sin
// importar el Product.tax_rate configurado (13% u otro). Esto es una
// regla de la compra, no del catálogo — Product.tax_rate NO se toca.
export function isFseDocumentType(documentType: string | null | undefined): boolean {
  return documentType != null && FSE_ELIGIBLE_DOCUMENT_TYPES.includes(documentType);
}

// ── Formas de pago ────────────────────────────────────────────────

export const PAYMENT_CONDITION_LABELS: Record<string, string> = {
  CON: "Contado",
  CRE: "Crédito",
  OTR: "Otro",
};

export const PAYMENT_CONDITION_OPTIONS = [
  { value: "CON", label: "Contado" },
  { value: "CRE", label: "Crédito" },
  { value: "OTR", label: "Otro" },
] as const;

export const VALID_PAYMENT_CONDITIONS = ["CON", "CRE", "OTR"] as const;

// ── Tipos de cancelación ──────────────────────────────────────────

export const CANCELLATION_TYPE_LABELS: Record<string, string> = {
  EFE: "Efectivo",
  CHE: "Cheque",
  TRN: "Transferencia bancaria",
  POS: "Tarjeta (POS)",
  OTR: "Otro",
};

export const CANCELLATION_TYPE_OPTIONS = [
  { value: "EFE", label: "Efectivo" },
  { value: "CHE", label: "Cheque" },
  { value: "TRN", label: "Transferencia bancaria" },
  { value: "POS", label: "Tarjeta (POS)" },
  { value: "OTR", label: "Otro" },
] as const;

export const VALID_CANCELLATION_TYPES = ["EFE", "CHE", "TRN", "POS", "OTR"] as const;

// ── Retención IVA 1% — tipos aplicables ──────────────────────────
// Solo documentos gravados de compra base. NDB excluido hasta verificación.

export const RETENTION_1PCT_APPLICABLE_DOCTYPES: readonly string[] = ["CCF", "FAC"];

// ── Naturaleza del pago — relevante para Retención de Renta (FSE 14) ──
// La FSE es el documento fiscal; la retención depende de esta naturaleza
// + la clasificación persona natural/jurídica del proveedor, nunca del
// solo hecho de ser FSE. Ver income-tax-withholding.util.ts.

export const PAYMENT_NATURE_LABELS: Record<string, string> = {
  GOODS:               "Compra de bienes",
  SERVICES:            "Prestación de servicios",
  GOODS_AND_SERVICES:  "Bienes + servicios separados",
  LUMP_SUM_CONTRACT:   "Contrato por precio alzado",
  OTHER:               "Otro / no sujeto a retención automática",
};

export const PAYMENT_NATURE_OPTIONS = [
  { value: "GOODS",              label: "Compra de bienes" },
  { value: "SERVICES",           label: "Prestación de servicios" },
  { value: "GOODS_AND_SERVICES", label: "Bienes + servicios separados" },
  { value: "LUMP_SUM_CONTRACT",  label: "Contrato por precio alzado" },
  { value: "OTHER",              label: "Otro / no sujeto a retención automática" },
] as const;

export const VALID_PAYMENT_NATURES = [
  "GOODS", "SERVICES", "GOODS_AND_SERVICES", "LUMP_SUM_CONTRACT", "OTHER",
] as const;

// ── Clasificación persona natural/jurídica del proveedor ─────────

export const SUPPLIER_PERSON_TYPE_LABELS: Record<string, string> = {
  NATURAL_PERSON: "Persona natural",
  LEGAL_ENTITY:   "Persona jurídica",
  UNKNOWN:        "Sin clasificar",
};
