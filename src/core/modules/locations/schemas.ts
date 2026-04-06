/**
 * Validaciones Zod para el dominio Location.
 *
 * ESTADO: Contrato genérico. Sin conectar a actions ni UI todavía.
 * Cross-industry: no contiene semántica GYM.
 *
 * Consistente con los tipos en ./types.ts.
 */

import { z } from "zod";

// ─── Schema base ───────────────────────────────────────────────────────────────

const baseLocationSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "Máximo 100 caracteres"),
  address: z
    .string()
    .max(255, "Máximo 255 caracteres")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .max(30, "Máximo 30 caracteres")
    .optional()
    .or(z.literal("")),
});

// ─── Creación ──────────────────────────────────────────────────────────────────

/**
 * Schema para crear una ubicación.
 * tenant_id se valida aquí porque en el contrato de creación es obligatorio.
 * En actions, puede venir del session en lugar del form — el schema lo acepta en ambos casos.
 */
export const createLocationSchema = baseLocationSchema.extend({
  tenant_id: z.string().uuid("tenant_id inválido"),
});

// ─── Actualización ─────────────────────────────────────────────────────────────

/**
 * Schema para actualizar una ubicación.
 * tenant_id no se incluye: una ubicación no puede cambiar de tenant.
 * Todos los campos son opcionales para soportar actualizaciones parciales.
 */
export const updateLocationSchema = baseLocationSchema.partial();

// ─── Tipos inferidos ───────────────────────────────────────────────────────────

export type CreateLocationSchema = z.infer<typeof createLocationSchema>;
export type UpdateLocationSchema = z.infer<typeof updateLocationSchema>;
