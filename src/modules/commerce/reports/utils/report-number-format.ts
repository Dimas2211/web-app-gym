// ─────────────────────────────────────────────────────────────────
// commerce/reports — report-number-format.ts
// ─────────────────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-SV", {
    style:                 "currency",
    currency:              "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function shortCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

export function formatNumber(v: number, decimals = 0): string {
  return new Intl.NumberFormat("es-SV", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}
