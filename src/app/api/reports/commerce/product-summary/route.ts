export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/reports/commerce/product-summary
//
// Resumen por producto: ventas + compras agrupadas.
// Params: date_from, date_to, product_type?, limit?
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getProductSummaryReport } from "@/modules/commerce/reports/queries/get-product-summary-report";
import { resolveEnabledReportModules } from "@/app/api/reports/reports-enforcement";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as SessionUser;
  if (!ALLOWED_ROLES.includes(user.role))
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const location_id = await getEffectiveLocationId(user);
  if (!location_id) return NextResponse.json({ error: "Sin location activa" }, { status: 400 });

  const p = req.nextUrl.searchParams;
  const date_from = p.get("date_from") ?? "";
  const date_to   = p.get("date_to")   ?? "";
  if (!date_from || !date_to)
    return NextResponse.json({ error: "date_from y date_to requeridos" }, { status: 400 });

  const productType = p.get("product_type");
  const limitParam  = p.get("limit");

  // Bloque B (cierre reporting) — reporte COMPUESTO por fila: cada fila
  // mezcla datos de ventas (commerce.sales) y de compras
  // (commerce.purchases) para el mismo producto. La query fusiona ambos
  // lados en un solo groupBy en paralelo (no es técnicamente separable
  // sin restructurar get-product-summary-report.ts), así que en vez de
  // evitar la ejecución de la query del lado deshabilitado, se redactan
  // (null) los campos del lado no autorizado antes de responder — nunca
  // se filtra el dato del módulo deshabilitado al cliente.
  const { isEnabled } = await resolveEnabledReportModules(user.tenant_id);
  const salesEnabled = isEnabled("commerce.sales");
  const purchasesEnabled = isEnabled("commerce.purchases");

  try {
    const rawRows = await getProductSummaryReport({
      tenant_id:    user.tenant_id,
      location_id,
      date_from,
      date_to,
      product_type: (productType === "PRODUCT" || productType === "SERVICE") ? productType : undefined,
      limit:        limitParam ? Math.min(Number(limitParam), 500) : 200,
    });

    // Un producto entra a `rawRows` si tuvo ventas O compras en el rango
    // (unión de dos groupBy). Si el único motivo por el que una fila
    // existe es el lado deshabilitado (ej. producto solo comprado, nunca
    // vendido, con commerce.purchases off), la fila entera se descarta —
    // no solo se redactan sus cifras. Dejar la fila (aunque con montos en
    // null) filtraría igual un dato del módulo deshabilitado: la mera
    // existencia de actividad de compra para ese producto específico.
    const rows = rawRows
      .filter((row) => {
        const hasSalesSignal    = row.qty_sold > 0 || row.amount_sold > 0;
        const hasPurchaseSignal = row.qty_purchased > 0 || row.amount_purchased > 0;
        return (salesEnabled && hasSalesSignal) || (purchasesEnabled && hasPurchaseSignal);
      })
      .map((row) => ({
        ...row,
        qty_sold:           salesEnabled ? row.qty_sold : null,
        amount_sold:        salesEnabled ? row.amount_sold : null,
        last_sale_date:     salesEnabled ? row.last_sale_date : null,
        margin_estimate:    salesEnabled ? row.margin_estimate : null,
        qty_purchased:      purchasesEnabled ? row.qty_purchased : null,
        amount_purchased:   purchasesEnabled ? row.amount_purchased : null,
        last_purchase_date: purchasesEnabled ? row.last_purchase_date : null,
      }));

    // total_rows se calcula DESPUÉS del filtrado — nunca debe reflejar
    // cuántos productos tuvieron actividad en el módulo deshabilitado.
    return NextResponse.json({
      rows,
      total_rows: rows.length,
      date_from,
      date_to,
      _module_availability: {
        "commerce.sales":     salesEnabled,
        "commerce.purchases": purchasesEnabled,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[product-summary]", err);
    return NextResponse.json({ error: message, rows: [] }, { status: 500 });
  }
}
