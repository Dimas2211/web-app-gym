// ─────────────────────────────────────────────────────────────────
// api/dte/catalogs/route.ts
//
// GET /api/dte/catalogs?catalog_code=CAT-016
//
// Devuelve los ítems activos de un catálogo DTE de sistema.
// Los catálogos son globales (no tenant/location scoped).
// catalog_code es requerido para evitar payloads grandes.
//
// MH20 (Fase 5.1A): spec_profile opcional (MH_1_2 | MH_2_0). Omitido →
// MH_1_2 (filas version "1"). MH_2_0 solo se acepta con el interruptor
// global DTE_MH20_PROFILE_ENABLED encendido; apagado → 409.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { listDteCatalogItems } from "@/modules/commerce/dte/queries/list-dte-catalog-items";
import { isDteMh20ProfileEnabled } from "@/modules/commerce/dte/config/dte-mh20.flags";
import { DEFAULT_DTE_SPEC_PROFILE, isDteSpecProfile } from "@/modules/commerce/dte/spec/dte-spec-profile";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const catalog_code = req.nextUrl.searchParams.get("catalog_code");
  if (!catalog_code?.trim()) {
    return NextResponse.json(
      { ok: false, error: "catalog_code es requerido." },
      { status: 400 },
    );
  }

  const rawProfile = req.nextUrl.searchParams.get("spec_profile");
  const spec_profile = rawProfile === null ? DEFAULT_DTE_SPEC_PROFILE : rawProfile.trim();
  if (!isDteSpecProfile(spec_profile)) {
    return NextResponse.json(
      { ok: false, error: "spec_profile inválido. Valores admitidos: MH_1_2, MH_2_0." },
      { status: 400 },
    );
  }
  if (spec_profile === "MH_2_0" && !isDteMh20ProfileEnabled()) {
    return NextResponse.json(
      { ok: false, error: "El perfil normativo MH 2.0 está desactivado globalmente." },
      { status: 409 },
    );
  }

  const items = await listDteCatalogItems({ catalog_code: catalog_code.trim(), spec_profile });

  return NextResponse.json({ ok: true, items }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
