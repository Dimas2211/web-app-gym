export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET  /api/inventory/product-locations  — grilla de stock
// POST /api/inventory/product-locations  — crear registro operativo
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getProductLocations } from "@/modules/commerce/inventory/queries/get-product-locations";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { createProductLocationSchema } from "@/modules/commerce/inventory/schemas/create-product-location.schema";
import { createProductLocation } from "@/modules/commerce/inventory/services/product-location.service";
import type {
  ProductLocationFilters,
  ProductLocationSortField,
  SortDirection,
} from "@/modules/commerce/inventory/types/inventory-filters.types";
import type { StockAlertLevel } from "@/modules/commerce/inventory/types/inventory.types";

const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];
const ADMIN_ROLES  = ["super_admin", "branch_admin"];

// ── GET /api/inventory/product-locations ──────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as SessionUser;

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "commerce.inventory" });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  if (!VIEWER_ROLES.includes(context.effectiveUser.role)) {
    await dispose();
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const locationId =
    context.locationId ??
    (await getEffectiveLocationId(
      { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
      context.client,
      context.tenantId,
    ));

  if (!locationId) {
    await dispose();
    return NextResponse.json(
      { error: "La sesión no tiene tenant o location activos." },
      { status: 400 },
    );
  }

  const { searchParams } = req.nextUrl;

  // ── Filtros ─────────────────────────────────────────────────────
  const filters: ProductLocationFilters = {
    tenant_id:   context.tenantId,
    location_id: locationId,
  };

  const searchCode = searchParams.get("search_code");
  if (searchCode?.trim()) filters.search_code = searchCode.trim();

  const searchName = searchParams.get("search_name");
  if (searchName?.trim()) filters.search_name = searchName.trim();

  const isActiveParam = searchParams.get("is_active");
  if (isActiveParam !== null) filters.is_active = isActiveParam === "true";

  const VALID_ALERTS: StockAlertLevel[] = ["OK", "LOW", "EMPTY"];
  const alertParam = searchParams.get("stock_alert");
  if (alertParam && VALID_ALERTS.includes(alertParam as StockAlertLevel)) {
    filters.stock_alert = alertParam as StockAlertLevel;
  }

  const warehouse = searchParams.get("warehouse");
  if (warehouse?.trim()) filters.warehouse = warehouse.trim();

  const categoryId = searchParams.get("category_id");
  if (categoryId) filters.category_id = categoryId;

  // ── Ordenamiento ────────────────────────────────────────────────
  const VALID_SORT_FIELDS: ProductLocationSortField[] = [
    "product_code", "product_name", "current_stock",
    "min_stock", "warehouse", "updated_at",
  ];
  const sortField = searchParams.get("sort_field");
  if (sortField && VALID_SORT_FIELDS.includes(sortField as ProductLocationSortField)) {
    filters.sort_field = sortField as ProductLocationSortField;
  }

  const sortDir = searchParams.get("sort_direction") as SortDirection | null;
  if (sortDir === "asc" || sortDir === "desc") filters.sort_direction = sortDir;

  const pageSizeParam = parseInt(searchParams.get("page_size") ?? "150", 10);
  if (!isNaN(pageSizeParam) && pageSizeParam > 0) filters.page_size = pageSizeParam;

  try {
    const result = await getProductLocations(filters, context.client);
    return NextResponse.json(result);
  } finally {
    await dispose();
  }
}

// ── POST /api/inventory/product-locations ─────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as SessionUser;

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "commerce.inventory", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!ADMIN_ROLES.includes(context.effectiveUser.role)) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
        context.client,
        context.tenantId,
      ));
    if (!location_id) {
      return NextResponse.json(
        { error: "La sesión no tiene tenant o location activos." },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
    }

    // Inyectar tenant_id y location_id EFECTIVOS antes de validar.
    // La API no acepta estos valores del cliente.
    const parsed = createProductLocationSchema.safeParse({
      ...(body as object),
      tenant_id: context.tenantId,
      location_id,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await createProductLocation(context.tenantId, location_id, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      const status = result.field ? 409 : 422;
      const payload = result.field
        ? { errors: { [result.field]: [result.error] } }
        : { error: result.error };
      return NextResponse.json(payload, { status });
    }

    return NextResponse.json(
      { id: result.id },
      { status: 201, headers: { Location: `/api/inventory/product-locations/${result.id}` } },
    );
  } finally {
    await dispose();
  }
}
