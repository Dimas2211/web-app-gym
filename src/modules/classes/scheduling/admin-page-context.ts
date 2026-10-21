// ─────────────────────────────────────────────────────────────────
// GYM-BOOKINGS 3A — contexto de las páginas administrativas nuevas.
//
// requireAdmin (JWT) → requireOperationalContext(module) → alcance LIVE.
// El llamador DEBE invocar dispose() (finally). Las Server Actions
// revalidan todo de nuevo: esto solo decide qué se muestra.
// ─────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/permissions/guards";
import {
  requireOperationalContext,
  OperationalContextError,
  type OperationalContextHandle,
} from "@/modules/platform/runtime/require-operational-context";
import { gymAdminScope, type GymAdminScope } from "./admin-support";

export type GymAdminPageContext =
  | { ok: true; handle: OperationalContextHandle; scope: Extract<GymAdminScope, { ok: true }> }
  | { ok: false; error: string };

export async function openGymAdminPage(module: "gym.classes" | "gym.trainers"): Promise<GymAdminPageContext> {
  const sessionUser = await requireAdmin();
  let handle: OperationalContextHandle;
  try {
    handle = await requireOperationalContext(sessionUser, { module });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const scope = gymAdminScope(handle.context);
  if (!scope.ok) {
    await handle.dispose();
    return { ok: false, error: scope.error };
  }
  return { ok: true, handle, scope };
}
