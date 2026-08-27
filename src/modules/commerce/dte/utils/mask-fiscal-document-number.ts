// ─────────────────────────────────────────────────────────────────
// commerce/dte — mask-fiscal-document-number.ts
//
// Enmascara un número de documento de identificación (NIT/DUI/otro)
// para mostrarlo en UI sin exponerlo completo. Deja visibles los
// últimos 4 caracteres.
// ─────────────────────────────────────────────────────────────────

export function maskFiscalDocumentNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.trim();
  if (clean.length <= 4) return "•".repeat(clean.length);
  return "•".repeat(clean.length - 4) + clean.slice(-4);
}
