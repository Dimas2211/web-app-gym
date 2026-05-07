// ─────────────────────────────────────────────────────────────────
// api/purchases/dte-import/[id]/match/route.ts
//
// GET /api/purchases/dte-import/:id/match
//   Analiza el DTE importado y devuelve matching sugerido de
//   proveedor y productos. No guarda ningún cambio en la base de datos.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getPurchaseDteImportById } from "@/modules/commerce/purchases/queries/get-purchase-dte-import-by-id";
import { matchDteImport } from "@/modules/commerce/purchases/services/purchase-dte-matching.service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id || !location_id) {
    return NextResponse.json(
      { error: "Sesión sin tenant o location activa." },
      { status: 401 },
    );
  }

  const { id } = await params;

  // Valida tenant_id y location_id — devuelve null si no pertenece al contexto activo
  const record = await getPurchaseDteImportById(id, tenant_id, location_id);
  if (!record) {
    return NextResponse.json(
      { error: "Registro DTE no encontrado o no pertenece a la location activa." },
      { status: 404 },
    );
  }

  const result = await matchDteImport(record);

  return NextResponse.json({
    ok:              true,
    dte_import_id:   result.dte_import_id,
    supplier_match:  result.supplier_match,
    item_matches:    result.item_matches,
    // Metadata documental del DTE para mostrar en pantalla de revisión
    dte_type:        record.dte_type,
    generation_code: record.generation_code,
    control_number:  record.control_number,
    environment_code: record.environment_code,
    issued_at:       record.issued_at?.toISOString() ?? null,
    total_amount:    record.total_amount,
    reception_stamp: record.reception_stamp,
  });
}
