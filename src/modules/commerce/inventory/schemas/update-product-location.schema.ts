// ─────────────────────────────────────────────────────────────────
// commerce/inventory — update-product-location.schema.ts
//
// Schema Zod para actualizar un registro product_locations existente.
//
// Campos editables directamente:
//   min_stock, reorder_quantity, warehouse, shelf, position, is_active
//
// Campos NO editables por esta ruta:
//   current_stock → solo cambia vía InventoryMovement en transacción
//   tenant_id, location_id, product_id → identidad inmutable del registro
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const updateProductLocationSchema = z
  .object({
    // Parámetros operativos
    min_stock:        z.coerce.number().min(0, "min_stock no puede ser negativo").optional(),
    reorder_quantity: z.coerce.number().min(0, "reorder_quantity no puede ser negativo").optional(),

    // Ubicación física
    warehouse: z.string().trim().optional(),
    shelf:     z.string().trim().optional(),
    position:  z.string().trim().optional(),

    // Estado de activación por location
    is_active: z.boolean().optional(),

    // Auditoría — inyectado desde sesión en la action
    updated_by: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      data.min_stock !== undefined ||
      data.reorder_quantity !== undefined ||
      data.warehouse !== undefined ||
      data.shelf !== undefined ||
      data.position !== undefined ||
      data.is_active !== undefined,
    { message: "Debe incluir al menos un campo a actualizar" },
  );

export type UpdateProductLocationInput = z.infer<typeof updateProductLocationSchema>;
