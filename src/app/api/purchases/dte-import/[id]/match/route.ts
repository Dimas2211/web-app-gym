// ─────────────────────────────────────────────────────────────────
// api/purchases/dte-import/[id]/match/route.ts
//
// GET /api/purchases/dte-import/:id/match[?supplier_id=...]
//   Analiza el DTE importado y devuelve matching sugerido de
//   proveedor y productos. No guarda ningún cambio en la base de datos.
//
// Query param opcional:
//   supplier_id — UUID de proveedor ya seleccionado por el usuario.
//   Cuando se provee, el matching de productos usa aliases de ese
//   proveedor específico, aunque el matching automático de proveedor
//   no hubiera dado HIGH. Debe pertenecer al mismo tenant.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getPurchaseDteImportById } from "@/modules/commerce/purchases/queries/get-purchase-dte-import-by-id";
import { matchDteImport } from "@/modules/commerce/purchases/services/purchase-dte-matching.service";
import { prisma } from "@/lib/db/prisma";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
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

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "commerce.purchases");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
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

  // Param opcional: supplier_id para override del matching de aliases
  const supplierIdParam = req.nextUrl.searchParams.get("supplier_id");
  let override_supplier_id: string | null = null;

  if (supplierIdParam) {
    if (!UUID_RE.test(supplierIdParam)) {
      return NextResponse.json(
        { error: "supplier_id debe ser un UUID válido." },
        { status: 400 },
      );
    }
    // Verificar que el proveedor pertenece a este tenant
    const supplierExists = await prisma.supplier.findFirst({
      where:  { id: supplierIdParam, tenant_id },
      select: { id: true },
    });
    if (!supplierExists) {
      return NextResponse.json(
        { error: "El proveedor no existe o no pertenece a este tenant." },
        { status: 404 },
      );
    }
    override_supplier_id = supplierIdParam;
  }

  const result = await matchDteImport(record, override_supplier_id);

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
