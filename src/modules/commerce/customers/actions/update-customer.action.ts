"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — update-customer.action.ts
//
// Actualiza datos de un cliente existente.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id se inyecta desde sesión — nunca del input.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { updateCustomerSchema } from "../schemas/customer.schemas";
import { updateCustomer } from "../services/customer.service";
import type { UpdateCustomerInput } from "../schemas/customer.schemas";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type UpdateCustomerActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function updateCustomerAction(
  customer_id: string,
  input:        UpdateCustomerInput,
): Promise<UpdateCustomerActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;

  if (!tenant_id) {
    return { ok: false, error: "La sesión no tiene un tenant activo." };
  }

  if (!customer_id?.trim()) {
    return { ok: false, error: "El ID del cliente es requerido." };
  }

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return { ok: false, error: RUNTIME_READONLY_MESSAGE };
  }

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "core.customers");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok:     false,
      error:  "Datos de cliente no válidos.",
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await updateCustomer(customer_id, tenant_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { ok: false, field: result.field, error: result.error }
      : { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${customer_id}`);

  return { ok: true };
}
