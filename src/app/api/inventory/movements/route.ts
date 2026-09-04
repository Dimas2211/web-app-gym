export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET  /api/inventory/movements  — historial de movimientos
// POST /api/inventory/movements  — registrar movimiento
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { getInventoryMovements } from "@/modules/commerce/inventory/queries/get-inventory-movements";
import { recordInventoryMovement } from "@/modules/commerce/inventory/services/inventory-movement.service";
import { ACTIVE_MOVEMENT_TYPES } from "@/modules/commerce/inventory/schemas/record-movement.schema";
import type {
  InventoryMovementFilters,
  InventoryMovementSortField,
  SortDirection,
} from "@/modules/commerce/inventory/types/inventory-filters.types";
import type { MovementType } from "@/modules/commerce/inventory/types/inventory-movement.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];
const ADMIN_ROLES  = ["super_admin", "branch_admin"];

// Schema de validación para el body del POST
const movementBodySchema = z.object({
  product_location_id: z.string().uuid("product_location_id debe ser un UUID válido"),
  movement_type: z.enum(ACTIVE_MOVEMENT_TYPES, {
    errorMap: () => ({
      message: `Tipo de movimiento no permitido. Valores aceptados: ${ACTIVE_MOVEMENT_TYPES.join(", ")}`,
    }),
  }),
  quantity:         z.number().positive("La cantidad debe ser mayor a cero"),
  unit_cost:        z.number().min(0).optional(),
  reference_entity: z.string().trim().optional(),
  reference_id:     z.string().trim().optional(),
  reference_code:   z.string().trim().optional(),
  notes:            z.string().trim().optional(),
});

// ── GET /api/inventory/movements ──────────────────────────────────

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
  const filters: InventoryMovementFilters = {
    tenant_id:   context.tenantId,
    location_id: context.locationId,
  };

  const productId = searchParams.get("product_id");
  if (productId) filters.product_id = productId;

  const plId = searchParams.get("product_location_id");
  if (plId) filters.product_location_id = plId;

  const mtParam = searchParams.get("movement_type");
  if (mtParam && (ACTIVE_MOVEMENT_TYPES as readonly string[]).includes(mtParam)) {
    filters.movement_type = mtParam as MovementType;
  }

  const dateFrom = searchParams.get("date_from");
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) filters.date_from = d;
  }

  const dateTo = searchParams.get("date_to");
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) filters.date_to = d;
  }

  const performedBy = searchParams.get("performed_by");
  if (performedBy) filters.performed_by = performedBy;

  // ── Ordenamiento ────────────────────────────────────────────────
  const VALID_SORT: InventoryMovementSortField[] = [
    "created_at", "movement_type", "quantity", "resulting_stock", "product_code",
  ];
  const sortField = searchParams.get("sort_field");
  if (sortField && VALID_SORT.includes(sortField as InventoryMovementSortField)) {
    filters.sort_field = sortField as InventoryMovementSortField;
  }

  const sortDir = searchParams.get("sort_direction") as SortDirection | null;
  if (sortDir === "asc" || sortDir === "desc") filters.sort_direction = sortDir;

  const pageSizeParam = parseInt(searchParams.get("page_size") ?? "150", 10);
  if (!isNaN(pageSizeParam) && pageSizeParam > 0) filters.page_size = pageSizeParam;

  try {
    const result = await getInventoryMovements(filters, context.client);
    return NextResponse.json(result);
  } finally {
    await dispose();
  }
}

// ── POST /api/inventory/movements ─────────────────────────────────

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

  const parsed = movementBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await recordInventoryMovement(
    tenant_id,
    location_id,
    user.id,
    parsed.data,
  );

  if (!result.ok) {
    // Errores de negocio: saldo negativo, registro inactivo, no encontrado
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
