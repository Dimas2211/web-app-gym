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
};

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "CCF", label: "CCF — Comprobante de Crédito Fiscal" },
  { value: "FAC", label: "FAC — Factura de Consumidor Final" },
  { value: "NCR", label: "NCR — Nota de Crédito" },
  { value: "COV", label: "COV — Comprobante de Venta" },
  { value: "NCI", label: "NCI — Nota de Crédito Interna" },
  { value: "COP", label: "COP — Comprobante de Pago" },
] as const;

export const VALID_DOCUMENT_TYPES = [
  "CCF", "FAC", "NCR", "COV", "NCI", "COP",
] as const;

export type DocumentTypeCode = (typeof VALID_DOCUMENT_TYPES)[number];

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
