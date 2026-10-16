// ─────────────────────────────────────────────────────────────────
// commerce/cash — run-cash-register-admin.ts
//
// Flujo común de las server actions de administración de cajas
// (crear / editar / activar-desactivar). Server-only, sin "use server":
// solo lo importan las actions delgadas de este módulo.
//
//   1. requireAdmin() — administración de cajas NO se abre a reception
//      (canOperateCommerce no basta); además rol LIVE canAdministerCommerce.
//   2. requireOperationalContext(module "commerce.cash", write=true):
//      Support Session read-only bloqueada, RUNTIME_CLIENT fail closed,
//      módulo comercial exigido y commercialContext resuelto.
//   3. tenant = context.tenantId; location efectiva resuelta en servidor
//      (mismo criterio que openCashSessionAction). Nada del browser.
//   4. DB = context.client.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient, UserRole } from "@prisma/client";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { canAdministerCommerce, COMMERCE_ACCESS_MESSAGES } from "@/core/permissions/commerce-access";
import { assertCommerceOperatorAccess } from "@/modules/commerce/shared/require-commerce-operator-context";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import type { CommercialEnforcementContext } from "@/modules/platform/runtime/commercial-enforcement/types";
import type { CashRegisterScope } from "../services/cash-register-admin.service";

if (typeof window !== "undefined") {
  throw new Error("[run-cash-register-admin] Módulo server-only.");
}

export interface CashRegisterAdminRuntime {
  scope:         CashRegisterScope;
  db:            PrismaClient;
  commercialCtx: CommercialEnforcementContext;
}

export async function runCashRegisterAdmin<T extends { ok: boolean }>(
  run: (rt: CashRegisterAdminRuntime) => Promise<T | { ok: false; error: string }>,
): Promise<T | { ok: false; error: string }> {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.cash", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    // Rol LIVE (RUNTIME_CLIENT): un admin degradado a reception pierde la
    // administración aunque su JWT aún diga branch_admin.
    if (!canAdministerCommerce(context.effectiveUser.role)) {
      return { ok: false, error: COMMERCE_ACCESS_MESSAGES.ROLE };
    }

    // branch_admin: su sucursal de sesión debe seguir siendo la asignada
    // (User.branch_id). No amplía permisos: solo puede denegar.
    const denied = await assertCommerceOperatorAccess({
      db: context.client,
      tenantId: context.tenantId,
      userId: context.effectiveUser.id,
      role: context.effectiveUser.role,
      locationId: context.locationId,
    });
    if (denied) return { ok: false, error: denied };

    // module pasado → commercialContext siempre resuelto; si no, fail closed.
    if (!context.commercialContext) {
      return { ok: false, error: "No se pudo verificar el plan comercial de la organización." };
    }

    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as UserRole } as SessionUser,
        context.client,
        context.tenantId,
      ));
    if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

    return await run({
      scope: { tenant_id: context.tenantId, location_id, user_id: context.effectiveUser.id },
      db: context.client,
      commercialCtx: context.commercialContext,
    });
  } finally {
    await dispose();
  }
}
