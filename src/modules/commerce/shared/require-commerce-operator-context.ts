// ─────────────────────────────────────────────────────────────────
// commerce/shared — require-commerce-operator-context.ts
//
// Contexto operacional para entry points de OPERACIÓN de Commerce
// (ventas, caja). Envuelve requireOperationalContext — que ya resuelve
// DB runtime, tenant/location efectivos, Support Session READ_ONLY,
// fail closed RUNTIME_CLIENT y módulo comercial — y añade:
//
//   - rol LIVE (context.effectiveUser.role) con canOperateCommerce;
//   - sucursal fija obligatoria para roles no globales (reception,
//     branch_admin): nunca se resuelve por cookie de location activa.
//
// Las operaciones ADMINISTRATIVAS (crear/editar/desactivar caja,
// exportaciones, DTE) NO usan este helper: siguen con requireAdmin() +
// chequeo LIVE de canAdministerCommerce.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error("[require-commerce-operator-context] Módulo server-only.");
}

import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import {
  COMMERCE_ACCESS_MESSAGES,
  evaluateCommerceOperatorAccess,
} from "@/core/permissions/commerce-access";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
  type OperationalContextHandle,
  type RequireOperationalContextOptions,
} from "@/modules/platform/runtime/require-operational-context";

export interface CommerceOperatorIdentity {
  /** DB EFECTIVA del tenant (runtime propio, o Prisma de la instancia en PLATFORM_NATIVE). */
  db: PrismaClient;
  tenantId: string;
  userId: string;
  /** Rol LIVE (context.effectiveUser.role / context.effectiveRole). */
  role: string;
  /** location_id efectivo FIJO de la sesión (context.locationId). */
  locationId: string | null;
}

/**
 * Frontera ÚNICA de autorización operativa de Commerce (ventas, caja).
 * Devuelve el mensaje de denegación, o null si puede operar.
 *
 *   1. Política pura: rol LIVE con canOperateCommerce y sucursal fija
 *      para roles no globales (evaluateCommerceOperatorAccess).
 *   2. Roles no globales: la sucursal de la sesión (JWT, hasta 8h de
 *      antigüedad) DEBE seguir siendo la asignación ACTUAL del usuario
 *      (User.branch_id) en la DB efectiva y dentro del tenant efectivo.
 *      requireRuntimeOrganizationContext solo valida que esa sucursal
 *      exista y esté activa, no que siga asignada. Si el usuario fue
 *      reasignado, se deniega: debe iniciar una sesión nueva. Nunca se
 *      resuelve una sucursal alternativa por cookie.
 *
 * Globales (super_admin, incl. Support Session) no consultan DB: su
 * sucursal es la selección activa validada por cada entry point.
 */
export async function assertCommerceOperatorAccess(
  identity: CommerceOperatorIdentity,
): Promise<string | null> {
  const decision = evaluateCommerceOperatorAccess({
    role: identity.role,
    locationId: identity.locationId,
  });
  if (!decision.ok) return decision.message;
  if (getCapabilities(identity.role).isGlobal) return null;

  const assigned = await identity.db.user.findFirst({
    where: { id: identity.userId, tenant_id: identity.tenantId },
    select: { branch_id: true },
  });
  if (!assigned?.branch_id) return COMMERCE_ACCESS_MESSAGES.LOCATION_REQUIRED;
  if (assigned.branch_id !== identity.locationId) return COMMERCE_ACCESS_MESSAGES.BRANCH_REASSIGNED;
  return null;
}

/**
 * Igual que requireOperationalContext, pero además exige que la
 * identidad EFECTIVA pueda operar Commerce (assertCommerceOperatorAccess).
 * Lanza OperationalContextError ("FORBIDDEN", 403) si no — los callers
 * ya mapean ese error a su formato.
 */
export async function requireCommerceOperatorContext(
  sessionUser: SessionUser,
  options: RequireOperationalContextOptions & { module: "commerce.sales" | "commerce.cash" },
): Promise<OperationalContextHandle> {
  const handle = await requireOperationalContext(sessionUser, options);
  let denied: string | null;
  try {
    denied = await assertCommerceOperatorAccess({
      db: handle.context.client,
      tenantId: handle.context.tenantId,
      userId: handle.context.effectiveUser.id,
      role: handle.context.effectiveUser.role,
      locationId: handle.context.locationId,
    });
  } catch (err) {
    await handle.dispose();
    throw err;
  }
  if (denied) {
    await handle.dispose();
    throw new OperationalContextError("FORBIDDEN", denied, 403);
  }
  return handle;
}

/**
 * Variante para entry points que resuelven su contexto con
 * resolveEffectiveTenantContext (lecturas de página/caja). Devuelve el
 * mensaje de denegación, o null si puede operar. `context.client`
 * ausente = PLATFORM_NATIVE → DB de la instancia (mismo criterio que
 * requireOperationalContext).
 */
export async function assertCommerceOperatorLive(
  context: {
    effectiveRole: string;
    locationId: string | null;
    tenantId: string;
    client?: PrismaClient;
  },
  userId: string,
): Promise<string | null> {
  return assertCommerceOperatorAccess({
    db: context.client ?? prisma,
    tenantId: context.tenantId,
    userId,
    role: context.effectiveRole,
    locationId: context.locationId,
  });
}
