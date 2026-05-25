"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — list-cash-registers.action.ts
//
// Lista las cajas de la location efectiva del usuario.
// Por defecto devuelve solo cajas activas.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }           from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { listCashRegistersActionSchema } from "../schemas/cash.schemas";
import { listCashRegisters }      from "../queries/list-cash-registers";
import type { CashRegisterListItem } from "../types/cash.types";
import type { ListCashRegistersActionInput } from "../schemas/cash.schemas";

export type ListCashRegistersResult =
  | { ok: true;  data: CashRegisterListItem[] }
  | { ok: false; error: string };

export async function listCashRegistersAction(
  input: ListCashRegistersActionInput = { include_inactive: false },
): Promise<ListCashRegistersResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  const parsed = listCashRegistersActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Parámetros de consulta no válidos." };
  }

  try {
    const data = await listCashRegisters(
      tenant_id,
      location_id,
      parsed.data.include_inactive,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo cargar la lista de cajas." };
  }
}
