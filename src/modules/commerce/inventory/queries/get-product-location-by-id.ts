// ─────────────────────────────────────────────────────────────────
// commerce/inventory — get-product-location-by-id.ts
//
// Detalle completo de un registro product_location para el panel
// lateral operativo. Incluye datos desnormalizados del catálogo
// maestro necesarios para el contexto del panel.
//
// No incluye historial de movimientos — para eso existe
// get-inventory-movements.ts filtrado por product_location_id.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { ProductLocationDetail } from "../types/inventory.types";
import { deriveStockAlertLevel } from "../types/inventory.types";
import { formatDateLabel } from "../utils/format-date-label";

// ── Select reutilizable ──────────────────────────────────────────

/**
 * Proyección completa del product_location para el panel de detalle.
 * Exportado para reutilizarse en el select de inventory-summary si hiciera falta.
 */
export const PRODUCT_LOCATION_DETAIL_SELECT = {
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
  created_at:       true,
  updated_at:       true,
  created_by:       true,
  updated_by:       true,
  product: {
    select: {
      product_code: true,
      name:         true,
      description:  true,
      product_type: true,
      status:       true,
      brand:        true,
      sku:          true,
      category:     { select: { name: true } },
      line:         { select: { name: true } },
      unit:         { select: { symbol: true } },
      supplier:     { select: { name: true } },
    },
  },
} as const;

// ── Tipo interno ─────────────────────────────────────────────────

type RawProductLocationDetailRow = Awaited<
  ReturnType<
    typeof prisma.productLocation.findFirst<{
      select: typeof PRODUCT_LOCATION_DETAIL_SELECT;
    }>
  >
>;

// ── Mapper ───────────────────────────────────────────────────────

function mapToProductLocationDetail(
  row: NonNullable<RawProductLocationDetailRow>,
): ProductLocationDetail {
  const currentStock = Number(row.current_stock);
  const minStock     = Number(row.min_stock);

  return {
    // Campos base comunes con ProductLocationItem
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

    // Campos extendidos exclusivos del detalle
    product_description: row.product.description,
    product_status:      row.product.status,
    sku:                 row.product.sku,
    brand:               row.product.brand,
    supplier_name:       row.product.supplier?.name ?? null,
    created_at:          row.created_at,
    created_at_label:    formatDateLabel(row.created_at),
    created_by:          row.created_by,
    updated_by:          row.updated_by,
  };
}

// ── Query principal ───────────────────────────────────────────────

/**
 * Devuelve el detalle completo de un product_location para el panel lateral.
 * Valida aislamiento por tenant_id y location_id.
 * Retorna null si el registro no existe o no pertenece al scope dado.
 *
 * @param id          - UUID del product_location.
 * @param tenant_id   - Extraído de session. Nunca del body del cliente.
 * @param location_id - Extraído de session/contexto de la UI.
 */
export async function getProductLocationById(
  id: string,
  tenant_id: string,
  location_id: string,
): Promise<ProductLocationDetail | null> {
  const row = await prisma.productLocation.findFirst({
    where: { id, tenant_id, location_id },
    select: PRODUCT_LOCATION_DETAIL_SELECT,
  });

  if (!row) return null;
  return mapToProductLocationDetail(row);
}
