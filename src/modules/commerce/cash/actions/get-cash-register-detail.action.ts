"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — get-cash-register-detail.action.ts
//
// Devuelve el detalle de una caja, incluyendo la sesión OPEN si existe.
// El scope tenant/location se valida en el service — nunca confiar
// solo en el cash_register_id recibido del cliente.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getCashRegisterInputSchema } from "../schemas/cash.schemas";
import { ensureCashRegisterInScope }  from "../services/cash-read.service";
import type { CashRegisterDetail }    from "../types/cash.types";
import type { GetCashRegisterInput }  from "../schemas/cash.schemas";

export type GetCashRegisterDetailResult =
  | { ok: true;  data: CashRegisterDetail }
  | { ok: false; error: string };

export async function getCashRegisterDetailAction(
  input: GetCashRegisterInput,
): Promise<GetCashRegisterDetailResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  const parsed = getCashRegisterInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "cash_register_id no es un UUID válido." };
  }

  try {
    const data = await ensureCashRegisterInScope(
      parsed.data.cash_register_id,
      tenant_id,
      location_id,
    );

    if (!data) {
      return { ok: false, error: "Caja no encontrada o fuera de scope." };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo cargar la caja seleccionada." };
  }
}
