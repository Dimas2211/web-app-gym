export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/catalogs/identification-types
//
// Catálogo CAT-022 — tipos de identificación DTE El Salvador.
// Datos de sistema, sin tenant_id. Sin filtros — el catálogo es
// pequeño (≤10 registros activos) y se carga completo.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getIdentificationTypes } from "@/modules/commerce/suppliers/queries/get-identification-types";

const ADMIN_ROLES = ["super_admin", "branch_admin"];

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const items = await getIdentificationTypes();
  return NextResponse.json({ items });
}
