export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/reports/commerce/filter-options
//
// Devuelve las listas de valores para poblar los selects de filtros
// avanzados: clientes, proveedores y productos activos del tenant.
// No filtra por fecha — son maestros de referencia para el filtro.
// ─────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { resolveEnabledReportModules } from "@/app/api/reports/reports-enforcement";

const ALLOWED_ROLES = ["super_admin", "branch_admin", "reception"];

export interface FilterOption {
  id:   string;
  name: string;
}

export interface ProductFilterOption extends FilterOption {
  product_type: string;
}

export interface FilterOptionsResponse {
  customers: FilterOption[];
  suppliers: FilterOption[];
  products:  ProductFilterOption[];
  _module_availability: {
    "core.customers":     boolean;
    "commerce.suppliers": boolean;
    "commerce.products":  boolean;
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as SessionUser;
  if (!ALLOWED_ROLES.includes(user.role))
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  // FASE VI-D6: tenant/PrismaClient EFECTIVOS — antes se consultaba Prisma
  // global con tenant_id de JWT, sin pasar por resolveEffectiveApiContext.
  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: user.tenant_id }, user);

  try {
    // Bloque B (cierre reporting) — reporte COMPUESTO: cada sección
    // (customers/suppliers/products) es independiente de las otras y se
    // filtra por su propio module code. Una sección deshabilitada
    // devuelve lista vacía (no bloquea las demás, no exige todas).
    const { isEnabled } = await resolveEnabledReportModules(context.tenantId);
    const customersEnabled = isEnabled("core.customers");
    const suppliersEnabled = isEnabled("commerce.suppliers");
    const productsEnabled  = isEnabled("commerce.products");

    const [customers, suppliers, products] = await Promise.all([
      customersEnabled
        ? context.client.customer.findMany({
            where:   { tenant_id: context.tenantId },
            select:  { id: true, name: true },
            orderBy: { name: "asc" },
            take:    500,
          })
        : Promise.resolve([]),
      suppliersEnabled
        ? context.client.supplier.findMany({
            where:   { tenant_id: context.tenantId },
            select:  { id: true, name: true },
            orderBy: { name: "asc" },
            take:    500,
          })
        : Promise.resolve([]),
      productsEnabled
        ? context.client.product.findMany({
            where:   { tenant_id: context.tenantId, status: "ACTIVE" },
            select:  { id: true, name: true, product_type: true },
            orderBy: { name: "asc" },
            take:    500,
          })
        : Promise.resolve([]),
    ]);

    const body: FilterOptionsResponse = {
      customers: customers.map((c) => ({ id: c.id, name: c.name })),
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
      products:  products.map((p)  => ({ id: p.id, name: p.name, product_type: p.product_type })),
      _module_availability: {
        "core.customers":     customersEnabled,
        "commerce.suppliers": suppliersEnabled,
        "commerce.products":  productsEnabled,
      },
    };

    return NextResponse.json(body);
  } finally {
    await dispose();
  }
}
