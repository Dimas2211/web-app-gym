export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/catalogs/economic-activities
//
// Catálogo CAT-019 — actividades económicas MH El Salvador.
// Búsqueda por texto en nombre/código y filtro por sección.
//
// Query params:
//   search  — texto libre (nombre o código), opcional
//   section — sección/división exacta, opcional
//   limit   — máximo de resultados (default 100, max 300)
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEconomicActivities } from "@/modules/commerce/suppliers/queries/get-economic-activities";

const ADMIN_ROLES = ["super_admin", "branch_admin"];
const MAX_LIMIT   = 300;
const DEFAULT_LIMIT = 100;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;

  const search  = searchParams.get("search")?.trim()  || undefined;
  const section = searchParams.get("section")?.trim() || undefined;
  const limitRaw = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = !isNaN(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const items = await getEconomicActivities({ search, section, limit });
  return NextResponse.json({ items });
}
