// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/[id]/representation/route.ts
//
// GET /api/dte/outgoing/:id/representation → PDF de la representación
// gráfica (versión legible) del DTE firmado. MH20 Fase 6.1 (IMP20-021).
//
// Mismo guard que /api/dte/outgoing/[id]/json (getDteApiContext: sesión,
// permiso con rol live, tenant + location resueltos en servidor, módulo
// fiscal.dte activo, cliente Prisma efectivo). El PDF no contiene el JWS,
// por eso se permite también en sesión de soporte de solo lectura.
//
// READ-ONLY: no regenera, no firma, no transmite, no envía correo ni marca
// el documento como entregado. Generar/descargar ≠ entregar al receptor.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDteOutgoingRepresentation } from "@/modules/commerce/dte/outgoing/queries/get-dte-outgoing-representation";
import { renderDteGraphicRepresentationPdf } from "@/modules/commerce/dte/services/render-dte-graphic-representation-pdf";
import { getDteApiContext } from "../../../dte-api-context";

const NO_STORE = "private, no-store, max-age=0";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": NO_STORE } });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getDteApiContext(req, { resolveRuntimeActiveLocation: true });
  if (!ctx.ok) return jsonError(ctx.status, ctx.error);
  try {
    const found = await getDteOutgoingRepresentation({
      dteId: id, tenantId: ctx.tenant_id, locationId: ctx.location_id, client: ctx.client,
    });
    if (found.status === "NOT_FOUND") return jsonError(404, "El documento DTE no fue encontrado.");
    if (!found.result.ok) return jsonError(409, `No es posible generar la representación gráfica: ${found.result.error}`);
    const pdf = await renderDteGraphicRepresentationPdf(found.result.representation);
    console.info(
      `[dte-representation] download dte=${found.id} type=${found.dte_type_code} env=${found.environment} ` +
      `stamp=${found.result.representation.stampStatus} user=${ctx.user_id}`,
    );
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type":           "application/pdf",
        "Content-Disposition":    `attachment; filename="${found.result.representation.fileName}"`,
        "Cache-Control":          NO_STORE,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } finally {
    await ctx.dispose();
  }
}
