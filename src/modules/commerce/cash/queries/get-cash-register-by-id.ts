// ─────────────────────────────────────────────────────────────────
// commerce/cash — get-cash-register-by-id.ts
//
// Detalle de una caja validando scope tenant/location.
// Usa findFirst con los tres campos para asegurar el scope en la
// misma query, siguiendo el patrón de purchases y sales.
// Solo lectura — no muta estado.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CashRegisterDetail, CashOpenSessionInfo } from "../types/cash.types";

export async function getCashRegisterById(
  id:          string,
  tenant_id:   string,
  location_id: string,
): Promise<CashRegisterDetail | null> {
  const row = await prisma.cashRegister.findFirst({
    where: { id, tenant_id, location_id },
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

  if (!row) return null;

  const raw = row.sessions[0] ?? null;

  const open_session: CashOpenSessionInfo | null = raw
    ? {
        id:               raw.id,
        cash_register_id: raw.cash_register_id,
        opened_by:        raw.opened_by,
        opened_by_name:   raw.opened_by_user
          ? `${raw.opened_by_user.first_name} ${raw.opened_by_user.last_name}`
          : null,
        opened_at:            raw.opened_at,
        opening_amount:       Number(raw.opening_amount),
        expected_cash_amount: Number(raw.expected_cash_amount),
        declared_cash_amount: raw.declared_cash_amount
          ? Number(raw.declared_cash_amount)
          : null,
        difference_amount: raw.difference_amount
          ? Number(raw.difference_amount)
          : null,
        status: raw.status as CashOpenSessionInfo["status"],
        notes:  raw.notes,
      }
    : null;

  return {
    id:          row.id,
    tenant_id:   row.tenant_id,
    location_id: row.location_id,
    code:        row.code,
    name:        row.name,
    is_active:   row.is_active,
    created_at:  row.created_at,
    updated_at:  row.updated_at,
    open_session,
  };
}
