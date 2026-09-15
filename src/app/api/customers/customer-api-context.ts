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

import type { PrismaClient, UserRole } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

type CustomerApiContext =
  | {
      ok:         true;
      user_id:    string;
      tenant_id:  string;
      client:     PrismaClient;
      /** true si la operación debe tratarse como solo-lectura (Support Session). */
      readOnly:   boolean;
      dispose:    () => Promise<void>;
    }
  | { ok: false; status: number; error: string };

/**
 * FASE VI-D2 — ETAPA E: runtime-aware vía requireOperationalContext.
 * La autorización por capability usa el ROL LIVE (context.effectiveUser.role)
 * para RUNTIME_CLIENT — nunca `session.user.role` (JWT, hasta 8h stale).
 */
export async function getCustomerApiContext(): Promise<CustomerApiContext> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;

  if (!user) {
    return { ok: false, status: 401, error: "No autorizado." };
  }

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "core.customers" });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return { ok: false, status: err.httpStatus, error: err.userMessage };
    }
    throw err;
  }

  const { context, dispose } = handle;

  if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
    await dispose();
    return { ok: false, status: 403, error: "Sin permisos para esta operación." };
  }

  return {
    ok:        true,
    user_id:   context.effectiveUser.id,
    tenant_id: context.tenantId,
    client:    context.client,
    readOnly:  context.readOnly,
    dispose,
  };
}
