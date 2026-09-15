"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — close-cash-session.action.ts
//
// Cierra una CashSession actualmente OPEN dentro del tenant/location
// efectivos del usuario autenticado.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id, location_id, closed_by, closed_at y status vienen del
// servidor — nunca del input del cliente.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";
import { getEffectiveLocationId }  from "@/lib/location/active-location";
import { closeCashSessionInputSchema } from "../schemas/cash.schemas";
import { closeCashSession }            from "../services/cash-session.service";
import type { CloseCashSessionInput }  from "../schemas/cash.schemas";
import type { CashOpenSessionInfo }    from "../types/cash.types";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type CloseCashSessionActionResult =
  | { ok: true;  data: CashOpenSessionInfo }
  | { ok: false; error: string };

export async function closeCashSessionAction(
  input: CloseCashSessionInput,
): Promise<CloseCashSessionActionResult> {
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

    const parsed = closeCashSessionInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos para cierre de caja." };
    }

    const result = await closeCashSession(
      {
        tenant_id,
        location_id,
        cash_session_id:      parsed.data.cash_session_id,
        closed_by:            context.effectiveUser.id,
        declared_cash_amount: parsed.data.declared_cash_amount,
        notes:                parsed.data.notes,
      },
      context.client,
    );

    return result;
  } finally {
    await dispose();
  }
}
