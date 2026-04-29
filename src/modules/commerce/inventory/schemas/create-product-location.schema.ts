// ─────────────────────────────────────────────────────────────────
// commerce/inventory — create-product-location.schema.ts
//
// Schema Zod para crear un nuevo registro product_locations.
//
// Regla de dominio: current_stock NO es un campo de entrada.
// El saldo comienza siempre en 0 (default del schema Prisma).
// Cualquier carga inicial de stock se realiza mediante un movimiento
// INITIAL_LOAD posterior al registro (record-movement.schema.ts).
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const createProductLocationSchema = z.object({
  // Identidad transversal — requeridos
  tenant_id:   z.string().min(1, "tenant_id requerido"),
  location_id: z.string().min(1, "location_id requerido"),

  // Referencia al catálogo maestro — requerido
  product_id: z.string().uuid("product_id debe ser un UUID válido"),

  // Parámetros operativos — opcionales con default 0
  // No incluye current_stock: el saldo solo se altera vía movimientos.
  min_stock:        z.coerce.number().min(0, "min_stock no puede ser negativo").default(0),
  reorder_quantity: z.coerce.number().min(0, "reorder_quantity no puede ser negativo").default(0),

  // Ubicación física dentro de la location — opcionales
  warehouse: z.string().trim().optional(),
  shelf:     z.string().trim().optional(),
  position:  z.string().trim().optional(),

  // Estado de activación — activo por defecto
  is_active: z.boolean().default(true),

  // Auditoría — inyectado desde sesión en la action, nunca desde UI
  created_by: z.string().uuid().optional(),
});

export type CreateProductLocationInput = z.infer<typeof createProductLocationSchema>;
