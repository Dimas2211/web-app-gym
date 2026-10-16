"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — list-cash-movements.action.ts
//
// Lista los movimientos manuales de una CashSession dentro del
// tenant/location efectivos del usuario autenticado.
//
// Permiso: requireCommerceOperator + rol LIVE (super_admin | branch_admin | reception).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { requireCommerceOperator } from "@/lib/permissions/guards";
import { assertCommerceOperatorLive } from "@/modules/commerce/shared/require-commerce-operator-context";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { listCashMovementsInputSchema } from "../schemas/cash.schemas";
import { listCashMovementsBySession } from "../queries/list-cash-movements-by-session";
import type { ListCashMovementsInput } from "../schemas/cash.schemas";
import type { CashMovementItem } from "../types/cash.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type ListCashMovementsActionResult =
  | { ok: true; data: CashMovementItem[] }
  | { ok: false; error: string };

export async function listCashMovementsAction(
  input: ListCashMovementsInput
): Promise<ListCashMovementsActionResult> {
  const sessionUser = await requireCommerceOperator();

  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const { tenantId: tenant_id, client } = context;

  try {
    // Rol LIVE (RUNTIME_CLIENT) + sucursal fija vigente (User.branch_id) para roles no globales.
    const denied = await assertCommerceOperatorLive(context, sessionUser.id);
    if (denied) return { ok: false, error: denied };

    const location_id = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : (context.locationId ??
        (await getEffectiveLocationId(sessionUser, context.client, context.tenantId)));

    if (!tenant_id) return { ok: false, error: "La sesión no tiene un tenant activo." };
    if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

    try {
      const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
      assertOrganizationModule(commercialCtx, "commerce.cash");
    } catch (err) {
      if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
      throw err;
    }

    const parsed = listCashMovementsInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Parámetros de consulta no válidos." };
    }

    const data = await listCashMovementsBySession(
      {
        tenant_id,
        location_id,
        cash_session_id: parsed.data.cash_session_id,
      },
      client
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudieron cargar los movimientos de caja." };
  } finally {
    await dispose();
  }
}
