// ─────────────────────────────────────────────────────────────────
// commerce/inventory — get-product-movement-report.ts
//
// Consulta de movimientos de inventario INDIVIDUAL POR PRODUCTO
// (Kardex operativo). Usada por Commerce → Consultas y reportes →
// Movimientos por producto, y por sus exportaciones Excel/PDF.
//
// Reutiliza getInventoryMovements (mismo mapper y misma resolución de
// Documento/Correlativo que la pestaña Movimientos de Productos).
//
// Seguridad:
//   - tenant_id / location_id vienen SIEMPRE del contexto operacional
//     resuelto en servidor (nunca del navegador).
//   - El producto se valida contra el tenant efectivo antes de leer
//     movimientos: un product_id de otro tenant responde "no encontrado".
//   - Los movimientos se filtran por tenant_id + location_id + product_id.
//
// Orden: cronológico ascendente (created_at, id) — determinista.
// Exportación: devuelve TODAS las filas del filtro hasta
// MOVEMENT_EXPORT_MAX_ROWS; si el filtro excede el límite, se rechaza
// explícitamente (nunca se genera un archivo parcial en silencio).
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { getLocationById } from "@/core/modules/locations/queries";
import type { InventoryMovementItem, MovementType } from "../types/inventory-movement.types";
import {
  getInventoryMovements,
  MOVEMENT_EXPORT_MAX_ROWS,
} from "./get-inventory-movements";
import {
  formatSvDateParam,
  formatSvDateTime,
  svEndOfDay,
  svStartOfDay,
} from "../utils/sv-datetime";

export const PRODUCT_MOVEMENT_PAGE_SIZE = 50;
export const PRODUCT_MOVEMENT_MAX_PAGE_SIZE = 200;

export interface ProductMovementReportParams {
  tenantId: string;
  locationId: string;
  productId: string;
  /** "aaaa-mm-dd", día local de El Salvador. */
  dateFrom?: string;
  dateTo?: string;
  movementType?: MovementType;
  page?: number;
  pageSize?: number;
  /** true = todas las filas del filtro (Excel/PDF). */
  exportAll?: boolean;
}

export interface ProductMovementReportHeader {
  product: { id: string; product_code: string; name: string };
  location: { id: string; name: string };
  date_from: string | null;
  date_to: string | null;
  date_from_label: string | null;
  date_to_label: string | null;
  movement_type: MovementType | null;
  generated_at_label: string;
}

export interface ProductMovementReport extends ProductMovementReportHeader {
  items: InventoryMovementItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export type ProductMovementReportResult =
  | { ok: true; report: ProductMovementReport }
  | { ok: false; code: "PRODUCT_NOT_FOUND" | "LOCATION_NOT_FOUND"; error: string }
  | { ok: false; code: "EXPORT_TOO_LARGE"; error: string; total: number; limit: number };

export async function getProductMovementReport(
  params: ProductMovementReportParams,
  client: PrismaClient,
): Promise<ProductMovementReportResult> {
  const { tenantId, locationId, productId } = params;

  const [product, location] = await Promise.all([
    client.product.findFirst({
      where: { id: productId, tenant_id: tenantId },
      select: { id: true, product_code: true, name: true },
    }),
    getLocationById(locationId, tenantId, client),
  ]);

  if (!product) {
    return { ok: false, code: "PRODUCT_NOT_FOUND", error: "Producto no encontrado." };
  }
  if (!location) {
    return { ok: false, code: "LOCATION_NOT_FOUND", error: "La sucursal activa no es válida." };
  }

  const pageSize = params.exportAll
    ? MOVEMENT_EXPORT_MAX_ROWS
    : Math.min(PRODUCT_MOVEMENT_MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? PRODUCT_MOVEMENT_PAGE_SIZE));

  const result = await getInventoryMovements(
    {
      tenant_id:      tenantId,
      location_id:    locationId,
      product_id:     product.id,
      movement_type:  params.movementType,
      date_from:      params.dateFrom ? svStartOfDay(params.dateFrom) : undefined,
      date_to:        params.dateTo ? svEndOfDay(params.dateTo) : undefined,
      sort_field:     "created_at",
      sort_direction: "asc",
      page:           params.exportAll ? 1 : params.page,
      page_size:      pageSize,
    },
    client,
    { maxPageSize: params.exportAll ? MOVEMENT_EXPORT_MAX_ROWS : PRODUCT_MOVEMENT_MAX_PAGE_SIZE },
  );

  if (params.exportAll && result.total > MOVEMENT_EXPORT_MAX_ROWS) {
    return {
      ok: false,
      code: "EXPORT_TOO_LARGE",
      error:
        `El filtro contiene ${result.total} movimientos y la exportación admite hasta ` +
        `${MOVEMENT_EXPORT_MAX_ROWS}. Acotá el período o el tipo de movimiento para exportar el historial completo.`,
      total: result.total,
      limit: MOVEMENT_EXPORT_MAX_ROWS,
    };
  }

  return {
    ok: true,
    report: {
      product,
      location: { id: location.id, name: location.name },
      date_from:          params.dateFrom ?? null,
      date_to:            params.dateTo ?? null,
      date_from_label:    params.dateFrom ? formatSvDateParam(params.dateFrom) : null,
      date_to_label:      params.dateTo ? formatSvDateParam(params.dateTo) : null,
      movement_type:      params.movementType ?? null,
      generated_at_label: formatSvDateTime(new Date()),
      items:              result.items,
      total:              result.total,
      page:               result.page,
      page_size:          result.page_size,
      total_pages:        Math.max(1, Math.ceil(result.total / result.page_size)),
    },
  };
}
