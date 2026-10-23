// ─────────────────────────────────────────────────────────────────
// platform/runtime — require-live-operational-context.ts
//
// LIVE-3. Envoltorio opcional de requireOperationalContext para entry
// points de ESCRITURA que deben resistir cambios de identidad posteriores
// al inicio de sesión. No modifica requireOperationalContext ni a sus
// demás consumidores.
//
// Por qué hace falta (contrato real de requireOperationalContext):
//   - PLATFORM_NATIVE: rol, tenant y sede salen del JWT (hasta 8 h); no se
//     consulta la base.
//   - RUNTIME_CLIENT: se revalidan usuario activo, tenant y rol LIVE, y que
//     la sede del JWT exista y esté activa, pero no que siga siendo la sede
//     asignada del usuario (users.branch_id).
//
// Separa dos conceptos:
//   A. IDENTIDAD VIGENTE (este módulo): el usuario existe en la base
//      efectiva de la operación, está activo, pertenece al tenant efectivo,
//      su rol vigente es el de la sesión y, para roles de sede
//      (branch_admin, reception), su sede vigente es la de la sesión y está
//      activa. Cualquier discrepancia → fail closed: iniciar sesión de nuevo.
//   B. AUTORIZACIÓN DE LA OPERACIÓN: sigue en cada acción (capacidades del
//      rol, módulo, sede y recurso). Con A garantizado, esas comprobaciones
//      —que usan context.effectiveUser.role / context.locationId— operan
//      sobre el rol y la sede vigentes también en PLATFORM_NATIVE.
//
// No amplía privilegios: solo puede rechazar. Support Session ya rechaza
// toda escritura en requireOperationalContext (readOnly).
//
// Ventana residual: la identidad se lee al inicio de la acción, sin lock;
// una revocación que confirme durante la misma petición no la detiene.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error("[require-live-operational-context] Módulo server-only.");
}

import type { SessionUser } from "@/lib/permissions/guards";
import {
  OperationalContextError,
  requireOperationalContext,
  type OperationalContext,
  type OperationalContextHandle,
  type RequireOperationalContextOptions,
} from "./require-operational-context";

export const LIVE_IDENTITY_CHANGED_MESSAGE = "Tu rol o tu sede cambiaron. Vuelve a iniciar sesión para continuar.";

/** Roles cuya autorización depende de la sede de la sesión. */
const BRANCH_SCOPED_ROLES: ReadonlySet<string> = new Set(["branch_admin", "reception"]);

/**
 * Identidad vigente (concepto A). Devuelve el mensaje de rechazo, o null si
 * la identidad de la sesión coincide con la de la base efectiva.
 */
export async function assertLiveIdentity(
  context: Pick<OperationalContext, "effectiveUser" | "tenantId" | "locationId" | "client" | "readOnly">
): Promise<string | null> {
  // Support Session: sin usuario propio en la base runtime; sus escrituras
  // ya las rechaza requireOperationalContext (readOnly).
  if (context.readOnly) return null;
  const live = await context.client.user.findUnique({
    where: { id: context.effectiveUser.id },
    select: { status: true, tenant_id: true, role: true, branch_id: true },
  });
  if (!live || live.status !== "active") return LIVE_IDENTITY_CHANGED_MESSAGE;
  if (live.tenant_id !== context.tenantId) return LIVE_IDENTITY_CHANGED_MESSAGE;
  if (live.role !== context.effectiveUser.role) return LIVE_IDENTITY_CHANGED_MESSAGE;
  if (BRANCH_SCOPED_ROLES.has(live.role)) {
    if (!context.locationId || live.branch_id !== context.locationId) return LIVE_IDENTITY_CHANGED_MESSAGE;
    const branch = await context.client.branch.findFirst({
      where: { id: context.locationId, tenant_id: context.tenantId, status: "active" },
      select: { id: true },
    });
    if (!branch) return LIVE_IDENTITY_CHANGED_MESSAGE;
  }
  return null;
}

/**
 * requireOperationalContext + identidad vigente. Ante discrepancia lanza
 * OperationalContextError("FORBIDDEN", 403), que los callers ya mapean a su
 * formato, y libera el contexto.
 */
export async function requireLiveOperationalContext(
  sessionUser: SessionUser,
  options: RequireOperationalContextOptions = {}
): Promise<OperationalContextHandle> {
  const handle = await requireOperationalContext(sessionUser, options);
  let denied: string | null;
  try {
    denied = await assertLiveIdentity(handle.context);
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
