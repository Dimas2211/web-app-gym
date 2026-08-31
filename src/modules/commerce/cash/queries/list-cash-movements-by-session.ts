// ─────────────────────────────────────────────────────────────────
// commerce/cash — list-cash-movements-by-session.ts
//
// Lista los movimientos manuales de una CashSession validando
// que pertenezca al tenant/location del contexto operativo.
// Devuelve array vacío si la sesión no existe en el scope.
// Solo lectura — no muta estado.
// ─────────────────────────────────────────────────────────────────

import { prisma }   from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { CashMovementItem } from "../types/cash.types";

type ListCashMovementsBySessionParams = {
  tenant_id:       string;
  location_id:     string;
  cash_session_id: string;
};

export async function listCashMovementsBySession(
  params: ListCashMovementsBySessionParams,
  client: PrismaClient = prisma,
): Promise<CashMovementItem[]> {
  const { tenant_id, location_id, cash_session_id } = params;

  // Validar que la sesión pertenezca al tenant/location antes de listar.
  const session = await client.cashSession.findFirst({
    where: { id: cash_session_id, tenant_id, location_id },
    select: { id: true },
  });

  if (!session) return [];

  const movements = await client.cashMovement.findMany({
    where: {
      cash_session_id: session.id,
      tenant_id,
      location_id,
    },
    orderBy: { performed_at: "desc" },
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

  return movements.map((m) => ({
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
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  MANUAL_IN:      "Ingreso manual",
  MANUAL_OUT:     "Egreso manual",
  CASH_WITHDRAWAL: "Retiro de efectivo",
  PETTY_EXPENSE:  "Gasto menor",
  ADJUSTMENT_UP:  "Ajuste positivo",
  ADJUSTMENT_DOWN: "Ajuste negativo",
  REFUND_OUT:     "Devolución en efectivo",
};
