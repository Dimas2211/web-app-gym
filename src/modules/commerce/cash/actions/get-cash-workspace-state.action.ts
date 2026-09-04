"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — get-cash-workspace-state.action.ts
//
// Carga en una sola llamada la lista de cajas activas de la location
// efectiva y, si se indica, el detalle y sesión de la caja seleccionada.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin }            from "@/lib/permissions/guards";
import { getEffectiveLocationId }  from "@/lib/location/active-location";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { getCashWorkspaceStateInputSchema } from "../schemas/cash.schemas";
import { getCashWorkspaceState }   from "../services/cash-read.service";
import type { CashWorkspaceState } from "../types/cash.types";
import type { GetCashWorkspaceStateInput } from "../schemas/cash.schemas";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type GetCashWorkspaceStateResult =
  | { ok: true;  data: CashWorkspaceState }
  | { ok: false; error: string };

export async function getCashWorkspaceStateAction(
  input: GetCashWorkspaceStateInput = {},
): Promise<GetCashWorkspaceStateResult> {
  const sessionUser = await requireAdmin();

  const { context, dispose } = await resolveEffectiveTenantContext(sessionUser);
  const { tenantId: tenant_id, client } = context;

  try {
    const location_id = context.runtime
      ? await resolveRuntimeFirstLocationId(context)
      : await getEffectiveLocationId(sessionUser);

    if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
    if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

    try {
      const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
      assertOrganizationModule(commercialCtx, "commerce.cash");
    } catch (err) {
      if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
      throw err;
    }

    const parsed = getCashWorkspaceStateInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Parámetros de consulta no válidos." };
    }

    const data = await getCashWorkspaceState(
      tenant_id,
      location_id,
      parsed.data.selected_cash_register_id,
      client,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo cargar el estado de caja." };
  } finally {
    await dispose();
  }
}
