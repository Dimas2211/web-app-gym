// ─────────────────────────────────────────────────────────────────
// api/customers — customer-api-context.ts
//
// Contexto de autenticación para rutas de commerce/customers.
// Customer es tenant-level: no requiere location_id.
// ─────────────────────────────────────────────────────────────────

import { auth } from "@/lib/auth/auth";
import type { UserRole } from "@prisma/client";
import { getCapabilities } from "@/core/permissions/role-capabilities";

type CustomerApiContext =
  | { ok: true; user_id: string; tenant_id: string }
  | { ok: false; status: number; error: string };

export async function getCustomerApiContext(): Promise<CustomerApiContext> {
  const session = await auth();
  const user = session?.user;

  if (!user) {
    return { ok: false, status: 401, error: "No autorizado." };
  }

  const role = user.role as UserRole;
  if (!getCapabilities(role).canManageStaff) {
    return { ok: false, status: 403, error: "Sin permisos para esta operación." };
  }

  const tenant_id = user.tenant_id;
  if (!tenant_id) {
    return { ok: false, status: 401, error: "Sesión sin tenant activo." };
  }

  return { ok: true, user_id: user.id!, tenant_id };
}
