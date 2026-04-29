// ─────────────────────────────────────────────────────────────────
// commerce/products — product-summary.types.ts
//
// Tipos del panel resumen de un producto.
//
// El bloque de inventario usa un discriminated union para distinguir
// explícitamente entre "módulo no implementado" y "datos reales".
// Esto hace imposible que la UI trate accidentalmente un stub como
// datos reales.
//
// stock.available === false → módulo inventory no implementado (Etapa 12)
// stock.available === true  → datos reales de stock por sucursal
// ─────────────────────────────────────────────────────────────────

import type { Product } from "./product.types";

// ── Bloque de inventario (discriminated union) ───────────────────

/**
 * Datos de stock reales por sucursal.
 * Solo se usa cuando available === true (Etapa 12+).
 */
export interface StockData {
  current_stock: number;
  min_stock: number;
  reorder_quantity: number;
  location: {
    id: string;
    name: string;
  };
}

/**
 * Bloque de inventario del panel resumen.
 *
 * Variante stub (Etapa 11 — primer corte):
 *   { available: false; reason: 'INVENTORY_MODULE_NOT_IMPLEMENTED' }
 *
 * Variante real (Etapa 12+):
 *   { available: true; data: StockData }
 */
export type ProductSummaryStockBlock =
  | {
      available: false;
      reason: "INVENTORY_MODULE_NOT_IMPLEMENTED";
    }
  | {
      available: true;
      data: StockData;
    };

// ── Estado de trazabilidad por pestaña ───────────────────────────

/**
 * Estado de cada pestaña de trazabilidad en el panel inferior.
 * NOT_IMPLEMENTED → el módulo correspondiente no existe todavía.
 */
export type TraceabilityStubStatus = "NOT_IMPLEMENTED";

export interface TraceabilityTab {
  status: TraceabilityStubStatus;
  /** Etapa en la que el módulo será implementado */
  availableInStage: string;
  /** Nombre descriptivo del módulo pendiente */
  moduleName: string;
}

export interface ProductTraceabilityStubs {
  sales: TraceabilityTab;
  purchases: TraceabilityTab;
  inventoryMovements: TraceabilityTab;
}

// ── Tipo del panel resumen completo ─────────────────────────────

/**
 * Datos completos del panel de detalle de un producto.
 * Combina la entidad Product con los bloques de trazabilidad
 * que tienen estado explícito (no arrays vacíos).
 */
export interface ProductSummary extends Product {
  stock: ProductSummaryStockBlock;
  traceability: ProductTraceabilityStubs;
}

// ── Constante de stubs por defecto ──────────────────────────────

/**
 * Stubs de trazabilidad para el primer corte (Etapa 11).
 * Se inyectan directamente en get-product-summary.ts.
 */
export const PRODUCT_TRACEABILITY_STUBS: ProductTraceabilityStubs = {
  sales: {
    status: "NOT_IMPLEMENTED",
    availableInStage: "Etapa 14",
    moduleName: "commerce/sales",
  },
  purchases: {
    status: "NOT_IMPLEMENTED",
    availableInStage: "Etapa 13",
    moduleName: "commerce/purchases",
  },
  inventoryMovements: {
    status: "NOT_IMPLEMENTED",
    availableInStage: "Etapa 12",
    moduleName: "commerce/inventory",
  },
};

/**
 * Bloque de stock para el primer corte.
 * Se inyecta en get-product-summary.ts hasta que se implemente inventory.
 */
export const PRODUCT_STOCK_STUB: ProductSummaryStockBlock = {
  available: false,
  reason: "INVENTORY_MODULE_NOT_IMPLEMENTED",
};
