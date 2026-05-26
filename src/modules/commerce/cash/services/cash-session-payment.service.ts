// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-session-payment.service.ts
//
// Helpers para asociar pagos de venta a sesiones de caja.
//
// Reglas:
//   - Solo efectivo (mh_payment_form_code "01") modifica expected_cash_amount.
//   - applyCashPaymentToSession valida que la sesión siga OPEN antes de sumar.
//   - No crea CashMovement — los pagos quedan auditados por SalePayment.
//   - No modifica declared_cash_amount ni difference_amount.
//   - Usable dentro de una transacción Prisma existente (recibe tx como parámetro).
// ─────────────────────────────────────────────────────────────────

import type { Prisma } from "@prisma/client";

// ── Detectar si un pago es efectivo físico ────────────────────────
//
// Regla principal: mh_payment_form_code === "01" (CAT-017 — Billetes y monedas).
// Respaldo defensivo: payment_method_code normalizado es "cash" o "efectivo".

export function isCashPayment(params: {
  mh_payment_form_code?: string | null;
  payment_method_code?:  string | null;
}): boolean {
  if (params.mh_payment_form_code === "01") return true;
  const code = params.payment_method_code?.toLowerCase().trim();
  return code === "cash" || code === "efectivo";
}

// ── Sumar pago en efectivo al expected_cash_amount ─────────────────
//
// Recibe transaction client para ejecutarse dentro de la transacción de confirmación.
// Usa updateMany con guardia status=OPEN: si la sesión cerró concurrentemente,
// count=0 y se omite silenciosamente sin abortar la venta.

export async function applyCashPaymentToSession(
  tx:     Prisma.TransactionClient,
  params: { cash_session_id: string; amount: number },
): Promise<void> {
  await tx.cashSession.updateMany({
    where: { id: params.cash_session_id, status: "OPEN" },
    data:  { expected_cash_amount: { increment: params.amount } },
  });
}
