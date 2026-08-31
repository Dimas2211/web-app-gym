// ─────────────────────────────────────────────────────────────────
// commerce/cash — list-cash-registers.ts
//
// Lista las cajas de una location, incluyendo la sesión OPEN actual
// si existe. Solo lectura — no muta estado.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { CashRegisterListItem, CashOpenSessionInfo } from "../types/cash.types";

// ── Helper interno de mapeo de sesión ─────────────────────────────

function mapOpenSession(
  session: {
    id:               string;
    cash_register_id: string;
    opened_by:        string;
    opened_at:        Date;
    opening_amount:       { toString(): string };
    expected_cash_amount: { toString(): string };
    declared_cash_amount: { toString(): string } | null;
    difference_amount:    { toString(): string } | null;
    status: string;
    notes:  string | null;
    opened_by_user: { first_name: string; last_name: string } | null;
  } | null,
): CashOpenSessionInfo | null {
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

// ── Query principal ───────────────────────────────────────────────

export async function listCashRegisters(
  tenant_id:        string,
  location_id:      string,
  include_inactive  = false,
  client: PrismaClient = prisma,
): Promise<CashRegisterListItem[]> {
  const rows = await client.cashRegister.findMany({
    where: {
      tenant_id,
      location_id,
      ...(include_inactive ? {} : { is_active: true }),
    },
    orderBy: { code: "asc" },
    select: {
      id:          true,
      tenant_id:   true,
      location_id: true,
      code:        true,
      name:        true,
      is_active:   true,
      created_at:  true,
      updated_at:  true,
      sessions: {
        where:   { status: "OPEN" },
        take:    1,
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
      },
    },
  });

  return rows.map((row) => ({
    id:          row.id,
    tenant_id:   row.tenant_id,
    location_id: row.location_id,
    code:        row.code,
    name:        row.name,
    is_active:   row.is_active,
    created_at:  row.created_at,
    updated_at:  row.updated_at,
    open_session: mapOpenSession(row.sessions[0] ?? null),
  }));
}
