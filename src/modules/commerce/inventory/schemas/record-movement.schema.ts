// ─────────────────────────────────────────────────────────────────
// commerce/inventory — record-movement.schema.ts
//
// Schema Zod para registrar un movimiento de inventario.
//
// Reglas de dominio:
//   - quantity siempre positivo; la dirección la define movement_type
//   - solo se aceptan los 5 tipos activos de Etapa 11
//   - la lógica de dirección (suma/resta) vive en
//     utils/movement-direction.utils.ts — no se duplica aquí
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import type { MovementType } from "../types/inventory-movement.types";

// Re-exportados para que las actions no necesiten dos imports distintos.
export {
  ADDITIVE_MOVEMENT_TYPES,
  SUBTRACTIVE_MOVEMENT_TYPES,
  getMovementDirection,
} from "../utils/movement-direction.utils";

// ── Tipos activos en Etapa 11 ────────────────────────────────────
//
// Restricción de la action: solo estos 5 tipos se aceptan ahora.
// Cuando llegue Etapa 13 (purchases) o Etapa 14 (sales), se ampliará
// este array y el schema derivado; no hay que tocar la lógica de dirección.

export const ACTIVE_MOVEMENT_TYPES = [
  "INITIAL_LOAD",
  "MANUAL_IN",
  "MANUAL_OUT",
  "ADJUSTMENT_UP",
  "ADJUSTMENT_DOWN",
] as const satisfies [MovementType, ...MovementType[]];

export type ActiveMovementType = typeof ACTIVE_MOVEMENT_TYPES[number];

// ── Schema de validación ─────────────────────────────────────────

export const recordMovementSchema = z.object({
  // Identidad transversal — requeridos
  tenant_id:   z.string().min(1, "tenant_id requerido"),
  location_id: z.string().min(1, "location_id requerido"),

  // Referencias — requeridas
  product_id:          z.string().uuid("product_id debe ser un UUID válido"),
  product_location_id: z.string().uuid("product_location_id debe ser un UUID válido"),

  // Tipo — solo los activos en Etapa 11
  movement_type: z.enum(ACTIVE_MOVEMENT_TYPES, {
    errorMap: () => ({
      message: `Tipo de movimiento no permitido. Valores aceptados: ${ACTIVE_MOVEMENT_TYPES.join(", ")}`,
    }),
  }),

  // Cantidad — siempre positiva; la dirección la da movement_type
  quantity: z.coerce
    .number()
    .positive("La cantidad debe ser mayor a cero"),

  // Costo unitario — opcional, solo para trazabilidad
  unit_cost: z.coerce
    .number()
    .min(0, "unit_cost no puede ser negativo")
    .optional(),

  // Referencia documental — opcional
  reference_entity: z.string().trim().optional(),
  reference_id:     z.string().trim().optional(),
  reference_code:   z.string().trim().optional(),

  // Observaciones — opcional
  notes: z.string().trim().optional(),

  // Auditoría — inyectado desde sesión en la action
  performed_by: z.string().uuid().optional(),
});

export type RecordMovementInput = z.infer<typeof recordMovementSchema>;
