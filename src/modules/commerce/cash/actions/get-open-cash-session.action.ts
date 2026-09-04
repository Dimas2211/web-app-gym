"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — get-open-cash-session.action.ts
//
// Devuelve la sesión OPEN de una caja dada, o null si no existe.
// El scope tenant/location se valida en el service — nunca confiar
// solo en el cash_register_id recibido del cliente.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getOpenCashSessionInputSchema } from "../schemas/cash.schemas";
import { getOpenSessionForRegister }     from "../services/cash-read.service";
import type { CashOpenSessionInfo }      from "../types/cash.types";
import type { GetOpenCashSessionInput }  from "../schemas/cash.schemas";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type GetOpenCashSessionResult =
  | { ok: true;  data: CashOpenSessionInfo | null }
  | { ok: false; error: string };

export async function getOpenCashSessionAction(
  input: GetOpenCashSessionInput,
): Promise<GetOpenCashSessionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.cash");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const parsed = getOpenCashSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "cash_register_id no es un UUID válido." };
  }

  try {
    const data = await getOpenSessionForRegister(
      parsed.data.cash_register_id,
      tenant_id,
      location_id,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo cargar la sesión abierta." };
  }
}
