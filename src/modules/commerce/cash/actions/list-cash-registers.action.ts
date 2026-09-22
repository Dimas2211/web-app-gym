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

import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import type { UserRole } from "@prisma/client";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { listCashRegistersActionSchema } from "../schemas/cash.schemas";
import { listCashRegisters } from "../queries/list-cash-registers";
import type { CashRegisterListItem } from "../types/cash.types";
import type { ListCashRegistersActionInput } from "../schemas/cash.schemas";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export type ListCashRegistersResult =
  | { ok: true; data: CashRegisterListItem[] }
  | { ok: false; error: string };

export async function listCashRegistersAction(
  input: ListCashRegistersActionInput = { include_inactive: false }
): Promise<ListCashRegistersResult> {
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

    const parsed = listCashRegistersActionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Parámetros de consulta no válidos." };
    }

    const data = await listCashRegisters(
      context.tenantId,
      location_id,
      parsed.data.include_inactive,
      context.client
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo cargar la lista de cajas." };
  } finally {
    await dispose();
  }
}
