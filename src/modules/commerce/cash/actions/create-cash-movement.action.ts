"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — create-cash-movement.action.ts
//
// Registra un movimiento manual dentro de una CashSession OPEN.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id, location_id, cash_register_id, direction y performed_by
// se inyectan desde sesión — nunca del input del cliente.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { createCashMovementInputSchema } from "../schemas/cash.schemas";
import { recordCashMovement }           from "../services/cash-movement.service";
import type { CreateCashMovementInput } from "../schemas/cash.schemas";
import type { CashMovementCreateResult } from "../types/cash.types";

export type CreateCashMovementActionResult =
  | { ok: true;  data: CashMovementCreateResult }
  | { ok: false; error: string };

export async function createCashMovementAction(
  input: CreateCashMovementInput,
): Promise<CreateCashMovementActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  const parsed = createCashMovementInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos para movimiento de caja." };
  }

  const result = await recordCashMovement({
    tenant_id,
    location_id,
    cash_session_id: parsed.data.cash_session_id,
    movement_type:   parsed.data.movement_type,
    amount:          parsed.data.amount,
    reason:          parsed.data.reason,
    reference:       parsed.data.reference,
    notes:           parsed.data.notes,
    performed_by:    sessionUser.id,
  });

  return result;
}
