export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/inventory/movements/[id]
// Detalle de un movimiento individual dentro del scope de sesión.
// Solo lectura — los movimientos son registros inmutables.
// No implementa PATCH ni DELETE.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { getMovementDirection } from "@/modules/commerce/inventory/utils/movement-direction.utils";
import type { MovementType } from "@/modules/commerce/inventory/types/inventory-movement.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

const VIEWER_ROLES = ["super_admin", "branch_admin", "reception"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const { tenantId: scoped_tenant_id, locationId: scoped_location_id, client } = context;

  try {
  const commercialCtx = await resolveCommercialEnforcementContext(scoped_tenant_id);
  try {
    assertOrganizationModule(commercialCtx, "commerce.inventory");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }

  // Consulta directa con select mínimo — no hay query reutilizable de detalle
  // individual en el módulo (get-inventory-movements devuelve lista).
  // Los campos Decimal se convierten a number antes de serializar.
  const row = await client.inventoryMovement.findFirst({
    where: { id, tenant_id: scoped_tenant_id, location_id: scoped_location_id },
    select: {
      id:                  true,
      tenant_id:           true,
      location_id:         true,
      product_id:          true,
      product_location_id: true,
      movement_type:       true,
      quantity:            true,
      unit_cost:           true,
      stock_before:        true,
      resulting_stock:     true,
      reference_entity:    true,
      reference_id:        true,
      reference_code:      true,
      notes:               true,
      performed_by:        true,
      created_at:          true,
      product: {
        select: { product_code: true, name: true },
      },
      performed_by_user: {
        select: { first_name: true, last_name: true },
      },
    },
  });

  if (!row) {
    return NextResponse.json(
      { error: "Movimiento no encontrado." },
      { status: 404 },
    );
  }

  const movement_type = row.movement_type as MovementType;

  return NextResponse.json({
    id:                  row.id,
    tenant_id:           row.tenant_id,
    location_id:         row.location_id,
    product_id:          row.product_id,
    product_location_id: row.product_location_id,
    product_code:        row.product.product_code,
    product_name:        row.product.name,
    movement_type,
    movement_direction:  getMovementDirection(movement_type),
    quantity:            Number(row.quantity),
    unit_cost:           row.unit_cost !== null ? Number(row.unit_cost) : null,
    stock_before:        Number(row.stock_before),
    resulting_stock:     Number(row.resulting_stock),
    reference_entity:    row.reference_entity,
    reference_id:        row.reference_id,
    reference_code:      row.reference_code,
    notes:               row.notes,
    performed_by:        row.performed_by,
    performed_by_name:   row.performed_by_user
      ? `${row.performed_by_user.first_name} ${row.performed_by_user.last_name}`.trim()
      : null,
    created_at:          row.created_at,
  });
  } finally {
    await dispose();
  }
}
