// ─────────────────────────────────────────────────────────────────
// commerce/inventory — get-inventory-movements.ts
//
// Historial cronológico de movimientos de inventario para una
// location. Usado por la grilla de historial del módulo.
//
// Orden por defecto: created_at DESC (más recientes primero).
// Desempate determinista por id cuando varios movimientos comparten
// created_at (mismo orden en pantalla, Excel y PDF).
// Soporta filtros por producto, tipo, rango de fechas y paginación
// por offset (page/page_size).
//
// Fuente única de verdad de las filas de movimientos: la pestaña
// Movimientos de Productos, la consulta de movimientos por producto y
// sus exportaciones usan este mapper, incluida la resolución de
// Documento/Correlativo (resolve-movement-documents.ts).
//
// Los movimientos son registros inmutables — esta query es solo lectura.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { InventoryMovementFilters } from "../types/inventory-filters.types";
import type { InventoryMovementItem } from "../types/inventory-movement.types";
import { getMovementDirection } from "../utils/movement-direction.utils";
import { formatSvDateTime } from "../utils/sv-datetime";
import {
  resolveMovementDocuments,
  type MovementDocumentInfo,
} from "./resolve-movement-documents";

const DEFAULT_PAGE_SIZE = 150;
const MAX_PAGE_SIZE     = 500;

/** Límite duro de filas para exportaciones completas de un producto. */
export const MOVEMENT_EXPORT_MAX_ROWS = 5000;

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
  /** Página devuelta (1-based) y tamaño efectivo aplicado. */
  page: number;
  page_size: number;
}

export interface GetInventoryMovementsOptions {
  /**
   * Tope de page_size. Default MAX_PAGE_SIZE (grillas). Las exportaciones
   * por producto lo elevan hasta MOVEMENT_EXPORT_MAX_ROWS.
   */
  maxPageSize?: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function buildWhere(filters: InventoryMovementFilters) {
  const { tenant_id, location_id, product_id, product_location_id,
          movement_type, date_from, date_to, performed_by } = filters;

  return {
    tenant_id,
    location_id,
    ...(product_id          && { product_id }),
    ...(filters.product_search && { product: { OR: [ { product_code: { contains: filters.product_search, mode: "insensitive" as const } }, { name: { contains: filters.product_search, mode: "insensitive" as const } } ] } }),
    ...(filters.reference_search && { reference_code: { contains: filters.reference_search, mode: "insensitive" as const } }),
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
  let primary;
  switch (filters.sort_field) {
    case "movement_type":   primary = { movement_type: d }; break;
    case "quantity":        primary = { quantity: d }; break;
    case "resulting_stock": primary = { resulting_stock: d }; break;
    case "product_code":    primary = { product: { product_code: d } }; break;
    case "created_at":
    default:                primary = { created_at: d }; break;
  }
  // Desempate determinista: created_at y luego id.
  return filters.sort_field && filters.sort_field !== "created_at"
    ? [primary, { created_at: d }, { id: d }]
    : [primary, { id: d }];
}

const NO_DOCUMENT: MovementDocumentInfo = { document_number: null, correlative: null };

function mapToInventoryMovementItem(
  row: NonNullable<RawMovementRow>,
  doc: MovementDocumentInfo,
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
    document_number:     doc.document_number,
    correlative:         doc.correlative,
    notes:               row.notes,
    performed_by:        row.performed_by,
    performed_by_name:   performedByName,
    created_at:          row.created_at,
    created_at_label:    formatSvDateTime(row.created_at),
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
  options: GetInventoryMovementsOptions = {},
): Promise<InventoryMovementListResult> {
  const pageSize = Math.min(
    options.maxPageSize ?? MAX_PAGE_SIZE,
    Math.max(1, filters.page_size ?? DEFAULT_PAGE_SIZE),
  );
  const page = Math.max(1, Math.floor(filters.page ?? 1));

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
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    client.inventoryMovement.count({ where }),
  ]);

  // Una consulta por lote para compras y otra para ventas — nunca por fila.
  const docs = await resolveMovementDocuments(rows, filters.tenant_id, client);

  return {
    items: rows.map((row) => mapToInventoryMovementItem(row, docs.get(row.id) ?? NO_DOCUMENT)),
    total,
    page,
    page_size: pageSize,
  };
}
