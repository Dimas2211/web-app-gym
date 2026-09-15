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
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

export async function GET(req: NextRequest) {
  const sessionUser = await requireAdmin();

  // Consumido por el combobox propio de Suppliers y por el flujo de
  // importación DTE de Purchases (purchase-dte-import-client) — sin un
  // único consumidor funcional exclusivo, se guarda con el módulo dueño
  // de la entidad (commerce.suppliers), igual que /api/suppliers/[id].
  let handle;
  try {
    handle = await requireOperationalContext(sessionUser, { module: "commerce.suppliers" });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;
    const results = await getSuppliersForLookup(context.tenantId, search, true, context.client);
    return NextResponse.json(results);
  } finally {
    await dispose();
  }
}
