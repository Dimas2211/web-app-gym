// ─────────────────────────────────────────────────────────────────
// commerce/inventory — inventory-movement.types.ts
//
// Tipos relacionados con el historial de movimientos de inventario.
//
// MovementType se redefine aquí como string union (mismo patrón
// que ProductType/ProductStatus en product.types.ts) para desacoplar
// la capa de tipos del cliente Prisma generado.
// ─────────────────────────────────────────────────────────────────

// ── Tipo de movimiento ───────────────────────────────────────────
//
// Refleja exactamente el enum MovementType de schema.prisma.
// Etapa 11 implementa solo los primeros 5.
// Los restantes están reservados para integración futura.

export type MovementType =
  // Operaciones activas en Etapa 11
  | "INITIAL_LOAD"    // carga inicial de existencias
  | "MANUAL_IN"       // entrada manual autorizada
  | "MANUAL_OUT"      // salida manual autorizada
  | "ADJUSTMENT_UP"   // ajuste positivo por conteo físico
  | "ADJUSTMENT_DOWN" // ajuste negativo por conteo físico
  // Reservados — integración futura
  | "PURCHASE_IN"     // entrada por orden de compra
  | "SALE_OUT"        // salida por venta
  | "TRANSFER_IN"     // entrada por transferencia entre locations
  | "TRANSFER_OUT"    // salida por transferencia entre locations
  | "RETURN_IN"       // devolución recibida
  | "RETURN_OUT";     // devolución enviada

// ── Dirección del movimiento ─────────────────────────────────────
//
// La dirección determina si el movimiento suma o resta del saldo.
// No se almacena en la DB — se deriva de movement_type vía
// ADDITIVE_MOVEMENT_TYPES y SUBTRACTIVE_MOVEMENT_TYPES (record-movement.schema.ts).

export type MovementDirection = "ADDITIVE" | "SUBTRACTIVE";

// ── Proyección para tabla de historial ───────────────────────────

/**
 * Fila del historial de movimientos de inventario.
 * movement_direction es derivado; no vive en la DB.
 */
export interface InventoryMovementItem {
  id: string;
  tenant_id: string;
  location_id: string;
  product_id: string;
  product_location_id: string;

  // Desnormalizados desde Product (resueltos en la query)
  product_code: string;
  product_name: string;

  // Datos del movimiento
  movement_type: MovementType;
  movement_direction: MovementDirection; // derivado
  quantity: number;                      // siempre positivo
  unit_cost: number | null;

  // Saldos materializados en el momento del movimiento
  stock_before: number;
  resulting_stock: number;

  // Referencia documental opcional
  reference_entity: string | null;
  reference_id: string | null;
  reference_code: string | null;

  // Observaciones
  notes: string | null;

  // Auditoría
  performed_by: string | null;
  performed_by_name: string | null; // desnormalizado desde User
  created_at: Date;
  /** String preformateado en el servidor. Evita hydration mismatch por Intl locale-sensitive. */
  created_at_label: string;
}

// ── Resumen de movimientos para un product_location ──────────────

export interface ProductLocationMovementSummary {
  product_location_id: string;
  total_movements: number;
  last_movement_at: Date | null;
  last_movement_type: MovementType | null;
}
