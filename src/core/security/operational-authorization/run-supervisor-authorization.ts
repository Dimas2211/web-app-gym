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
//   2. rol LIVE con canManageStaff (mismo nivel que requireAdmin);
//   3. la entidad existe en el tenant efectivo (y en estado editable);
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

export interface RunSupervisorAuthorizationInput {
  scope: PinGrantScope;
  /** Module code exigido (ej. "commerce.sales"). */
  module: string;
  entityId: string | null | undefined;
  pin: string;
  /**
   * Valida que la entidad exista en el tenant efectivo y admita la
   * operación. Devuelve mensaje de error o null si es válida.
   */
  assertEntity: (db: PrismaClient, tenantId: string, entityId: string) => Promise<string | null>;
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
    if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
      return { ok: false, error: OPERATIONAL_AUTH_MESSAGES.GRANT_MISSING };
    }

    const entityError = await input.assertEntity(context.client, context.tenantId, entityId);
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
