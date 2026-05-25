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
import { prisma } from "@/lib/db/prisma";

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
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as SessionUser;
  if (!ALLOWED_ROLES.includes(user.role))
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const [customers, suppliers, products] = await Promise.all([
    prisma.customer.findMany({
      where:   { tenant_id: user.tenant_id },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
      take:    500,
    }),
    prisma.supplier.findMany({
      where:   { tenant_id: user.tenant_id },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
      take:    500,
    }),
    prisma.product.findMany({
      where:   { tenant_id: user.tenant_id, status: "ACTIVE" },
      select:  { id: true, name: true, product_type: true },
      orderBy: { name: "asc" },
      take:    500,
    }),
  ]);

  const body: FilterOptionsResponse = {
    customers: customers.map((c) => ({ id: c.id, name: c.name })),
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
    products:  products.map((p)  => ({ id: p.id, name: p.name, product_type: p.product_type })),
  };

  return NextResponse.json(body);
}
