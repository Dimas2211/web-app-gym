export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/products/units-lookup
// Devuelve unidades de medida activas de la DB runtime efectiva.
// Usado por el modal de creación de producto desde línea DTE.
// ─────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { getUnitsLookup } from "@/modules/commerce/products/queries/lookups/get-units-lookup";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  // FASE VI-D9: UnitOfMeasure se seed-ea por DB runtime (id = uuid, no
  // fijo entre bases) — Product.unit_id referencia UnitOfMeasure.id de
  // la MISMA DB física. Debe resolverse contra la DB efectiva (perfil
  // runtime "Operar como cliente" o identidad RUNTIME_CLIENT propia),
  // nunca contra Prisma global.
  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: user.tenant_id }, user);
  try {
    const units = await getUnitsLookup(context.client);
    return NextResponse.json(units);
  } finally {
    await dispose();
  }
}
