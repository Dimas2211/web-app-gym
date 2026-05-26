// ─────────────────────────────────────────────────────────────────
// commerce/cash — get-cash-session-cut-report.ts
//
// Genera el reporte de corte de una CashSession validando que
// pertenezca al tenant/location del contexto operativo.
//
// Seguridad:
//   1. La CashSession se busca por id + tenant_id + location_id.
//   2. Solo si la sesión pertenece al scope se accede a SalePayment
//      y Sale, que no tienen tenant_id/location_id propios pero
//      quedan implícitamente acotados por la sesión validada.
//
// Nota sobre payments_summary:
//   SalePayment no tiene tenant_id. Se consulta por cash_session_id
//   de la sesión ya validada — scope implícito garantizado.
//
// Nota sobre sales_summary:
//   Sale sí tiene tenant_id y location_id. Se consulta con los
//   tres filtros para máxima seguridad.
//
// Solo lectura — no muta estado.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import { deriveCashCutStatus } from "../utils/derive-cash-cut-status";
import { formatMhPaymentForm, getMhPaymentFormLabel } from "../utils/cash-payment-method-labels";
import type {
  CashSessionCutReport,
  CashPaymentMethodSummary,
  CashPaymentDetail,
  CashSalesSummary,
  CashMovementItem,
} from "../types/cash.types";

type GetCashSessionCutReportParams = {
  tenant_id:       string;
  location_id:     string;
  cash_session_id: string;
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  MANUAL_IN:       "Ingreso manual",
  MANUAL_OUT:      "Egreso manual",
  CASH_WITHDRAWAL: "Retiro de efectivo",
  PETTY_EXPENSE:   "Gasto menor",
  ADJUSTMENT_UP:   "Ajuste positivo",
  ADJUSTMENT_DOWN: "Ajuste negativo",
  REFUND_OUT:      "Devolución en efectivo",
};

