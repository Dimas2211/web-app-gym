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
//   - refundCashPaymentFromSession (anulación de venta) SÍ crea CashMovement
//     REFUND_OUT: la salida de efectivo debe quedar auditada en la caja.
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

// ── Revertir pago en efectivo de una venta anulada ────────────────
//
// Contraparte de applyCashPaymentToSession para la anulación de una venta
// CONFIRMED (commerce/sales — cancelConfirmedSale). Mismas reglas que
// recordCashMovement (cash-movement.service.ts), pero componible dentro
// de la transacción de anulación:
//   - solo sesión OPEN del mismo tenant/location (nunca caja cerrada);
//   - expected_cash_amount no puede quedar negativo;
//   - deja trazabilidad con CashMovement REFUND_OUT (dirección OUT).
// Devuelve false si la guardia no se cumple: el llamador debe abortar
// su transacción (fail closed), a diferencia de applyCashPaymentToSession.

export async function refundCashPaymentFromSession(
  tx:     Prisma.TransactionClient,
  params: {
    tenant_id:       string;
    location_id:     string;
    cash_session_id: string;
    amount:          number;
    reason:          string;
    reference:       string;
    performed_by:    string;
  },
): Promise<boolean> {
  const session = await tx.cashSession.findFirst({
    where:  {
      id:          params.cash_session_id,
      tenant_id:   params.tenant_id,
      location_id: params.location_id,
      status:      "OPEN",
    },
    select: { id: true, cash_register_id: true },
  });
  if (!session) return false;

  const decremented = await tx.cashSession.updateMany({
    where: {
      id:                   session.id,
      status:               "OPEN",
      expected_cash_amount: { gte: params.amount },
    },
    data:  { expected_cash_amount: { decrement: params.amount } },
  });
  if (decremented.count !== 1) return false;

  await tx.cashMovement.create({
    data: {
      tenant_id:        params.tenant_id,
      location_id:      params.location_id,
      cash_session_id:  session.id,
      cash_register_id: session.cash_register_id,
      movement_type:    "REFUND_OUT",
      direction:        "OUT",
      amount:           params.amount,
      reason:           params.reason,
      reference:        params.reference,
      performed_by:     params.performed_by,
    },
  });

  return true;
}
