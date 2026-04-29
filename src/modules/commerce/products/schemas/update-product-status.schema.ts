// ─────────────────────────────────────────────────────────────────
// commerce/products — update-product-status.schema.ts
//
// Validador Zod para el cambio de estado de un producto.
// Operación intencionalmente acotada: solo cambia status.
// Cualquier otra modificación va por un schema de update separado.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import { productStatusEnum } from "./create-product.schema";

export const updateProductStatusSchema = z.object({
  id: z
    .string({ required_error: "El ID del producto es requerido." })
    .uuid("El ID del producto no es válido."),

  status: productStatusEnum,
});

export type UpdateProductStatusInput = z.infer<typeof updateProductStatusSchema>;
