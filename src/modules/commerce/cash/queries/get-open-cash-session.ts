// ─────────────────────────────────────────────────────────────────
// commerce/cash — get-open-cash-session.ts
//
// Obtiene la sesión OPEN de una caja concreta, validando que la
// caja pertenezca al tenant/location del contexto operativo.
// Devuelve null si no hay sesión abierta o si la caja no existe.
// Solo lectura — no muta estado.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CashOpenSessionInfo } from "../types/cash.types";

export async function getOpenCashSession(
  cash_register_id: string,
  tenant_id:        string,
  location_id:      string,
): Promise<CashOpenSessionInfo | null> {
  // Validar que la caja exista y pertenezca al scope antes de buscar su sesión.
  // Se usa findFirst con los tres campos para que el scope quede garantizado
  // en una sola query, sin riesgo de que cash_register_id baste por sí solo.
  const register = await prisma.cashRegister.findFirst({
    where: { id: cash_register_id, tenant_id, location_id },
    select: { id: true },
  });

  if (!register) return null;

  const session = await prisma.cashSession.findFirst({
    where:   { cash_register_id: register.id, tenant_id, location_id, status: "OPEN" },
    orderBy: { opened_at: "desc" },
    select: {
      id:               true,
      cash_register_id: true,
      opened_by:        true,
      opened_at:        true,
      opening_amount:       true,
      expected_cash_amount: true,
      declared_cash_amount: true,
      difference_amount:    true,
      status: true,
      notes:  true,
      opened_by_user: {
        select: { first_name: true, last_name: true },
      },
    },
  });

  if (!session) return null;

  return {
    id:               session.id,
    cash_register_id: session.cash_register_id,
    opened_by:        session.opened_by,
    opened_by_name:   session.opened_by_user
      ? `${session.opened_by_user.first_name} ${session.opened_by_user.last_name}`
      : null,
    opened_at:            session.opened_at,
    opening_amount:       Number(session.opening_amount),
    expected_cash_amount: Number(session.expected_cash_amount),
    declared_cash_amount: session.declared_cash_amount
      ? Number(session.declared_cash_amount)
      : null,
    difference_amount: session.difference_amount
      ? Number(session.difference_amount)
      : null,
    status: session.status as CashOpenSessionInfo["status"],
    notes:  session.notes,
  };
}
