export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/catalogs/municipalities
//
// Catálogo CAT-013 — municipios de El Salvador.
// Búsqueda por texto en nombre/departamento y filtro por dept_code.
//
// Query params:
//   search    — texto libre (nombre de municipio o departamento), opcional
//   dept_code — código de departamento para carga cascada, opcional
//   limit     — máximo de resultados (default 100, max 300)
//
// Uso cascada: cuando dept_code está presente y search está vacío,
// devuelve todos los municipios del departamento (≤32 registros).
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getMunicipalities } from "@/modules/commerce/suppliers/queries/get-municipalities";

const ADMIN_ROLES   = ["super_admin", "branch_admin"];
const MAX_LIMIT     = 300;
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

  const search    = searchParams.get("search")?.trim()    || undefined;
  const dept_code = searchParams.get("dept_code")?.trim() || undefined;
  const limitRaw  = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = !isNaN(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const items = await getMunicipalities({ search, dept_code, limit });
  return NextResponse.json({ items });
}
