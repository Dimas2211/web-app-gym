// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/[id]/route.ts
//
// GET /api/dte/outgoing/:id — detalle seguro de un DteOutgoingDocument
//
// Seguridad:
//   - Requiere sesión válida con canManageStaff.
//   - tenantId y locationId se obtienen SIEMPRE del servidor (nunca del cliente).
//   - Scoping por id + tenant_id + location_id aplicado en la query.
//   - NUNCA retorna: signed_jws, json_document, mh_response, observations,
//                    event_json, response_body, mh_observaciones.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDteOutgoingDetailById } from "@/modules/commerce/dte/outgoing/queries/get-dte-outgoing-detail-by-id";
import { getDteApiContext } from "../../dte-api-context";

// ── GET — detalle completo seguro ─────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Validar sesión, permisos y obtener tenantId/locationId del servidor
  const ctx = await getDteApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  // Query con scoping completo: id + tenant_id + location_id
  const detail = await getDteOutgoingDetailById({
    dteId:      id,
    tenantId:   ctx.tenant_id,
    locationId: ctx.location_id,
  });

  if (!detail) {
    return NextResponse.json(
      { ok: false, error: "El documento DTE no fue encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, data: detail }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
