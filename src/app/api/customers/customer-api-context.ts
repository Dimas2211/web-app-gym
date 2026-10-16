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
import { assertCommerceOperatorAccess } from "@/modules/commerce/shared/require-commerce-operator-context";
import {
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";
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
interface CustomerApiContextOptions {
  /**
   * Opt-in SOLO para el lookup de clientes del flujo de Ventas
   * (/api/customers/search): autoriza operadores de Commerce (incl.
   * reception) con rol LIVE + sucursal fija, y exige ADEMÁS el módulo
   * commerce.sales habilitado (el lookup solo existe para vender). El
   * resto de rutas de customers (alta/edición/consulta) sigue exigiendo
   * core.customers + canManageStaff, sin cambios.
   */
  allowCommerceOperator?: boolean;
}

export async function getCustomerApiContext(
  options: CustomerApiContextOptions = {},
): Promise<CustomerApiContext> {
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

  // Modo lookup de Ventas: commerce.sales habilitado, además de
  // core.customers (ya exigido arriba). Reutiliza el contexto comercial
  // resuelto por requireOperationalContext — fail closed si falta.
  if (options.allowCommerceOperator) {
    try {
      if (!context.commercialContext) {
        throw new CommercialEnforcementError(
          "COMMERCIAL_CONTEXT_ERROR",
          "No se pudo verificar el plan comercial de la organización.",
        );
      }
      assertOrganizationModule(context.commercialContext, "commerce.sales");
    } catch (err) {
      await dispose();
      if (err instanceof CommercialEnforcementError) {
        return { ok: false, status: err.httpStatus, error: err.userMessage };
      }
      throw err;
    }
  }

  let allowed: boolean;
  try {
    allowed = options.allowCommerceOperator
      ? // Rol LIVE + sucursal fija vigente (User.branch_id) para no globales.
        (await assertCommerceOperatorAccess({
          db: context.client,
          tenantId: context.tenantId,
          userId: context.effectiveUser.id,
          role: context.effectiveUser.role,
          locationId: context.locationId,
        })) === null
      : getCapabilities(context.effectiveUser.role as UserRole).canManageStaff;
  } catch (err) {
    await dispose();
    throw err;
  }
  if (!allowed) {
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
