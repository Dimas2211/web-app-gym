// ─────────────────────────────────────────────────────────────────
// commerce/inventory — movement-direction.utils.ts
//
// Clasificación de dirección de movimientos de inventario.
// Fuente única de verdad para la lógica suma/resta del saldo.
//
// Importado por: queries, actions y schemas del módulo inventory.
// No importa Zod ni Prisma — es lógica de dominio puro.
// ─────────────────────────────────────────────────────────────────

import type { MovementType } from "../types/inventory-movement.types";

// ── Clasificación de dirección ───────────────────────────────────
//
// Cubre TODOS los MovementType (activos + futuros) para que el
// historial de cualquier etapa pueda derivar la dirección correcta
// sin modificar este archivo cuando lleguen Etapas 13/14.

export const ADDITIVE_MOVEMENT_TYPES = new Set<MovementType>([
  "INITIAL_LOAD",
  "MANUAL_IN",
  "ADJUSTMENT_UP",
  "PURCHASE_IN",  // reservado — Etapa 13
  "TRANSFER_IN",  // reservado — futuro
  "RETURN_IN",    // reservado — futuro
]);

export const SUBTRACTIVE_MOVEMENT_TYPES = new Set<MovementType>([
  "MANUAL_OUT",
  "ADJUSTMENT_DOWN",
  "SALE_OUT",     // reservado — Etapa 14
  "TRANSFER_OUT", // reservado — futuro
  "RETURN_OUT",   // reservado — futuro
]);

/**
 * Devuelve la dirección de un MovementType.
 *
 * @throws Error si el tipo no está clasificado. Falla rápido en
 *   desarrollo para detectar tipos nuevos sin clasificar.
 */
export function getMovementDirection(
  type: MovementType,
): "ADDITIVE" | "SUBTRACTIVE" {
  if (ADDITIVE_MOVEMENT_TYPES.has(type)) return "ADDITIVE";
  if (SUBTRACTIVE_MOVEMENT_TYPES.has(type)) return "SUBTRACTIVE";
  throw new Error(`MovementType no clasificado: ${type}`);
}
