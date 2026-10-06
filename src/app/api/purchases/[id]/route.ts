// ─────────────────────────────────────────────────────────────────
// api/purchases/[id]/route.ts
//
// GET    /api/purchases/:id — detalle completo de una compra.
// DELETE /api/purchases/:id — DESHABILITADO (403): usar
//                             deleteDraftPurchaseWithAuthAction (clave).
// Scoped por tenant_id + location_id desde sesión.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getPurchaseById } from "@/modules/commerce/purchases/queries/get-purchase-by-id";
import { getPurchaseApiContext } from "../purchase-api-context";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Solo lectura: location activa runtime (RUNTIME_CLIENT tenant-wide).
  const ctx = await getPurchaseApiContext(req, { resolveRuntimeActiveLocation: true });

  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  try {
    const detail = await getPurchaseById(id, ctx.tenant_id, ctx.location_id, ctx.client);

    if (!detail) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }

    return NextResponse.json(detail, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } finally {
    await ctx.dispose();
  }
}

// ── DELETE — DESHABILITADO ────────────────────────────────────────
// Eliminar un borrador exige la Clave de Supervisor
// (PURCHASE_DELETE_DRAFT). Se migró a la server action
// deleteDraftPurchaseWithAuthAction; este endpoint devuelve 403 para no
// ser un bypass de la Autorización Operativa (mismo criterio que
// /api/sales/[id]/cancel-draft).

export async function DELETE() {
  return NextResponse.json(
    { error: "Este endpoint está deshabilitado. Usa la acción autorizada desde la UI." },
    { status: 403 },
  );
}
