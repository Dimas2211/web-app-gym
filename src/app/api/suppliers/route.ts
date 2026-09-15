export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET  /api/suppliers  — lista filtrada del maestro de proveedores
// POST /api/suppliers  — crear proveedor completo
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import type { UserRole } from "@prisma/client";
import { getSuppliers } from "@/modules/commerce/suppliers/queries/get-suppliers";
import { createSupplierSchema } from "@/modules/commerce/suppliers/schemas/create-supplier.schema";
import { createSupplier } from "@/modules/commerce/suppliers/services/supplier.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import type {
  SupplierFilters,
  SupplierSortField,
  SortDirection,
} from "@/modules/commerce/suppliers/types/supplier-filters.types";
import type { TaxpayerType, SupplierStatus } from "@/modules/commerce/suppliers/types/supplier.types";

// Solo admins gestionan el maestro de proveedores — el chequeo real
// (ETAPA E/H) se hace con el ROL LIVE, ver `getCapabilities(context.effectiveUser.role)`.

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

  // FASE VI-D2: resuelve contexto efectivo + enforcement de módulo ANTES
  // de tocar cualquier dato (fail closed para RUNTIME_CLIENT inválido).
  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "commerce.suppliers" });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
    await dispose();
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;

  // ── Filtros ─────────────────────────────────────────────────────
  const filters: SupplierFilters = { tenant_id: context.tenantId };

  const searchCode = searchParams.get("search_code");
  if (searchCode?.trim()) filters.search_code = searchCode.trim();

  const searchName = searchParams.get("search_name");
  if (searchName?.trim()) filters.search_name = searchName.trim();

  const VALID_TAXPAYER_TYPES: TaxpayerType[] = [
    "LARGE_TAXPAYER", "SMALL_TAXPAYER", "NON_TAXPAYER", "FOREIGN", "EXCLUDED_SUBJECT",
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

  try {
    const result = await getSuppliers(filters, context.client);
    return NextResponse.json(result);
  } finally {
    await dispose();
  }
}

// ── POST /api/suppliers ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as SessionUser;

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "commerce.suppliers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
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

    const result = await createSupplier(context.tenantId, context.effectiveUser.id, parsed.data, context.client);

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
  } finally {
    await dispose();
  }
}
