// ─────────────────────────────────────────────────────────────────
// commerce/inventory — get-inventory-movements.ts
//
// Historial cronológico de movimientos de inventario para una
// location. Usado por la grilla de historial del módulo.
//
// Orden por defecto: created_at DESC (más recientes primero).
// Soporta filtros por producto, tipo y rango de fechas.
// Sin paginación visual clásica: límite técnico con scroll continuo.
//
// Los movimientos son registros inmutables — esta query es solo lectura.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { InventoryMovementFilters } from "../types/inventory-filters.types";
import type { InventoryMovementItem } from "../types/inventory-movement.types";
import { getMovementDirection } from "../utils/movement-direction.utils";
import { formatDateLabel } from "../utils/format-date-label";

const DEFAULT_PAGE_SIZE = 150;
const MAX_PAGE_SIZE     = 500;

// ── Select reutilizable ──────────────────────────────────────────

const INVENTORY_MOVEMENT_SELECT = {
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
    select: {
      product_code: true,
      name:         true,
    },
  },
  performed_by_user: {
    select: {
      first_name: true,
      last_name:  true,
    },
  },
} as const;

// ── Tipo interno ─────────────────────────────────────────────────

type RawMovementRow = Awaited<
  ReturnType<
    typeof prisma.inventoryMovement.findFirst<{
      select: typeof INVENTORY_MOVEMENT_SELECT;
    }>
  >
>;

export interface InventoryMovementListResult {
  items: InventoryMovementItem[];
  /** Total de movimientos que cumplen los filtros activos. */
  total: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function buildWhere(filters: InventoryMovementFilters) {
  const { tenant_id, location_id, product_id, product_location_id,
          movement_type, date_from, date_to, performed_by } = filters;

  return {
    tenant_id,
    location_id,
    ...(product_id          && { product_id }),
    ...(product_location_id && { product_location_id }),
    ...(movement_type       && { movement_type }),
    ...(performed_by        && { performed_by }),
    ...((date_from || date_to) && {
      created_at: {
        ...(date_from && { gte: date_from }),
        ...(date_to   && { lte: date_to }),
      },
    }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOrderBy(filters: InventoryMovementFilters): any {
  const d = filters.sort_direction ?? "desc";
  switch (filters.sort_field) {
    case "movement_type":   return { movement_type: d };
    case "quantity":        return { quantity: d };
    case "resulting_stock": return { resulting_stock: d };
    case "product_code":    return { product: { product_code: d } };
    case "created_at":
    default:                return { created_at: d };
  }
}

function mapToInventoryMovementItem(
  row: NonNullable<RawMovementRow>,
): InventoryMovementItem {
  // performed_by_name: concat si existe el usuario relacionado
  const performedByName = row.performed_by_user
    ? `${row.performed_by_user.first_name} ${row.performed_by_user.last_name}`.trim()
    : null;

  return {
    id:                  row.id,
    tenant_id:           row.tenant_id,
    location_id:         row.location_id,
    product_id:          row.product_id,
    product_location_id: row.product_location_id,
    product_code:        row.product.product_code,
    product_name:        row.product.name,
    movement_type:       row.movement_type,
    movement_direction:  getMovementDirection(row.movement_type),
    quantity:            Number(row.quantity),
    unit_cost:           row.unit_cost !== null ? Number(row.unit_cost) : null,
    stock_before:        Number(row.stock_before),
    resulting_stock:     Number(row.resulting_stock),
    reference_entity:    row.reference_entity,
    reference_id:        row.reference_id,
    reference_code:      row.reference_code,
    notes:               row.notes,
    performed_by:        row.performed_by,
    performed_by_name:   performedByName,
    created_at:          row.created_at,
    created_at_label:    formatDateLabel(row.created_at),
  };
}

// ── Query principal ───────────────────────────────────────────────

/**
 * Devuelve el historial de movimientos de inventario para la grilla
 * de historial del módulo. Orden por defecto: más recientes primero.
 *
 * @param filters - tenant_id y location_id son obligatorios.
 */
export async function getInventoryMovements(
  filters: InventoryMovementFilters,
  client: PrismaClient = prisma,
): Promise<InventoryMovementListResult> {
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, filters.page_size ?? DEFAULT_PAGE_SIZE),
  );

  const where   = buildWhere(filters);
  const orderBy = buildOrderBy(filters);

  // total = count() del WHERE sin take; refleja el universo completo que
  // coincide con los filtros activos, independientemente del límite de fetch.
  // Útil para el footer "X de Y movimientos" en la grilla de historial.
  // Sin post-filtro en memoria: todos los filtros de esta query son Prisma-nativos.
  const [rows, total] = await client.$transaction([
    client.inventoryMovement.findMany({
      where,
      select: INVENTORY_MOVEMENT_SELECT,
      orderBy,
      take: pageSize,
    }),
    client.inventoryMovement.count({ where }),
  ]);

  return {
    items: rows.map(mapToInventoryMovementItem),
    total,
  };
}
