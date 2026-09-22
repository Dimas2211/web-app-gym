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

import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getOpenCashSessionInputSchema } from "../schemas/cash.schemas";
import { getOpenSessionForRegister } from "../services/cash-read.service";
import type { CashOpenSessionInfo } from "../types/cash.types";
import type { GetOpenCashSessionInput } from "../schemas/cash.schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type GetOpenCashSessionResult =
  | { ok: true; data: CashOpenSessionInfo | null }
  | { ok: false; error: string };

export async function getOpenCashSessionAction(
  input: GetOpenCashSessionInput
): Promise<GetOpenCashSessionResult> {
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

    const parsed = getOpenCashSessionInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "cash_register_id no es un UUID válido." };
    }

    const data = await getOpenSessionForRegister(
      parsed.data.cash_register_id,
      context.tenantId,
      location_id,
      context.client
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo cargar la sesión abierta." };
  } finally {
    await dispose();
  }
}
