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
import { resolveEnabledReportModules } from "@/app/api/reports/reports-enforcement";

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

  // Bloque B (cierre reporting) — reporte COMPUESTO: resuelve el
  // Commercial Enforcement Context UNA sola vez y decide, sección por
  // sección, qué query ejecutar. No exige TODOS los módulos para
  // responder ni ANY-habilita-TODO. `summary` mezcla ventas+compras en
  // un único objeto no separable sin cambiar su forma (margen =
  // ventas − compras) — se calcula solo si AMBOS módulos están
  // habilitados; el resto de secciones se resuelve de forma
  // independiente por su propio module code.
  const { isEnabled } = await resolveEnabledReportModules(user.tenant_id);
  const salesEnabled = isEnabled("commerce.sales");
  const purchasesEnabled = isEnabled("commerce.purchases");

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
    salesEnabled && purchasesEnabled ? getCommerceReportSummary(filters) : Promise.resolve(null),
    salesEnabled     ? getSalesByPeriod(filters)                    : Promise.resolve(null),
    purchasesEnabled ? getPurchasesByPeriod(filters)                : Promise.resolve(null),
    salesEnabled     ? getTopSoldProducts(filters, 10, "total")     : Promise.resolve(null),
    salesEnabled     ? getTopSoldProducts(filters, 10, "quantity")  : Promise.resolve(null),
    salesEnabled     ? getTopSoldServices(filters, 10, "total")     : Promise.resolve(null),
    salesEnabled     ? getTopSoldServices(filters, 10, "quantity")  : Promise.resolve(null),
    salesEnabled     ? getServiceSalesDistribution(filters)         : Promise.resolve(null),
    salesEnabled     ? getProductVsServiceSales(filters)            : Promise.resolve(null),
    purchasesEnabled ? getPurchasesBySupplier(filters)              : Promise.resolve(null),
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
    _module_availability: {
      "commerce.sales":     salesEnabled,
      "commerce.purchases": purchasesEnabled,
    },
  });
}
