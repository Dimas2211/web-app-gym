"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — get-cash-workspace-state.action.ts
//
// Carga en una sola llamada la lista de cajas (activas e inactivas) de la location
// efectiva y, si se indica, el detalle y sesión de la caja seleccionada.
//
// Permiso: requireCommerceOperator + rol LIVE (super_admin | branch_admin | reception).
// tenant_id y location_id se inyectan desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { requireCommerceOperator } from "@/lib/permissions/guards";
import { canAdministerCommerce } from "@/core/permissions/commerce-access";
import { assertCommerceOperatorLive } from "@/modules/commerce/shared/require-commerce-operator-context";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  resolveEffectiveTenantContext,
  resolveRuntimeFirstLocationId,
} from "@/modules/platform/runtime/effective-tenant-context";
import { getCashWorkspaceStateInputSchema } from "../schemas/cash.schemas";
import { getCashWorkspaceState } from "../services/cash-read.service";
import type { CashWorkspaceState } from "../types/cash.types";
import type { GetCashWorkspaceStateInput } from "../schemas/cash.schemas";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

/**
 * Permisos efectivos (rol LIVE) para la UI de caja. Solo ocultan
 * controles — las actions administrativas revalidan en servidor.
 */
export interface CashWorkspacePermissions {
  /** Crear / editar / activar-desactivar cajas registradoras. */
  canAdministerRegisters: boolean;
}

export type GetCashWorkspaceStateResult =
  | { ok: true; data: CashWorkspaceState; permissions: CashWorkspacePermissions }
  | { ok: false; error: string };

export async function getCashWorkspaceStateAction(
  input: GetCashWorkspaceStateInput = {}
): Promise<GetCashWorkspaceStateResult> {
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

    const parsed = getCashWorkspaceStateInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Parámetros de consulta no válidos." };
    }

    const data = await getCashWorkspaceState(
      tenant_id,
      location_id,
      parsed.data.selected_cash_register_id,
      client
    );
    return {
      ok: true,
      data,
      permissions: { canAdministerRegisters: canAdministerCommerce(context.effectiveRole) },
    };
  } catch {
    return { ok: false, error: "No se pudo cargar el estado de caja." };
  } finally {
    await dispose();
  }
}
