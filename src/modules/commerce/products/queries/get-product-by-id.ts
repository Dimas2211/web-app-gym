// ─────────────────────────────────────────────────────────────────
// commerce/products — get-product-by-id.ts
//
// Ficha completa de un producto del catálogo maestro.
// Incluye joins de clasificación y logística. Sin datos de inventory.
//
// Usa select explícito (no include) para excluir relaciones de
// auditoría (created_by_user, updated_by_user) que no forman parte
// del tipo Product y evitar deserializaciones involuntarias.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { Product } from "../types/product.types";

// ── Select reutilizable ──────────────────────────────────────────

/**
 * Proyección completa del producto para la ficha de detalle.
 * Exportado para reutilizarse en get-product-summary.ts.
 */
export const PRODUCT_FULL_SELECT = {
  // Identidad
  id: true,
  tenant_id: true,
  product_code: true,
  name: true,
  description: true,

  // Tipo y estado
  product_type: true,
  status: true,
  is_stockable: true,
  allow_purchase: true,
  allow_sale: true,

  // Clasificación
  category_id: true,
  line_id: true,
  subline_id: true,
  brand: true,

  // Logística del catálogo
  unit_id: true,
  package_unit: true,
  supplier_id: true,
  sku: true,

  // Precios (Decimal — se convierten a number en el mapper)
  cost_price: true,
  sale_price: true,
  tax_rate_id: true,

  // Auditoría
  created_at: true,
  updated_at: true,
  created_by: true,
  updated_by: true,

  // Joins de clasificación y logística
  category: { select: { id: true, code: true, name: true } },
  line: { select: { id: true, name: true } },
  subline: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, symbol: true } },
  supplier: { select: { id: true, name: true } },
  tax_rate: { select: { id: true, name: true, rate: true } },
} as const;

// ── Mapper Decimal → number ──────────────────────────────────────

type RawProductRow = Awaited<
  ReturnType<typeof prisma.product.findFirst<{ select: typeof PRODUCT_FULL_SELECT }>>
>;

/**
 * Convierte los campos Decimal de Prisma a number para serialización segura.
 * RawProductRow incluye exactamente los campos de PRODUCT_FULL_SELECT.
 */
function mapToProduct(row: NonNullable<RawProductRow>): Product {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    product_code: row.product_code,
    name: row.name,
    description: row.description,
    product_type: row.product_type,
    status: row.status,
    is_stockable: row.is_stockable,
    allow_purchase: row.allow_purchase,
    allow_sale: row.allow_sale,
    category_id: row.category_id,
    category: row.category,
    line_id: row.line_id,
    line: row.line,
    subline_id: row.subline_id,
    subline: row.subline,
    brand: row.brand,
    unit_id: row.unit_id,
    unit: row.unit,
    package_unit: row.package_unit,
    supplier_id: row.supplier_id,
    supplier: row.supplier,
    sku: row.sku,
    cost_price: row.cost_price !== null ? Number(row.cost_price) : null,
    sale_price: row.sale_price !== null ? Number(row.sale_price) : null,
    tax_rate_id: row.tax_rate_id,
    tax_rate: row.tax_rate
      ? { ...row.tax_rate, rate: Number(row.tax_rate.rate) }
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
  };
}

// ── Query principal ───────────────────────────────────────────────

/**
 * Devuelve la ficha completa de un producto validando aislamiento por tenant.
 * Retorna null si el producto no existe o no pertenece al tenant.
 *
 * @param tenantId - Extraído de session.tenantId. Nunca del body del cliente.
 * @param id       - UUID del producto.
 */
export async function getProductById(
  tenantId: string,
  id: string
): Promise<Product | null> {
  const row = await prisma.product.findFirst({
    where: { id, tenant_id: tenantId },
    select: PRODUCT_FULL_SELECT,
  });

  if (!row) return null;
  return mapToProduct(row);
}
