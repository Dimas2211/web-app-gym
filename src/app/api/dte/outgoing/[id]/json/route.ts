// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/[id]/json/route.ts
//
// GET /api/dte/outgoing/:id/json            → vista (envelope JSON)
// GET /api/dte/outgoing/:id/json?download=1 → archivo .json (attachment)
//
// Devuelve el JSON ORIGINAL persistido (dte_outgoing_documents.json_document)
// de cualquier DTE saliente (01, 03, 05, 11, 14, …), sea de venta o compra.
//
// Estrictamente READ-ONLY: no regenera, no recalcula, no firma, no
// transmite, no cambia estados ni escribe logs fiscales.
//
// Seguridad (mismo guard que /api/dte/outgoing/[id]):
//   - getDteApiContext: sesión (401), canManageStaff con rol live (403),
//     tenant + location resueltos en servidor, módulo fiscal.dte activo,
//     cliente Prisma efectivo (Dedicated Runtime).
//   - Scoping id + tenant_id + location_id → 404 fuera de alcance.
//   - NUNCA retorna signed_jws, mh_response, reception_stamp ni credenciales.
//   - Nunca registra el contenido JSON en logs.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDteOutgoingJsonDocument } from "@/modules/commerce/dte/outgoing/queries/get-dte-outgoing-json-document";
import {
  buildDteJsonFileName,
  serializeDteJsonDocument,
} from "@/modules/commerce/dte/outgoing/utils/dte-json-file.utils";
import { getDteApiContext } from "../../../dte-api-context";

const NO_STORE = "private, no-store, max-age=0";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getDteApiContext(req, { resolveRuntimeActiveLocation: true });
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status, headers: { "Cache-Control": NO_STORE } },
    );
  }

  try {
    const doc = await getDteOutgoingJsonDocument({
      dteId:      id,
      tenantId:   ctx.tenant_id,
      locationId: ctx.location_id,
      client:     ctx.client,
    });

    if (!doc) {
      return NextResponse.json(
        { ok: false, error: "El documento DTE no fue encontrado." },
        { status: 404, headers: { "Cache-Control": NO_STORE } },
      );
    }

    if (doc.json_document === null) {
      return NextResponse.json(
        { ok: false, error: "Este documento todavía no tiene un JSON generado." },
        { status: 409, headers: { "Cache-Control": NO_STORE } },
      );
    }

    const download = req.nextUrl?.searchParams.get("download") === "1";

    // Auditoría mínima de acceso — solo metadatos, nunca el contenido.
    console.info(
      `[dte-json] ${download ? "download" : "view"} dte=${doc.id} type=${doc.dte_type_code} ` +
      `env=${doc.environment} user=${ctx.user_id}`,
    );

    if (download) {
      const fileName = buildDteJsonFileName(doc);
      return new NextResponse(serializeDteJsonDocument(doc.json_document), {
        status: 200,
        headers: {
          "Content-Type":           "application/json; charset=utf-8",
          "Content-Disposition":    `attachment; filename="${fileName}"`,
          "Cache-Control":          NO_STORE,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          id:              doc.id,
          sale_id:         doc.sale_id,
          purchase_id:     doc.purchase_id,
          dte_type_code:   doc.dte_type_code,
          generation_code: doc.generation_code,
          control_number:  doc.control_number,
          environment:     doc.environment,
          dte_status:      doc.dte_status,
          file_name:       buildDteJsonFileName(doc),
          json_document:   doc.json_document,
        },
      },
      { headers: { "Cache-Control": NO_STORE } },
    );
  } finally {
    await ctx.dispose();
  }
}
