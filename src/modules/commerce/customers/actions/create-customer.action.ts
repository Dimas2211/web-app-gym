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
import type { UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { createCustomerSchema } from "../schemas/customer.schemas";
import { createCustomer } from "../services/customer.service";
import type { CreateCustomerInput } from "../schemas/customer.schemas";

export type CreateCustomerActionResult =
  | { ok: true; id: string; customer_code: string }
  | { ok: false; error: string; field?: string; errors?: Record<string, string[]> };

export async function createCustomerAction(
  input: CreateCustomerInput,
): Promise<CreateCustomerActionResult> {
  // requireAdmin(): gate de sesión/rol inicial sin cambios para PLATFORM.
  const sessionUser = await requireAdmin();

  // FASE VI-D2 — ETAPA A/B: resolver contexto operacional (runtime DB,
  // readOnly, módulo) y AUTORIZAR con el ROL LIVE (context.effectiveUser.role)
  // — para RUNTIME_CLIENT nunca el rol del JWT de requireAdmin() arriba,
  // que puede tener hasta 8h de antigüedad.
  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "core.customers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
      return { ok: false, error: "Sin permisos para esta operación." };
    }

    const parsed = createCustomerSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok:     false,
        error:  "Datos de cliente no válidos.",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const result = await createCustomer(context.tenantId, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      return result.field
        ? { ok: false, field: result.field, error: result.error }
        : { ok: false, error: result.error };
    }

    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/sales/new");

    return { ok: true, id: result.id, customer_code: result.customer_code };
  } finally {
    await dispose();
  }
}
