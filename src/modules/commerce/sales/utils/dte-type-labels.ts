// CAT-002 — Tipo de Documento DTE
export const DTE_TYPE_CATALOG = {
  "01": { short: "FE",   label: "Factura",                           full: "Factura Electrónica (FE)" },
  "03": { short: "CCFE", label: "Comprobante de crédito fiscal",     full: "Comprobante de Crédito Fiscal Electrónico (CCFE)" },
  "04": { short: "NRE",  label: "Nota de remisión",                  full: "Nota de Remisión Electrónica (NRE)" },
  "05": { short: "NCE",  label: "Nota de crédito",                   full: "Nota de Crédito Electrónica (NCE)" },
  "06": { short: "NDE",  label: "Nota de débito",                    full: "Nota de Débito Electrónica (NDE)" },
  "07": { short: "CRE",  label: "Comprobante de retención",          full: "Comprobante de Retención Electrónico (CRE)" },
  "08": { short: "CLE",  label: "Comprobante de liquidación",        full: "Comprobante de Liquidación Electrónico (CLE)" },
  "09": { short: "DCLE", label: "Documento contable de liquidación", full: "Documento Contable de Liquidación Electrónico (DCLE)" },
  "11": { short: "FEXE", label: "Factura de exportación",            full: "Factura de Exportación Electrónica (FEXE)" },
  "14": { short: "FSEE", label: "Factura de sujeto excluido",        full: "Factura de Sujeto Excluido Electrónica (FSEE)" },
  "15": { short: "CDE",  label: "Comprobante de donación",           full: "Comprobante de Donación Electrónico (CDE)" },
} as const;

export type DteTypeCode = keyof typeof DTE_TYPE_CATALOG;

export function getDteShortLabel(code: string): string {
  return DTE_TYPE_CATALOG[code as DteTypeCode]?.short ?? code;
}

export function getDteLabel(code: string): string {
  return DTE_TYPE_CATALOG[code as DteTypeCode]?.label ?? code;
}

/** "FE 01" */
export function getDteShortCode(code: string): string {
  const entry = DTE_TYPE_CATALOG[code as DteTypeCode];
  if (!entry) return code;
  return `${entry.short} ${code}`;
}

/** "FE 01 — Factura" */
export function getDteFullLabel(code: string): string {
  const entry = DTE_TYPE_CATALOG[code as DteTypeCode];
  if (!entry) return code;
  return `${entry.short} ${code} — ${entry.label}`;
}
