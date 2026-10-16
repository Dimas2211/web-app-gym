"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — list-cash-sessions.action.ts
//
// Lista el historial de sesiones de caja del tenant/location
// efectivos del usuario autenticado.
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
import { listCashSessionsInputSchema } from "../schemas/cash.schemas";
import { listCashSessions } from "../queries/list-cash-sessions";
import type { ListCashSessionsInput } from "../schemas/cash.schemas";
import type { CashSessionHistoryItem } from "../types/cash.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type ListCashSessionsActionResult =
  | { ok: true; data: CashSessionHistoryItem[] }
  | { ok: false; error: string };

export async function listCashSessionsAction(
  input: ListCashSessionsInput = {}
): Promise<ListCashSessionsActionResult> {
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

    const parsed = listCashSessionsInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Parámetros de consulta no válidos." };
    }

    const data = await listCashSessions(
      {
        tenant_id,
        location_id,
        cash_register_id: parsed.data.cash_register_id,
        status: parsed.data.status,
        date_from: parsed.data.date_from,
        date_to: parsed.data.date_to,
        only_differences: parsed.data.only_differences,
        limit: parsed.data.limit,
      },
      client
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo cargar el historial de sesiones de caja." };
  } finally {
    await dispose();
  }
}
