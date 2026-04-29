export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET  /api/suppliers  — lista filtrada del maestro de proveedores
// POST /api/suppliers  — crear proveedor completo
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getSuppliers } from "@/modules/commerce/suppliers/queries/get-suppliers";
import { createSupplierSchema } from "@/modules/commerce/suppliers/schemas/create-supplier.schema";
import { createSupplier } from "@/modules/commerce/suppliers/services/supplier.service";
import type {
  SupplierFilters,
  SupplierSortField,
  SortDirection,
} from "@/modules/commerce/suppliers/types/supplier-filters.types";
import type { TaxpayerType, SupplierStatus } from "@/modules/commerce/suppliers/types/supplier.types";

// Solo admins gestionan el maestro de proveedores
const ADMIN_ROLES = ["super_admin", "branch_admin"];

// ── Helpers de mapeo HTTP ─────────────────────────────────────────

import type { SupplierErrorCode } from "@/modules/commerce/suppliers/services/supplier.service";

function toHttpStatus(code: SupplierErrorCode): number {
  switch (code) {
    case "NOT_FOUND":      return 404;
    case "DUPLICATE_CODE": return 409;
    default:               return 422;
  }
}

// ── GET /api/suppliers ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;

  // ── Filtros ─────────────────────────────────────────────────────
  const filters: SupplierFilters = { tenant_id: user.tenant_id };

  const searchCode = searchParams.get("search_code");
  if (searchCode?.trim()) filters.search_code = searchCode.trim();

  const searchName = searchParams.get("search_name");
  if (searchName?.trim()) filters.search_name = searchName.trim();

  const VALID_TAXPAYER_TYPES: TaxpayerType[] = [
    "LARGE_TAXPAYER", "SMALL_TAXPAYER", "NON_TAXPAYER", "FOREIGN",
  ];
  const taxpayerTypeParam = searchParams.get("taxpayer_type");
  if (taxpayerTypeParam && VALID_TAXPAYER_TYPES.includes(taxpayerTypeParam as TaxpayerType)) {
    filters.taxpayer_type = taxpayerTypeParam as TaxpayerType;
  }

  const VALID_STATUSES: SupplierStatus[] = ["active", "inactive"];
  const statusParam = searchParams.get("status");
  if (statusParam && VALID_STATUSES.includes(statusParam as SupplierStatus)) {
    filters.status = statusParam as SupplierStatus;
  }

  // ── Ordenamiento ────────────────────────────────────────────────
  const VALID_SORT_FIELDS: SupplierSortField[] = [
    "supplier_code", "name", "taxpayer_type", "nit", "status", "created_at",
  ];
  const sortFieldParam = searchParams.get("sort_field");
  if (sortFieldParam && VALID_SORT_FIELDS.includes(sortFieldParam as SupplierSortField)) {
    filters.sort_field = sortFieldParam as SupplierSortField;
  }

  const sortDirParam = searchParams.get("sort_direction");
  if (sortDirParam === "asc" || sortDirParam === "desc") {
    filters.sort_direction = sortDirParam as SortDirection;
  }

  // ── Tamaño de resultado ─────────────────────────────────────────
  const pageSizeParam = parseInt(searchParams.get("page_size") ?? "150", 10);
  if (!isNaN(pageSizeParam) && pageSizeParam > 0) {
    filters.page_size = pageSizeParam;
  }

  const result = await getSuppliers(filters);
  return NextResponse.json(result);
}

// ── POST /api/suppliers ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const parsed = createSupplierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await createSupplier(user.tenant_id, user.id, parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.field && { field: result.field }) },
      { status: toHttpStatus(result.code) },
    );
  }

  return NextResponse.json(
    { id: result.id, supplier_code: result.supplier_code },
    {
      status:  201,
      headers: { Location: `/api/suppliers/${result.id}` },
    },
  );
}
