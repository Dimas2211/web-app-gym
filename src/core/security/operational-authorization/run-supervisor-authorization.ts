// ─────────────────────────────────────────────────────────────────
// core/security/operational-authorization — run-supervisor-authorization.ts
//
// Flujo común de las server actions "Autorizar con Clave de Supervisor"
// (Products, Commerce Customers, Purchases, Sales). Cada módulo expone
// su propia action delgada y delega aquí:
//
//   1. contexto operacional efectivo con write=true → Support Session
//      read-only NO puede obtener grants; RUNTIME_CLIENT fail closed;
//      enforcement del módulo comercial;
//   2. rol LIVE autorizado: canManageStaff por defecto (mismo nivel que
//      requireAdmin); un módulo puede pasar `isRoleAllowed` (ej. Sales:
//      canOperateCommerce) — la clave sigue siendo el control real;
//   3. la entidad existe en el tenant efectivo (y en estado editable);
//      módulos location-scoped validan además la sucursal efectiva (scope);
//   4. Clave de Supervisor contra context.client → grant temporal.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient, UserRole } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { authorizeWithSupervisorPin } from "./operational-authorization";
import { OPERATIONAL_AUTH_MESSAGES, type SupervisorAuthActionState } from "./messages";
import { isValidGrantEntityId } from "./grant-token";
import type { PinGrantScope } from "./scopes";

/**
 * Alcance efectivo con el que se valida la entidad. Resuelto en servidor
 * desde el contexto operacional — nunca del navegador. Aditivo: los
 * consumidores que no lo necesitan (Products/Customers/Purchases) lo
 * ignoran y conservan su validación tenant-level.
 */
export interface SupervisorEntityScope {
  /** location_id efectivo FIJO de la identidad (null para identidad global sin sucursal fija). */
  locationId: string | null;
  /** Rol LIVE (context.effectiveUser.role). */
  effectiveRole: string;
}

export interface RunSupervisorAuthorizationInput {
  scope: PinGrantScope;
  /** Module code exigido (ej. "commerce.sales"). */
  module: string;
  entityId: string | null | undefined;
  pin: string;
  /**
   * Valida que la entidad exista en el tenant efectivo y admita la
   * operación. Devuelve mensaje de error o null si es válida.
   * `scope` permite a módulos location-scoped (Sales) exigir además la
   * sucursal efectiva ANTES de emitir el grant.
   */
  assertEntity: (
    db: PrismaClient,
    tenantId: string,
    entityId: string,
    scope: SupervisorEntityScope,
  ) => Promise<string | null>;
  /**
   * Predicado sobre el rol LIVE (context.effectiveUser.role) que puede
   * SOLICITAR la autorización. Omitido → canManageStaff (comportamiento
   * histórico de Products/Customers/Purchases sin cambios).
   */
  isRoleAllowed?: (role: string) => boolean;
}

export async function runSupervisorAuthorization(
  sessionUser: SessionUser,
  input: RunSupervisorAuthorizationInput,
): Promise<SupervisorAuthActionState> {
  if (!isValidGrantEntityId(input.entityId)) {
    return { ok: false, error: OPERATIONAL_AUTH_MESSAGES.GRANT_MISSING };
  }
  const entityId = input.entityId;

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: input.module, write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const isRoleAllowed =
      input.isRoleAllowed ??
      ((role: string) => getCapabilities(role as UserRole).canManageStaff);
    if (!isRoleAllowed(context.effectiveUser.role)) {
      return { ok: false, error: OPERATIONAL_AUTH_MESSAGES.GRANT_MISSING };
    }

    const entityError = await input.assertEntity(context.client, context.tenantId, entityId, {
      locationId: context.locationId,
      effectiveRole: context.effectiveUser.role,
    });
    if (entityError) return { ok: false, error: entityError };

    return await authorizeWithSupervisorPin(context, input.scope, entityId, input.pin);
  } finally {
    await dispose();
  }
}

/** Lee la clave del FormData (campo estándar `supervisor_pin`). Nunca se registra. */
export function readSupervisorPin(formData: FormData): string {
  const raw = formData.get("supervisor_pin");
  return typeof raw === "string" ? raw : "";
}
