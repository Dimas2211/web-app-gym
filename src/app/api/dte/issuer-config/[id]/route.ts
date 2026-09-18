// ─────────────────────────────────────────────────────────────────
// api/dte/issuer-config/[id]/route.ts
//
// PATCH /api/dte/issuer-config/:id — actualizar configuración de emisor DTE
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { updateDteIssuerConfigSchema } from "@/modules/commerce/dte/schemas/dte-issuer-config.schemas";
import { updateDteIssuerConfig } from "@/modules/commerce/dte/services/dte-issuer-config.service";
import { RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { getDteApiContext } from "../../dte-api-context";

// ── PATCH — actualizar config ──────────────────────────────────────
//
// FASE VI-E2B: migrado a getDteApiContext — reemplaza requireAdmin +
// getEffectiveLocationId + isRuntimeReadOnlyActive() + gate comercial
// manual + Prisma global (mismo patrón ya usado por GET/POST en
// ../route.ts).

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

    const parsed = updateDteIssuerConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await updateDteIssuerConfig(id, ctx.tenant_id, ctx.location_id, ctx.user_id, parsed.data, ctx.client);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    await ctx.dispose();
  }
}
