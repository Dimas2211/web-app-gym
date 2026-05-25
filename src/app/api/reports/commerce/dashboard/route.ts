export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// api/reports/commerce/dashboard — route.ts
//
// GET /api/reports/commerce/dashboard?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
//
// Devuelve CommerceDashboardData con todos los KPIs y datos de gráficas
// para el dashboard de reportes comerciales. Todas las queries se
// ejecutan en paralelo. Solo ventas y compras CONFIRMED.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getCommerceReportSummary }   from "@/modules/commerce/reports/queries/get-commerce-report-summary";
import { getSalesByPeriod }           from "@/modules/commerce/reports/queries/get-sales-by-period";
import { getPurchasesByPeriod }       from "@/modules/commerce/reports/queries/get-purchases-by-period";
import { getTopSoldProducts }         from "@/modules/commerce/reports/queries/get-top-sold-products";
import { getTopSoldServices }         from "@/modules/commerce/reports/queries/get-top-sold-services";
import { getServiceSalesDistribution }from "@/modules/commerce/reports/queries/get-service-sales-distribution";
import { getProductVsServiceSales }   from "@/modules/commerce/reports/queries/get-product-vs-service-sales";
import { getPurchasesBySupplier }     from "@/modules/commerce/reports/queries/get-purchases-by-supplier";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;

  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const location_id = await getEffectiveLocationId(user);
  if (!location_id) {
    return NextResponse.json({ error: "Sin location activa" }, { status: 400 });
  }

  const { searchParams } = req.nextUrl;
  const date_from = searchParams.get("date_from") ?? "";
  const date_to   = searchParams.get("date_to")   ?? "";

  if (!date_from || !date_to) {
    return NextResponse.json({ error: "Parámetros date_from y date_to requeridos" }, { status: 400 });
  }

  const filters = {
    tenant_id:   user.tenant_id,
    location_id,
    date_from,
    date_to,
  };

  const [
    summary,
    sales_by_period,
    purchases_by_period,
    top_products_by_amount,
    top_products_by_qty,
    top_services_by_amount,
    top_services_by_qty,
    service_distribution,
    product_vs_service,
    purchases_by_supplier,
  ] = await Promise.all([
    getCommerceReportSummary(filters),
    getSalesByPeriod(filters),
    getPurchasesByPeriod(filters),
    getTopSoldProducts(filters, 10, "total"),
    getTopSoldProducts(filters, 10, "quantity"),
    getTopSoldServices(filters, 10, "total"),
    getTopSoldServices(filters, 10, "quantity"),
    getServiceSalesDistribution(filters),
    getProductVsServiceSales(filters),
    getPurchasesBySupplier(filters),
  ]);

  return NextResponse.json({
    summary,
    sales_by_period,
    purchases_by_period,
    top_products_by_amount,
    top_products_by_qty,
    top_services_by_amount,
    top_services_by_qty,
    service_distribution,
    product_vs_service,
    purchases_by_supplier,
  });
}
