// ─────────────────────────────────────────────────────────────────
// commerce/cash — list-cash-sessions.ts
//
// Lista sesiones de caja del historial para un tenant/location.
// Siempre filtra por tenant_id y location_id. No devuelve sesiones
// de otro scope bajo ninguna circunstancia.
// Solo lectura — no muta estado.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import { deriveCashCutStatus } from "../utils/derive-cash-cut-status";
import type { CashSessionHistoryItem } from "../types/cash.types";

type ListCashSessionsParams = {
  tenant_id:        string;
  location_id:      string;
  cash_register_id?: string | null;
  status?:          "OPEN" | "CLOSED" | "CANCELLED" | "ALL";
  date_from?:       string | null;
  date_to?:         string | null;
  only_differences?: boolean;
  limit?:           number;
};

export async function listCashSessions(
  params: ListCashSessionsParams,
  client: PrismaClient = prisma,
): Promise<CashSessionHistoryItem[]> {
  const {
    tenant_id,
    location_id,
    cash_register_id,
    status = "ALL",
    date_from,
    date_to,
    only_differences = false,
    limit = 30,
  } = params;

  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const sessions = await client.cashSession.findMany({
    where: {
      tenant_id,
      location_id,
      ...(cash_register_id ? { cash_register_id } : {}),
      ...(status !== "ALL" ? { status } : {}),
      ...(date_from || date_to
        ? {
            opened_at: {
              ...(date_from ? { gte: new Date(date_from) } : {}),
              ...(date_to   ? { lte: new Date(date_to + "T23:59:59.999Z") } : {}),
            },
          }
        : {}),
    },
    orderBy: { opened_at: "desc" },
    take: safeLimit,
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
      created_at:           true,
      updated_at:           true,
      cash_register: {
        select: { code: true, name: true },
      },
      opened_by_user: {
        select: { first_name: true, last_name: true },
      },
      closed_by_user: {
        select: { first_name: true, last_name: true },
      },
      _count: {
        select: { cash_movements: true },
      },
    },
  });

  const items: CashSessionHistoryItem[] = sessions.map((s) => {
    const diff = s.difference_amount != null ? Number(s.difference_amount) : null;
    const cutStatus = deriveCashCutStatus(
      s.status as "OPEN" | "CLOSED" | "CANCELLED",
      diff,
    );

    return {
      id:                   s.id,
      tenant_id:            s.tenant_id,
      location_id:          s.location_id,
      cash_register_id:     s.cash_register_id,
      cash_register_code:   s.cash_register.code,
      cash_register_name:   s.cash_register.name,
      opened_by:            s.opened_by,
      opened_by_name:       s.opened_by_user
        ? `${s.opened_by_user.first_name} ${s.opened_by_user.last_name}`
        : null,
      closed_by:            s.closed_by,
      closed_by_name:       s.closed_by_user
        ? `${s.closed_by_user.first_name} ${s.closed_by_user.last_name}`
        : null,
      opened_at:            s.opened_at,
      closed_at:            s.closed_at,
      opening_amount:       Number(s.opening_amount),
      expected_cash_amount: Number(s.expected_cash_amount),
      declared_cash_amount: s.declared_cash_amount != null
        ? Number(s.declared_cash_amount)
        : null,
      difference_amount:    diff,
      status:               s.status as "OPEN" | "CLOSED" | "CANCELLED",
      cut_status:           cutStatus,
      notes:                s.notes,
      movements_count:      s._count.cash_movements,
      created_at:           s.created_at,
      updated_at:           s.updated_at,
    };
  });

  if (only_differences) {
    return items.filter(
      (i) => i.cut_status === "CLOSED_OVER" || i.cut_status === "CLOSED_SHORT",
    );
  }

  return items;
}
