// ─────────────────────────────────────────────────────────────────
// commerce/inventory — get-product-locations.ts
//
// Lista de registros product_locations para la grilla principal de
// stock de una location. Soporta búsqueda, filtros operativos y
// ordenamientos. Sin paginación visual clásica: se usa un límite
// técnico alto compatible con scroll continuo.
//
// Supuesto técnico — filtro por stock_alert:
//   Prisma no admite comparaciones columna-columna en WHERE
//   (ej. current_stock <= min_stock). El filtro stock_alert se
//   resuelve en memoria tras un fetch acotado por ALERT_FETCH_LIMIT.
//   Para datasets por location <= 5 000 filas esto es correcto;
//   si la escala sube, migrar ese filtro a raw SQL o vista de BD.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { ProductLocationFilters } from "../types/inventory-filters.types";
import type { ProductLocationItem } from "../types/inventory.types";
import { deriveStockAlertLevel } from "../types/inventory.types";
import { formatDateLabel } from "../utils/format-date-label";

const DEFAULT_PAGE_SIZE = 150;
const MAX_PAGE_SIZE     = 500;
// Límite de fetch cuando se necesita post-filtrar por stock_alert.
// Acotado al máximo razonable de product_locations por location.
const ALERT_FETCH_LIMIT = 5_000;

// ── Select reutilizable ──────────────────────────────────────────

const PRODUCT_LOCATION_LIST_SELECT = {
  id:               true,
  tenant_id:        true,
  location_id:      true,
  product_id:       true,
  current_stock:    true,
  min_stock:        true,
  reorder_quantity: true,
  warehouse:        true,
  shelf:            true,
  position:         true,
  is_active:        true,
  updated_at:       true,
  product: {
    select: {
      product_code: true,
      name:         true,
      product_type: true,
      category:     { select: { name: true } },
      line:         { select: { name: true } },
      unit:         { select: { symbol: true } },
    },
  },
} as const;

// ── Tipos internos ───────────────────────────────────────────────

type RawProductLocationRow = Awaited<
  ReturnType<
    typeof prisma.productLocation.findFirst<{
      select: typeof PRODUCT_LOCATION_LIST_SELECT;
    }>
  >
>;

export interface ProductLocationListResult {
  items: ProductLocationItem[];
  /** Total de filas que cumplen los filtros activos (incluido stock_alert). */
  total: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function buildWhere(filters: ProductLocationFilters) {
  const { tenant_id, location_id, is_active, warehouse, category_id,
          search_code, search_name } = filters;

  // Condiciones sobre el producto relacionado — se acumulan en un solo objeto
  // para evitar múltiples claves `product` en el WHERE que Prisma rechazaría.
  const productFilter: Record<string, unknown> = {};
  if (category_id)       productFilter.category_id  = category_id;
  if (search_code?.trim()) {
    productFilter.product_code = {
      contains: search_code.trim(),
      mode: "insensitive",
    };
  }
  if (search_name?.trim()) {
    productFilter.name = {
      contains: search_name.trim(),
      mode: "insensitive",
    };
  }

  return {
    tenant_id,
    location_id,
    ...(is_active !== undefined && { is_active }),
    ...(warehouse?.trim() && {
      warehouse: { contains: warehouse.trim(), mode: "insensitive" as const },
    }),
    ...(Object.keys(productFilter).length > 0 && { product: productFilter }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOrderBy(filters: ProductLocationFilters): any {
  const d = filters.sort_direction ?? "asc";
  switch (filters.sort_field) {
    case "product_code":  return { product: { product_code: d } };
    case "product_name":  return { product: { name: d } };
    case "current_stock": return { current_stock: d };
    case "min_stock":     return { min_stock: d };
    case "warehouse":     return { warehouse: d };
    case "updated_at":    return { updated_at: d };
    default:              return { product: { product_code: "asc" as const } };
  }
}

function mapToProductLocationItem(
  row: NonNullable<RawProductLocationRow>,
): ProductLocationItem {
  const currentStock = Number(row.current_stock);
  const minStock     = Number(row.min_stock);

  return {
    id:               row.id,
    tenant_id:        row.tenant_id,
    location_id:      row.location_id,
    product_id:       row.product_id,
    product_code:     row.product.product_code,
    product_name:     row.product.name,
    product_type:     row.product.product_type,
    category_name:    row.product.category.name,
    line_name:        row.product.line?.name ?? null,
    unit_symbol:      row.product.unit.symbol,
    current_stock:    currentStock,
    min_stock:        minStock,
    reorder_quantity: Number(row.reorder_quantity),
    warehouse:        row.warehouse,
    shelf:            row.shelf,
    position:         row.position,
    is_active:        row.is_active,
    stock_alert:      deriveStockAlertLevel(currentStock, minStock),
    updated_at:       row.updated_at,
    updated_at_label: formatDateLabel(row.updated_at),
  };
}

// ── Query principal ───────────────────────────────────────────────

/**
 * Devuelve la lista de product_locations para la grilla principal de inventory.
 *
 * @param filters - tenant_id y location_id son obligatorios.
 *                  El resto de filtros son opcionales.
 */
export async function getProductLocations(
  filters: ProductLocationFilters,
): Promise<ProductLocationListResult> {
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, filters.page_size ?? DEFAULT_PAGE_SIZE),
  );

  const where   = buildWhere(filters);
  const orderBy = buildOrderBy(filters);

  // Cuando se filtra por stock_alert se necesita un fetch más amplio
  // porque Prisma no puede aplicar esa condición en WHERE directamente.
  const fetchLimit = filters.stock_alert ? ALERT_FETCH_LIMIT : pageSize;

  const rows = await prisma.productLocation.findMany({
    where,
    select: PRODUCT_LOCATION_LIST_SELECT,
    orderBy,
    take: fetchLimit,
  });

  let items = rows.map(mapToProductLocationItem);

  // Post-filtro por stock_alert en memoria.
  // Razón: Prisma no admite WHERE columna-columna (current_stock <= min_stock).
  // El fetch previo usa ALERT_FETCH_LIMIT para acotar el set antes de filtrar.
  if (filters.stock_alert) {
    items = items.filter((item) => item.stock_alert === filters.stock_alert);
  }

  // total = cantidad real que cumple TODOS los filtros activos, incluido stock_alert.
  // No es el count() del WHERE de Prisma (que ignoraría el post-filtro).
  // La UI puede usarlo para el footer "X de Y productos" del scroll.
  const sliced = items.slice(0, pageSize);
  return { items: sliced, total: items.length };
}
