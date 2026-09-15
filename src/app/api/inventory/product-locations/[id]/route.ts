export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/inventory/product-locations/[id]
// Detalle completo de un ProductLocation para el panel lateral.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getProductLocationById } from "@/modules/commerce/inventory/queries/get-product-location-by-id";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as SessionUser;

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "commerce.inventory" });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!VIEWER_ROLES.includes(context.effectiveUser.role)) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const locationId =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
        context.client,
        context.tenantId,
      ));

    if (!locationId) {
      return NextResponse.json(
        { error: "La sesión no tiene tenant o location activos." },
        { status: 400 },
      );
    }

    const { id } = await params;

    const record = await getProductLocationById(id, context.tenantId, locationId, context.client);

    if (!record) {
      return NextResponse.json(
        { error: "Registro de inventario no encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json(record);
  } finally {
    await dispose();
  }
}
