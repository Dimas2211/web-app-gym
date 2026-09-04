export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/suppliers/lookup?search=
//
// Lookup rápido de proveedores activos del tenant para el combobox
// de selección en el flujo de compras.
//
// Guard: requireAdmin — mismo scope que purchases.
// Llama getSuppliersForLookup() (activos, máx 50, busca por código y nombre OR).
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getSuppliersForLookup } from "@/modules/commerce/suppliers/queries/get-suppliers-for-lookup";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

export async function GET(req: NextRequest) {
  const sessionUser = await requireAdmin();
  const tenantId    = sessionUser.tenant_id;

  if (!tenantId) {
    return NextResponse.json({ error: "Sesión sin tenant activo." }, { status: 401 });
  }

  // Consumido por el combobox propio de Suppliers y por el flujo de
  // importación DTE de Purchases (purchase-dte-import-client) — sin un
  // único consumidor funcional exclusivo, se guarda con el módulo dueño
  // de la entidad (commerce.suppliers), igual que /api/suppliers/[id].
  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenantId);
    assertOrganizationModule(commercialCtx, "commerce.suppliers");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }

  const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;

  const results = await getSuppliersForLookup(tenantId, search);

  return NextResponse.json(results);
}
