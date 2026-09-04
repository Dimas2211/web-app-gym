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

import { requireAdmin }            from "@/lib/permissions/guards";
import { getEffectiveLocationId }  from "@/lib/location/active-location";
import { closeCashSessionInputSchema } from "../schemas/cash.schemas";
import { closeCashSession }            from "../services/cash-session.service";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import type { CloseCashSessionInput }  from "../schemas/cash.schemas";
import type { CashOpenSessionInfo }    from "../types/cash.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type CloseCashSessionActionResult =
  | { ok: true;  data: CashOpenSessionInfo }
  | { ok: false; error: string };

export async function closeCashSessionAction(
  input: CloseCashSessionInput,
): Promise<CloseCashSessionActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return { ok: false, error: RUNTIME_READONLY_MESSAGE };
  }

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.cash");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const parsed = closeCashSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos para cierre de caja." };
  }

  const result = await closeCashSession({
    tenant_id,
    location_id,
    cash_session_id:      parsed.data.cash_session_id,
    closed_by:            sessionUser.id,
    declared_cash_amount: parsed.data.declared_cash_amount,
    notes:                parsed.data.notes,
  });

  return result;
}
