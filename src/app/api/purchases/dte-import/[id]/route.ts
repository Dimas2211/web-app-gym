// ─────────────────────────────────────────────────────────────────
// api/purchases/dte-import/[id]/route.ts
//
// GET /api/purchases/dte-import/:id
//   Devuelve el registro PurchaseDteImport por id.
//   Valida tenant_id y location_id activos.
//   Incluye raw_json para debug en esta fase de staging.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, type SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getPurchaseDteImportById } from "@/modules/commerce/purchases/queries/get-purchase-dte-import-by-id";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionUser = await requireAdmin();

  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.purchases" });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
        context.client,
        context.tenantId,
      ));

    if (!location_id) {
      return NextResponse.json(
        { error: "Sesión sin tenant o location activa." },
        { status: 401 },
      );
    }

    const { id } = await params;

    const record = await getPurchaseDteImportById(id, context.tenantId, location_id, context.client);
    if (!record) {
      return NextResponse.json(
        { error: "Registro DTE no encontrado o no pertenece a la location activa." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: record });
  } finally {
    await dispose();
  }
}
