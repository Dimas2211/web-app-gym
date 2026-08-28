// ─────────────────────────────────────────────────────────────────
// commerce/products — get-products.ts
//
// Lista paginada del catálogo maestro de un tenant.
// Soporta búsqueda por código, búsqueda por nombre, filtros
// estructurados (incluyendo proveedor y marca), ordenamientos
// simples y compuestos, y paginación defensiva.
//
// Sorts compuestos soportados:
//   line_name     → [line.name, name]
//   line_code     → [line.name, product_code]
//   supplier_name → [supplier.name, name]
//
// Sin lógica de inventory, purchases ni sales.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { ProductListItem } from "../types/product.types";
import type {
  ProductQueryParams,
  ProductListResult,
  ProductSort,
} from "../types/product-filters.types";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
// 250 permite cargar catálogos operativos completos en una sola grilla.
// TODO: virtualización cuando catálogos superen 500 productos.
const MAX_PAGE_SIZE = 250;

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Construye el orderBy de Prisma según el campo de sort.
 * Los sorts compuestos devuelven array para respetar el orden
 * jerárquico definido en la especificación funcional.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOrderBy(sort?: ProductSort): any {
  const d = sort?.direction ?? "asc";
  switch (sort?.field) {
    // Sorts compuestos: línea + nombre, línea + código, proveedor + nombre
    case "line_name":
      return [{ line: { name: d } }, { name: d }];
    case "line_code":
      return [{ line: { name: d } }, { product_code: d }];
    case "supplier_name":
      return [{ supplier: { name: d } }, { name: d }];
    // Sorts simples
    default:
      return { [sort?.field ?? "name"]: d };
  }
}

function buildWhere(tenantId: string, params: ProductQueryParams) {
  const { filters = {} } = params;

  return {
    tenant_id: tenantId,

    // Búsqueda separada por código y por nombre (AND si ambos presentes)
    ...(filters.search_code?.trim() && {
      product_code: {
        contains: filters.search_code.trim(),
        mode: "insensitive" as const,
      },
    }),
    ...(filters.search_name?.trim() && {
      name: {
        contains: filters.search_name.trim(),
        mode: "insensitive" as const,
      },
    }),

    // Filtros estructurados
    ...(filters.status       && { status: filters.status }),
    ...(filters.product_type && { product_type: filters.product_type }),
    ...(filters.category_id  && { category_id: filters.category_id }),
    ...(filters.line_id      && { line_id: filters.line_id }),
    ...(filters.subline_id   && { subline_id: filters.subline_id }),
    ...(filters.supplier_id  && { supplier_id: filters.supplier_id }),
    ...(filters.brand?.trim() && {
      brand: {
        contains: filters.brand.trim(),
        mode: "insensitive" as const,
      },
    }),
    ...(filters.is_stockable !== undefined && {
      is_stockable: filters.is_stockable,
    }),
    ...(filters.allow_purchase !== undefined && {
      allow_purchase: filters.allow_purchase,
    }),
    ...(filters.allow_sale !== undefined && {
      allow_sale: filters.allow_sale,
    }),
  };
}

// ── Query principal ───────────────────────────────────────────────

/**
 * Devuelve la lista paginada de productos del catálogo de un tenant.
 *
 * @param tenantId - Extraído de session.tenantId. Nunca del body del cliente.
 * @param params   - Filtros, ordenamiento y paginación opcionales.
 * @param client   - Cliente Prisma a usar. Por defecto el Prisma global de la
 *                   app. Los callers runtime-aware (PASO 4 — Plataforma
 *                   Multiindustria) pueden pasar un PrismaClient resuelto vía
 *                   withRuntimePrisma para leer una base cliente distinta.
 *                   Nunca cambia el comportamiento de los callers existentes.
 */
export async function getProducts(
  tenantId: string,
  params: ProductQueryParams = {},
  client: PrismaClient = prisma
): Promise<ProductListResult<ProductListItem>> {
  const { sort, pagination } = params;

  // Paginación defensiva: mínimo 1, máximo MAX_PAGE_SIZE
  const page = Math.max(1, pagination?.page ?? DEFAULT_PAGE);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, pagination?.pageSize ?? DEFAULT_PAGE_SIZE)
  );
  const skip = (page - 1) * pageSize;

  const where = buildWhere(tenantId, params);

  // Ejecutar count y findMany en la misma transacción para consistencia
  const [rows, total] = await client.$transaction([
    client.product.findMany({
      where,
      select: {
        id: true,
        product_code: true,
        name: true,
        product_type: true,
        status: true,
        brand: true,
        sku: true,
        sale_price: true,
        is_stockable: true,
        allow_purchase: true,
        allow_sale: true,
        created_at: true,
        // Joins para columnas del grid maestro
        category:  { select: { id: true, name: true } },
        line:      { select: { id: true, name: true } },
        subline:   { select: { id: true, name: true } },
        unit:      { select: { id: true, name: true, symbol: true } },
        supplier:  { select: { id: true, name: true } },
        tax_rate:  { select: { id: true, rate: true } },
      },
      orderBy: buildOrderBy(sort),
      skip,
      take: pageSize,
    }),
    client.product.count({ where }),
  ]);

  // Mapper explícito campo por campo: evita que un Decimal nuevo en la tabla
  // pase sin convertir si en el futuro se amplía el select.
  const items: ProductListItem[] = rows.map((row) => ({
    id:           row.id,
    product_code: row.product_code,
    name:         row.name,
    product_type: row.product_type,
    status:       row.status,
    category:     row.category,
    line:         row.line    ?? null,
    subline:      row.subline ?? null,
    brand:        row.brand,
    unit:         row.unit,
    supplier:     row.supplier ?? null,
    sku:          row.sku,
    sale_price:   row.sale_price !== null ? Number(row.sale_price) : null,
    tax_rate:     row.tax_rate
      ? { id: row.tax_rate.id, rate: Number(row.tax_rate.rate) }
      : null,
    is_stockable:   row.is_stockable,
    allow_purchase: row.allow_purchase,
    allow_sale:     row.allow_sale,
    created_at:     row.created_at,
  }));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
