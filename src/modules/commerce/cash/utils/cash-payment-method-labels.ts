// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-payment-method-labels.ts
//
// Mapeo CAT-017 MH: código de forma de pago → descripción.
// ─────────────────────────────────────────────────────────────────

const MH_PAYMENT_FORM_MAP: Record<string, string> = {
  "01": "Billetes y monedas",
  "02": "Tarjeta Débito",
  "03": "Tarjeta Crédito",
  "04": "Cheque",
  "05": "Transferencia-Depósito Bancario",
  "08": "Dinero electrónico",
  "09": "Monedero electrónico",
  "11": "Bitcoin",
  "12": "Otras Criptomonedas",
  "13": "Cuentas por pagar del receptor",
  "14": "Giro bancario",
  "99": "Otros",
};

export function getMhPaymentFormLabel(code: string | null | undefined): string {
  if (!code) return "Sin forma de pago";
  return MH_PAYMENT_FORM_MAP[code] ?? "Código no identificado";
}

export function formatMhPaymentForm(code: string | null | undefined): string {
  if (!code) return "Sin forma de pago";
  const label = MH_PAYMENT_FORM_MAP[code];
  if (!label) return `${code} — Código no identificado`;
  return `${code} — ${label}`;
}