export async function getCashSessionCutReport(
  params: GetCashSessionCutReportParams,
): Promise<CashSessionCutReport | null> {
  const { tenant_id, location_id, cash_session_id } = params;

  // 1. Buscar y validar la sesión en el scope del tenant/location.
  const session = await prisma.cashSession.findFirst({
    where: { id: cash_session_id, tenant_id, location_id },
    select: {
      id:                   true,
      tenant_id:            true,
      location_id:          true,
      cash_register_id:     true,
      opened_by:            true,
      closed_by:            true,
      opened_at:            true,
      closed_at:            true,
      opening_amount:       true,
      expected_cash_amount: true,
      declared_cash_amount: true,
      difference_amount:    true,
      status:               true,
      notes:                true,
      cash_register: {
        select: { code: true, name: true },
      },
      opened_by_user: {
        select: { first_name: true, last_name: true },
      },
      closed_by_user: {
        select: { first_name: true, last_name: true },
      },
    },
  });

  if (!session) return null;

  // 2. Movimientos manuales ordenados por fecha asc.
  const rawMovements = await prisma.cashMovement.findMany({
    where: { cash_session_id: session.id, tenant_id, location_id },
    orderBy: { performed_at: "asc" },
    select: {
      id:               true,
      tenant_id:        true,
      location_id:      true,
      cash_session_id:  true,
      cash_register_id: true,
      movement_type:    true,
      direction:        true,
      amount:           true,
      reason:           true,
      reference:        true,
      notes:            true,
      performed_by:     true,
      performed_at:     true,
      created_at:       true,
      updated_at:       true,
      performed_by_user: {
        select: { first_name: true, last_name: true },
      },
    },
  });

  const movements: CashMovementItem[] = rawMovements.map((m) => ({
    id:               m.id,
    tenant_id:        m.tenant_id,
    location_id:      m.location_id,
    cash_session_id:  m.cash_session_id,
    cash_register_id: m.cash_register_id,
    movement_type:       m.movement_type as CashMovementItem["movement_type"],
    movement_type_label: MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type,
    direction:           m.direction as CashMovementItem["direction"],
    amount:    Number(m.amount),
    reason:    m.reason,
    reference: m.reference,
    notes:     m.notes,
    performed_by: m.performed_by,
    performed_by_name: m.performed_by_user
      ? `${m.performed_by_user.first_name} ${m.performed_by_user.last_name}`
      : null,
    performed_at: m.performed_at,
    created_at:   m.created_at,
    updated_at:   m.updated_at,
  }));

  // 3. Totales de movimientos manuales.
  let manual_in_total  = 0;
  let manual_out_total = 0;
  for (const m of movements) {
    if (m.direction === "IN")  manual_in_total  += m.amount;
    if (m.direction === "OUT") manual_out_total += m.amount;
  }

  // 4. Calcular cut_status derivado.
  const diff = session.difference_amount != null
    ? Number(session.difference_amount)
    : null;
  const cut_status = deriveCashCutStatus(
    session.status as "OPEN" | "CLOSED" | "CANCELLED",
    diff,
  );

  // 5. payments_summary + payment_details — SalePayment por sesión.
  //    SalePayment no tiene tenant_id/location_id propios.
  //    Scope garantizado porque la sesión ya fue validada arriba.
  //    total_paid_from_payments se reutiliza en sales_summary (paso 6).
  let payments_summary: CashPaymentMethodSummary[] = [];
  let payment_details:  CashPaymentDetail[]        = [];
  let total_paid_from_payments = 0;
  try {
    const rawPayments = await prisma.salePayment.findMany({
      where: { cash_session_id: session.id },
      orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
      select: {
        id:                   true,
        sale_id:              true,
        payment_method_code:  true,
        mh_payment_form_code: true,
        amount:               true,
        reference:            true,
        paid_at:              true,
        created_at:           true,
        sale: {
          select: {
            sale_code:   true,
            tenant_id:   true,
            location_id: true,
          },
        },
      },
    });

    // Filtrar pagos cuya venta pertenezca al mismo tenant/location
    const scopedPayments = rawPayments.filter((p) =>
      p.sale.tenant_id   === tenant_id &&
      p.sale.location_id === location_id,
    );

    // payments_summary — agrupado por código MH de forma de pago
    const byKey: Record<string, CashPaymentMethodSummary> = {};
    for (const p of scopedPayments) {
      const key = `${p.payment_method_code}:${p.mh_payment_form_code ?? ""}`;
      if (!byKey[key]) {
        byKey[key] = {
          payment_method_code:  p.payment_method_code,
          mh_payment_form_code: p.mh_payment_form_code,
          label:                formatMhPaymentForm(p.mh_payment_form_code ?? p.payment_method_code),
          total_amount:         0,
          count:                0,
        };
      }
      byKey[key].total_amount += Number(p.amount);
      byKey[key].count        += 1;
    }
    payments_summary = Object.values(byKey);

    // payment_details — fila individual por pago
    payment_details = scopedPayments.map((p) => {
      const ts     = p.paid_at ?? p.created_at;
      const locale = "es-SV";
      const paid_at_label    = ts.toLocaleString(locale, {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      const paid_time_label  = ts.toLocaleString(locale, {
        hour: "2-digit", minute: "2-digit",
      });

      return {
        id:                    p.id,
        sale_id:               p.sale_id,
        sale_code:             p.sale.sale_code ?? null,
        payment_method_code:   p.payment_method_code,
        payment_method_label:  getMhPaymentFormLabel(p.payment_method_code),
        mh_payment_form_code:  p.mh_payment_form_code,
        mh_payment_form_label: getMhPaymentFormLabel(p.mh_payment_form_code),
        reference:             p.reference ?? null,
        amount:                Number(p.amount),
        paid_at:               ts.toISOString(),
        paid_at_label,
        paid_time_label,
      } satisfies CashPaymentDetail;
    });

    // Suma real de pagos: fuente de verdad para paid_amount en sales_summary.
    total_paid_from_payments = scopedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  } catch {
    // Si el modelo aún no tiene datos de pagos asociados, retornar vacío.
    payments_summary    = [];
    payment_details     = [];
    total_paid_from_payments = 0;
  }

  // 6. sales_summary — Sale filtrada por tenant + location + cash_session_id.
  //    paid_amount: suma real desde SalePayment (no desde Sale.payment_status,
  //    que permanece UNPAID hasta que se implemente la actualización de estado).
  //    unpaid_amount: max(total - paid, 0) — nunca negativo por redondeo.
  let sales_summary: CashSalesSummary = {
    sales_count:   0,
    total_amount:  0,
    paid_amount:   0,
    unpaid_amount: 0,
  };
  try {
    const rawSales = await prisma.sale.findMany({
      where: {
        tenant_id,
        location_id,
        cash_session_id: session.id,
        status:          "CONFIRMED",
      },
      select: {
        total_amount: true,
      },
    });

    let total = 0;
    for (const s of rawSales) {
      total += Number(s.total_amount);
    }

    const paid   = total_paid_from_payments;
    const unpaid = Math.max(total - paid, 0);

    sales_summary = {
      sales_count:   rawSales.length,
      total_amount:  total,
      paid_amount:   paid,
      unpaid_amount: unpaid,
    };
  } catch {
    // Si no hay ventas asociadas todavía, quedar en cero.
  }

  return {
    session_id:           session.id,
    tenant_id:            session.tenant_id,
    location_id:          session.location_id,
    cash_register_id:     session.cash_register_id,
    cash_register_code:   session.cash_register.code,
    cash_register_name:   session.cash_register.name,
    status:               session.status as "OPEN" | "CLOSED" | "CANCELLED",
    cut_status,
    opened_by_name:       session.opened_by_user
      ? `${session.opened_by_user.first_name} ${session.opened_by_user.last_name}`
      : null,
    closed_by_name:       session.closed_by_user
      ? `${session.closed_by_user.first_name} ${session.closed_by_user.last_name}`
      : null,
    opened_at:            session.opened_at,
    closed_at:            session.closed_at,
    opening_amount:       Number(session.opening_amount),
    manual_in_total,
    manual_out_total,
    expected_cash_amount: Number(session.expected_cash_amount),
    declared_cash_amount: session.declared_cash_amount != null
      ? Number(session.declared_cash_amount)
      : null,
    difference_amount:    diff,
    movements_count:      movements.length,
    payments_summary,
    payment_details,
    sales_summary,
    movements,
  };
}
