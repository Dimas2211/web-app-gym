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

import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { createCashMovementInputSchema } from "../schemas/cash.schemas";
import { recordCashMovement }           from "../services/cash-movement.service";
import type { CreateCashMovementInput } from "../schemas/cash.schemas";
import type { CashMovementCreateResult } from "../types/cash.types";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type CreateCashMovementActionResult =
  | { ok: true;  data: CashMovementCreateResult }
  | { ok: false; error: string };

export async function createCashMovementAction(
  input: CreateCashMovementInput,
): Promise<CreateCashMovementActionResult> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.cash", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const tenant_id = context.tenantId;
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as UserRole } as SessionUser,
        context.client,
        context.tenantId,
      ));

    if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

    const parsed = createCashMovementInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos para movimiento de caja." };
    }

    const result = await recordCashMovement(
      {
        tenant_id,
        location_id,
        cash_session_id: parsed.data.cash_session_id,
        movement_type:   parsed.data.movement_type,
        amount:          parsed.data.amount,
        reason:          parsed.data.reason,
        reference:       parsed.data.reference,
        notes:           parsed.data.notes,
        performed_by:    context.effectiveUser.id,
      },
      context.client,
    );

    return result;
  } finally {
    await dispose();
  }
}
