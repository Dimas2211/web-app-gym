// ─────────────────────────────────────────────────────────────────
// commerce/inventory — resolve-inventory-read-context.ts
//
// Contexto de LECTURA de inventario para route handlers de consulta
// (movimientos por producto y su selector). Mismo criterio que
// GET /api/inventory/movements:
//   - requireOperationalContext(module "commerce.inventory") SIN write:
//     sesiones de soporte read-only y "Operar como cliente" pueden
//     consultar, nunca escribir.
//   - Roles de lectura: super_admin, branch_admin, reception.
//   - tenant efectivo + PrismaClient de la base operacional del cliente.
//   - location — mismo criterio que la página de Inventario:
//       Support Session ("Operar como cliente", read-only): primera
//       sucursal activa del tenant runtime (la cookie del super_admin
//       pertenece a SU tenant y nunca valida contra la DB del cliente);
//       resto: la del usuario (validada LIVE en RUNTIME_CLIENT) o, para
//       identidades tenant-wide, la cookie validada contra la DB efectiva.
//
// El caller DEBE invocar dispose() cuando ok === true.
// ─────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { resolveRuntimeFirstLocationId } from "@/modules/platform/runtime/effective-tenant-context";
import {
  requireOperationalContext,
  OperationalContextError,
  type OperationalContext,
} from "@/modules/platform/runtime/require-operational-context";

export const INVENTORY_VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];

export type InventoryReadContextResult =
  | {
      ok: true;
      context: OperationalContext;
      locationId: string;
      dispose: () => Promise<void>;
    }
  | { ok: false; response: NextResponse };

export async function resolveInventoryReadContext(): Promise<InventoryReadContextResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  const user = session.user as SessionUser;

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "commerce.inventory" });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return {
        ok: false,
        response: NextResponse.json({ error: err.userMessage }, { status: err.httpStatus }),
      };
    }
    throw err;
  }
  const { context, dispose } = handle;

  if (!INVENTORY_VIEWER_ROLES.includes(context.effectiveUser.role)) {
    await dispose();
    return { ok: false, response: NextResponse.json({ error: "Acceso denegado" }, { status: 403 }) };
  }

  const locationId =
    context.locationId ??
    (context.runtimeMode === "SUPPORT_RUNTIME"
      ? await resolveRuntimeFirstLocationId({ tenantId: context.tenantId, client: context.client })
      : await getEffectiveLocationId(
      { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
      context.client,
      context.tenantId,
    ));

  if (!locationId) {
    await dispose();
    return {
      ok: false,
      response: NextResponse.json(
        { error: "La sesión no tiene una sucursal activa. Seleccioná una sucursal." },
        { status: 400 },
      ),
    };
  }

  return { ok: true, context, locationId, dispose };
}
