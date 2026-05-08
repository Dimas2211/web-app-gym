// ─────────────────────────────────────────────────────────────────
// api/sales/[id]/cancel-draft/route.ts
//
// DESHABILITADO — Este endpoint fue reemplazado por la server action
// deleteDraftSaleWithAuthAction que exige credenciales administrativas.
// Devuelve 403 para evitar que se use como bypass de autorización.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Este endpoint está deshabilitado. Usa la acción autorizada desde la UI.",
    },
    { status: 403 },
  );
}
