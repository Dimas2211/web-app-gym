// ─────────────────────────────────────────────────────────────────
// commerce/inventory — inventory-movement-labels.ts
//
// Fuente única de etiquetas en español para movimientos de inventario.
// Consumido por: pestaña Movimientos de Productos, consulta de
// movimientos por producto (Commerce → Consultas y reportes) y las
// exportaciones Excel/PDF. Ninguna superficie debe imprimir el enum
// técnico (PURCHASE_IN, ADDITIVE, ...).
//
// Semántica real de los tipos en el sistema:
//   PURCHASE_IN  → confirmación de compra (purchase.service)
//   RETURN_OUT   → reversión por anulación de compra confirmada
//   SALE_OUT     → confirmación de venta (sale.service)
//   RETURN_IN    → reingreso por anulación de venta confirmada
//   INITIAL_LOAD / MANUAL_* / ADJUSTMENT_* → registro manual u onboarding
// ─────────────────────────────────────────────────────────────────

import type { MovementDirection, MovementType } from "../types/inventory-movement.types";

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  PURCHASE_IN:     "Entrada por compra",
  SALE_OUT:        "Salida por venta",
  MANUAL_IN:       "Entrada manual",
  MANUAL_OUT:      "Salida manual",
  INITIAL_LOAD:    "Carga inicial",
  ADJUSTMENT_UP:   "Ajuste positivo",
  ADJUSTMENT_DOWN: "Ajuste negativo",
  TRANSFER_IN:     "Entrada por traslado",
  TRANSFER_OUT:    "Salida por traslado",
  RETURN_IN:       "Entrada por devolución",
  RETURN_OUT:      "Salida por devolución",
};

export const MOVEMENT_DIRECTION_LABELS: Record<MovementDirection, string> = {
  ADDITIVE:    "Entrada",
  SUBTRACTIVE: "Salida",
};

/** Opciones para el filtro "Tipo de movimiento" (orden operativo). */
export const MOVEMENT_TYPE_OPTIONS: { value: MovementType; label: string }[] = (
  [
    "PURCHASE_IN", "SALE_OUT", "INITIAL_LOAD", "MANUAL_IN", "MANUAL_OUT",
    "ADJUSTMENT_UP", "ADJUSTMENT_DOWN", "RETURN_IN", "RETURN_OUT",
    "TRANSFER_IN", "TRANSFER_OUT",
  ] as MovementType[]
).map((value) => ({ value, label: MOVEMENT_TYPE_LABELS[value] }));

export const ALL_MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[];

export function getMovementTypeLabel(type: MovementType | string): string {
  return MOVEMENT_TYPE_LABELS[type as MovementType] ?? "Otro movimiento";
}

export function getMovementDirectionLabel(direction: MovementDirection): string {
  return MOVEMENT_DIRECTION_LABELS[direction];
}
