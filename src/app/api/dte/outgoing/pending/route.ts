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
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { createDteOutgoingDocumentDraftSchema } from "@/modules/commerce/dte/schemas/dte-issuer-config.schemas";
import { createPendingDteForSale } from "@/modules/commerce/dte/services/dte-outgoing.service";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// ── POST — crear documento pendiente ──────────────────────────────

export async function POST(req: NextRequest) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return NextResponse.json({ ok: false, error: "Sesión sin tenant activo." }, { status: 401 });
  if (!location_id) return NextResponse.json({ ok: false, error: "Selecciona una location activa." }, { status: 409 });

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return NextResponse.json({ ok: false, error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
  }

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ ok: false, error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
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

  const result = await createPendingDteForSale(tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    const isConflict = result.error.includes("Ya existe");
    return NextResponse.json({ ok: false, error: result.error }, { status: isConflict ? 409 : 422 });
  }

  return NextResponse.json(
    { ok: true, data: { dte_document_id: result.dte_document_id } },
    { status: 201 },
  );
}
