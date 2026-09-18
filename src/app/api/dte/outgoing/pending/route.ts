// ─────────────────────────────────────────────────────────────────
// api/dte/outgoing/pending/route.ts
//
// POST /api/dte/outgoing/pending — crear DteOutgoingDocument PENDING_GENERATION
//
// Reglas:
//   - NO genera JSON DTE.
//   - NO firma.
//   - NO transmite a Hacienda.
//   - Solo crea el registro de seguimiento.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDteOutgoingDocumentDraftSchema } from "@/modules/commerce/dte/schemas/dte-issuer-config.schemas";
import { createPendingDteForSale } from "@/modules/commerce/dte/services/dte-outgoing.service";
import { RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { getDteApiContext } from "../../dte-api-context";

// ── POST — crear documento pendiente ──────────────────────────────
//
// FASE VI-E3: migrado a getDteApiContext — mismo patrón certificado en
// VI-E2B para issuer-config. RUNTIME_CLIENT crea el DteOutgoingDocument
// enteramente en su propia DB (Sale, correlativo, documento).

export async function POST(req: NextRequest) {
  const ctx = await getDteApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  try {
    if (ctx.readOnly) {
      return NextResponse.json({ ok: false, error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Body JSON requerido." }, { status: 400 });
    }

    const parsed = createDteOutgoingDocumentDraftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await createPendingDteForSale(
      ctx.tenant_id,
      ctx.location_id,
      ctx.user_id,
      parsed.data,
      ctx.client,
    );

    if (!result.ok) {
      const isConflict = result.error.includes("Ya existe");
      return NextResponse.json({ ok: false, error: result.error }, { status: isConflict ? 409 : 422 });
    }

    return NextResponse.json(
      { ok: true, data: { dte_document_id: result.dte_document_id } },
      { status: 201 },
    );
  } finally {
    await ctx.dispose();
  }
}
