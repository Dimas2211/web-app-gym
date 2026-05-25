// ─────────────────────────────────────────────────────────────────
// commerce/cash — get-any-open-cash-session-for-location.ts
//
// Devuelve la sesión OPEN más reciente para un tenant/location,
// sin requerir cash_register_id. Si hay varias cajas abiertas
// simultáneamente se toma la de opened_at más reciente.
//
// Uso: confirmación de venta para asociar Sale.cash_session_id.
// Solo lectura — no muta estado.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface OpenCashSessionRef {
  id:               string;
  cash_register_id: string;
  opened_at:        Date;
  opening_amount:   number;
  expected_cash_amount: number;
}

export async function getAnyOpenCashSessionForLocation(params: {
  tenant_id:   string;
  location_id: string;
}): Promise<OpenCashSessionRef | null> {
  const { tenant_id, location_id } = params;

  const session = await prisma.cashSession.findFirst({
    where: { tenant_id, location_id, status: "OPEN" },
    orderBy: { opened_at: "desc" },
    select: {
      id:                   true,
      cash_register_id:     true,
      opened_at:            true,
      opening_amount:       true,
      expected_cash_amount: true,
    },
  });

  if (!session) return null;

  return {
    id:                   session.id,
    cash_register_id:     session.cash_register_id,
    opened_at:            session.opened_at,
    opening_amount:       Number(session.opening_amount),
    expected_cash_amount: Number(session.expected_cash_amount),
  };
}
