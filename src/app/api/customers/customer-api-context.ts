// ─────────────────────────────────────────────────────────────────
// api/customers — customer-api-context.ts
//
// Contexto de autenticación para rutas de commerce/customers.
// Customer es tenant-level: no requiere location_id.
//
// PASO 6A (corrección de alcance): además de autenticar, resuelve el
// tenant_id/PrismaClient EFECTIVO — el del perfil runtime "Operar como
// cliente" si hay una sesión activa, o el del tenant normal del
// usuario en caso contrario. Todo route handler que use este contexto
// queda runtime-aware automáticamente sin resolverlo a mano.
//
// El caller SIEMPRE debe llamar `ctx.dispose()` (ideal: try/finally)
// para cerrar el PrismaClient runtime si se abrió uno.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import type { UserRole } from "@prisma/client";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  resolveEffectiveApiContext,
  type RuntimeSessionPayload,
} from "@/modules/platform/runtime/effective-tenant-context";

type CustomerApiContext =
  | {
      ok:         true;
      user_id:    string;
      tenant_id:  string;
      client:     PrismaClient;
      runtime:    RuntimeSessionPayload | null;
      dispose:    () => Promise<void>;
    }
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

  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: tenant_id });

  return {
    ok:        true,
    user_id:   user.id!,
    tenant_id: context.tenantId,
    client:    context.client,
    runtime:   context.runtime,
    dispose,
  };
}
