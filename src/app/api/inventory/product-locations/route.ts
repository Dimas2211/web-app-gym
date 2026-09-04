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
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { createProductLocationSchema } from "@/modules/commerce/inventory/schemas/create-product-location.schema";
import { createProductLocation } from "@/modules/commerce/inventory/services/product-location.service";
import type {
  ProductLocationFilters,
  ProductLocationSortField,
  SortDirection,
} from "@/modules/commerce/inventory/types/inventory-filters.types";
import type { StockAlertLevel } from "@/modules/commerce/inventory/types/inventory.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];
const ADMIN_ROLES  = ["super_admin", "branch_admin"];

// ── GET /api/inventory/product-locations ──────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!VIEWER_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const tenant_id = user.tenant_id;
  if (!tenant_id) {
    return NextResponse.json(
      { error: "La sesión no tiene tenant activo." },
      { status: 400 },
    );
  }

  // PASO 6A: bajo sesión runtime, la location efectiva es la primera
  // sucursal activa del tenant runtime, no la del selector del super_admin.
  const baseLocationId = await getEffectiveLocationId(user);
  const { context, dispose } = await resolveEffectiveApiContext({
    tenantId:   tenant_id,
    locationId: baseLocationId,
  });

  if (!context.locationId) {
    await dispose();
    return NextResponse.json(
      { error: "La sesión no tiene tenant o location activos." },
      { status: 400 },
    );
  }

  const commercialCtx = await resolveCommercialEnforcementContext(context.tenantId);
  try {
    assertOrganizationModule(commercialCtx, "commerce.inventory");
  } catch (err) {
    await dispose();
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }

  const { searchParams } = req.nextUrl;

  // ── Filtros ─────────────────────────────────────────────────────
  const filters: ProductLocationFilters = {
    tenant_id:   context.tenantId,
    location_id: context.locationId,
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
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return NextResponse.json({ error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
  }

  const tenant_id   = user.tenant_id;
  const location_id = await getEffectiveLocationId(user);
  if (!tenant_id || !location_id) {
    return NextResponse.json(
      { error: "La sesión no tiene tenant o location activos." },
      { status: 400 },
    );
  }

  const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
  try {
    assertOrganizationModule(commercialCtx, "commerce.inventory");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  // Inyectar tenant_id y location_id de sesión en el body antes de validar.
  // La API no acepta estos valores del cliente.
  const parsed = createProductLocationSchema.safeParse({
    ...(body as object),
    tenant_id,
    location_id,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await createProductLocation(tenant_id, location_id, user.id, parsed.data);

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
}
