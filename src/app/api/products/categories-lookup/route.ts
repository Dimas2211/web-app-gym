export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/products/categories-lookup
// Devuelve categorías activas del tenant para selects del cliente.
// Usado por el modal de creación de producto desde línea DTE.
// ─────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { getCategoriesLookup } from "@/modules/commerce/products/queries/lookups/get-categories-lookup";

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

  // FASE VI-D6: ProductCategory es dato tenant-owned (tiene tenant_id) —
  // debe resolverse contra la DB efectiva (perfil runtime "Operar como
  // cliente" o identidad RUNTIME_CLIENT propia), nunca contra Prisma
  // global con el tenant_id de JWT sin revalidar.
  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: user.tenant_id }, user);
  try {
    const categories = await getCategoriesLookup(context.tenantId, context.client);
    return NextResponse.json(categories);
  } finally {
    await dispose();
  }
}
