"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — create-customer.action.ts
//
// Crea un cliente nuevo en el maestro tenant-level.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id se inyecta desde sesión — nunca del input.
// Customer es tenant-level: no requiere location_id.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions/guards";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { createCustomerSchema } from "../schemas/customer.schemas";
import { createCustomer } from "../services/customer.service";
import type { CreateCustomerInput } from "../schemas/customer.schemas";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export type CreateCustomerActionResult =
  | { ok: true; id: string; customer_code: string }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function createCustomerAction(
  input: CreateCustomerInput,
): Promise<CreateCustomerActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;

  if (!tenant_id) {
    return { ok: false, error: "La sesión no tiene un tenant activo." };
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

  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok:     false,
      error:  "Datos de cliente no válidos.",
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await createCustomer(tenant_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return result.field
      ? { ok: false, field: result.field, error: result.error }
      : { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/sales/new");

  return { ok: true, id: result.id, customer_code: result.customer_code };
}
