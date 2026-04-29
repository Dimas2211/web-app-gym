// ─────────────────────────────────────────────────────────────────
// commerce/products — get-product-summary.ts
//
// Panel de detalle de un producto: datos maestros + stubs honestos
// de inventario y trazabilidad.
//
// Bloques de estado pendiente:
//   stock         → NOT_IMPLEMENTED hasta Etapa 12 (commerce/inventory)
//   traceability  → NOT_IMPLEMENTED por pestaña hasta Etapas 12-14
//
// El discriminant `available: false` hace imposible que la UI trate
// el stub como datos reales sin introducir un bug visible en tipos.
// ─────────────────────────────────────────────────────────────────

import { getProductById } from "./get-product-by-id";
import type { ProductSummary } from "../types/product-summary.types";
import {
  PRODUCT_STOCK_STUB,
  PRODUCT_TRACEABILITY_STUBS,
} from "../types/product-summary.types";

/**
 * Devuelve los datos completos del panel de detalle de un producto.
 *
 * - Datos maestros: venidos de `getProductById` (joins de clasificación
 *   y logística incluidos).
 * - Bloque de stock: stub con `available: false` hasta commerce/inventory.
 * - Trazabilidad: cada pestaña tiene estado `NOT_IMPLEMENTED` explícito
 *   con la etapa en la que estará disponible.
 *
 * Retorna null si el producto no existe o no pertenece al tenant.
 *
 * @param tenantId - Extraído de session.tenantId. Nunca del body del cliente.
 * @param id       - UUID del producto.
 */
export async function getProductSummary(
  tenantId: string,
  id: string
): Promise<ProductSummary | null> {
  const product = await getProductById(tenantId, id);

  if (!product) return null;

  return {
    ...product,

    // ── Bloque de inventario ─────────────────────────────────────
    // available: false → el módulo commerce/inventory no existe todavía.
    // La UI debe leer el discriminant antes de intentar acceder a .data.
    stock: PRODUCT_STOCK_STUB,

    // ── Trazabilidad ─────────────────────────────────────────────
    // Cada pestaña expone su estado NOT_IMPLEMENTED y la etapa en que
    // estará disponible. No son arrays vacíos: son stubs estructurados.
    traceability: PRODUCT_TRACEABILITY_STUBS,
  };
}
