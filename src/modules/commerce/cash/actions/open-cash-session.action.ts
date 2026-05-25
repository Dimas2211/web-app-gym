"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — open-cash-session.action.ts
//
// Abre una sesión de caja (CashSession) en estado OPEN para la
// CashRegister indicada dentro del tenant/location efectivos.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id, location_id y opened_by vienen de la sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { openCashSessionInputSchema } from "../schemas/cash.schemas";
import { openCashSession }           from "../services/cash-session.service";
import type { OpenCashSessionInput } from "../schemas/cash.schemas";
import type { CashOpenSessionInfo }  from "../types/cash.types";

export type OpenCashSessionActionResult =
  | { ok: true;  data: CashOpenSessionInfo }
  | { ok: false; error: string };

export async function openCashSessionAction(
  input: OpenCashSessionInput,
): Promise<OpenCashSessionActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  const parsed = openCashSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos para apertura de caja." };
  }

  const result = await openCashSession({
    tenant_id,
    location_id,
    cash_register_id: parsed.data.cash_register_id,
    opened_by:        sessionUser.id,
    opening_amount:   parsed.data.opening_amount,
    notes:            parsed.data.notes,
  });

  return result;
}
