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

import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getCashRegisterInputSchema } from "../schemas/cash.schemas";
import { ensureCashRegisterInScope } from "../services/cash-read.service";
import type { CashRegisterDetail } from "../types/cash.types";
import type { GetCashRegisterInput } from "../schemas/cash.schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type GetCashRegisterDetailResult =
  | { ok: true; data: CashRegisterDetail }
  | { ok: false; error: string };

export async function getCashRegisterDetailAction(
  input: GetCashRegisterInput
): Promise<GetCashRegisterDetailResult> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.cash" });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as UserRole } as SessionUser,
        context.client,
        context.tenantId
      ));

    if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

    const parsed = getCashRegisterInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "cash_register_id no es un UUID válido." };
    }

    const data = await ensureCashRegisterInScope(
      parsed.data.cash_register_id,
      context.tenantId,
      location_id,
      context.client
    );

    if (!data) {
      return { ok: false, error: "Caja no encontrada o fuera de scope." };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo cargar la caja seleccionada." };
  } finally {
    await dispose();
  }
}
