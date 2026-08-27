// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-type-codes-for-alignment.ts
//
// F3-C24 — Lista curada de tipos DTE (CAT-002) que se muestran en el
// panel administrativo de alineación de correlativos. Es SOLO para
// UI/listado — la reserva real de correlativos (reserveDteControlNumber)
// es genérica por dte_type_code y no depende de esta lista; cualquier
// tipo DTE futuro puede alinearse aunque no esté aquí, ampliando esta
// constante cuando corresponda.
// ─────────────────────────────────────────────────────────────────

export interface DteTypeCodeForAlignment {
  code:  string;
  label: string;
}

export const DTE_TYPE_CODES_FOR_ALIGNMENT: DteTypeCodeForAlignment[] = [
  { code: "01", label: "Factura (01)" },
  { code: "03", label: "Comprobante de Crédito Fiscal (03)" },
  { code: "05", label: "Nota de Crédito (05)" },
  { code: "06", label: "Nota de Débito (06)" },
  { code: "11", label: "Factura de Exportación (11)" },
  { code: "14", label: "Sujeto Excluido (14)" },
];
