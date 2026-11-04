// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/[id]/json/route.ts
//
// GET /api/dte/outgoing/:id/json                          → JSON fiscal original (vista)
// GET /api/dte/outgoing/:id/json?download=1               → JSON fiscal original (.json)
// GET /api/dte/outgoing/:id/json?variant=external         → payload completo entrega externa (vista)
// GET /api/dte/outgoing/:id/json?variant=external&download=1 → payload completo (.json)
//
// variant=fiscal (default): dte_outgoing_documents.json_document tal cual.
// variant=external: buildExternalDtePayload() — mismo builder que usa la
//   entrega a MariaDB: campos DTE + codigoEmpresa + responseMH + token (JWS
//   completo). mode=RECONSTRUCTED si hubo entrega exitosa, PREVIEW si no.
//   No hay snapshot persistido del payload enviado: es reconstrucción.
//
// Estrictamente READ-ONLY: no regenera, no recalcula, no firma, no
// transmite a MH, no reenvía a MariaDB, no cambia estados ni escribe logs.
//
// Seguridad (mismo guard que /api/dte/outgoing/[id] y que la entrega
// externa en modo normal — canManageStaff):
//   - getDteApiContext: sesión (401), permiso con rol live (403),
//     tenant + location resueltos en servidor, módulo fiscal.dte activo,
//     cliente Prisma efectivo (Dedicated Runtime).
//   - variant=external (contiene el JWS) se rechaza (403) bajo Support
//     Session de solo lectura.
//   - Scoping id + tenant_id + location_id → 404 fuera de alcance.
//   - Nunca registra el contenido JSON ni el JWS en logs.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDteOutgoingJsonDocument } from "@/modules/commerce/dte/outgoing/queries/get-dte-outgoing-json-document";
import { getDteOutgoingExternalPayload } from "@/modules/commerce/dte/outgoing/queries/get-dte-outgoing-external-payload";
import {
  buildDteJsonFileName,
  buildDteExternalJsonFileName,
  serializeDteJsonDocument,
  serializeExternalDtePayloadForInsert,
} from "@/modules/commerce/dte/outgoing/utils/dte-json-file.utils";
import { getDteApiContext } from "../../../dte-api-context";

const NO_STORE = "private, no-store, max-age=0";

function jsonError(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": NO_STORE } },
  );
}

function attachment(body: string, fileName: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":           "application/json; charset=utf-8",
      "Content-Disposition":    `attachment; filename="${fileName}"`,
      "Cache-Control":          NO_STORE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const search   = req.nextUrl?.searchParams;
  const download = search?.get("download") === "1";
  const rawVariant = search?.get("variant") ?? "fiscal";
  if (rawVariant !== "fiscal" && rawVariant !== "external") {
    return jsonError(400, "Variante de JSON no válida.");
  }
  const variant = rawVariant;

  const ctx = await getDteApiContext(req, { resolveRuntimeActiveLocation: true });
  if (!ctx.ok) return jsonError(ctx.status, ctx.error);

  try {
    // ── Variante: payload completo de entrega externa ────────────
    if (variant === "external") {
      if (ctx.readOnly) {
        return jsonError(403, "El JSON completo (incluye firma JWS) no está disponible en sesión de soporte de solo lectura.");
      }

      const result = await getDteOutgoingExternalPayload({
        dteId:      id,
        tenantId:   ctx.tenant_id,
        locationId: ctx.location_id,
        client:     ctx.client,
      });

      if (result.status === "NOT_FOUND") return jsonError(404, "El documento DTE no fue encontrado.");
      if (result.status === "NOT_BUILDABLE") {
        return jsonError(409, `No es posible construir el JSON de entrega externa: ${result.error}`);
      }

      console.info(
        `[dte-json] ${download ? "download" : "view"} variant=external mode=${result.mode} ` +
        `dte=${result.id} type=${result.dte_type_code} env=${result.environment} user=${ctx.user_id}`,
      );

      const fileName = buildDteExternalJsonFileName(result);
      if (download) {
        return attachment(serializeExternalDtePayloadForInsert(result.payload), fileName);
      }

      return NextResponse.json(
        {
          ok: true,
          data: {
            variant:         "external",
            mode:            result.mode,
            id:              result.id,
            sale_id:         result.sale_id,
            purchase_id:     result.purchase_id,
            dte_type_code:   result.dte_type_code,
            generation_code: result.generation_code,
            control_number:  result.control_number,
            environment:     result.environment,
            dte_status:      result.dte_status,
            delivery:        result.delivery,
            file_name:       fileName,
            json_document:   result.payload,
          },
        },
        { headers: { "Cache-Control": NO_STORE } },
      );
    }

    // ── Variante: JSON fiscal original (sin cambios de contrato) ─
    const doc = await getDteOutgoingJsonDocument({
      dteId:      id,
      tenantId:   ctx.tenant_id,
      locationId: ctx.location_id,
      client:     ctx.client,
    });

    if (!doc) return jsonError(404, "El documento DTE no fue encontrado.");
    if (doc.json_document === null) return jsonError(409, "Este documento todavía no tiene un JSON generado.");

    // Auditoría mínima de acceso — solo metadatos, nunca el contenido.
    console.info(
      `[dte-json] ${download ? "download" : "view"} dte=${doc.id} type=${doc.dte_type_code} ` +
      `env=${doc.environment} user=${ctx.user_id}`,
    );

    if (download) {
      return attachment(serializeDteJsonDocument(doc.json_document), buildDteJsonFileName(doc));
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          variant:         "fiscal",
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
