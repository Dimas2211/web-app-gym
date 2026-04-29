// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-item.schema.ts
//
// Schemas Zod para gestión de líneas de una compra en DRAFT.
//
// Reglas de dominio:
//   - product_id obligatorio y UUID válido
//   - quantity > 0 (estrictamente positivo)
//   - unit_cost >= 0 (cero permitido: muestras, bonificaciones)
//   - tax_amount >= 0, default 0 si no se provee
//   - line_subtotal y line_total los calcula el service — no vienen del caller
//   - notes opcional; si se envía no puede ser string vacío
//   - purchase_id no va en el payload — viene del contexto (URL / FormData separado)
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Agregar línea ─────────────────────────────────────────────────

export const addPurchaseItemSchema = z.object({
  product_id: z
    .string()
    .uuid("product_id debe ser un UUID válido"),

  quantity: z.coerce
    .number()
    .positive("La cantidad debe ser mayor a cero"),

  unit_cost: z.coerce
    .number()
    .min(0, "El costo unitario no puede ser negativo"),

  tax_amount: z.coerce
    .number()
    .min(0, "El impuesto no puede ser negativo")
    .default(0),

  notes: z
    .string()
    .trim()
    .min(1, "Las observaciones no pueden estar vacías; omite el campo si no aplica")
    .max(500)
    .optional(),
});

export type AddPurchaseItemInput = z.infer<typeof addPurchaseItemSchema>;

// ── Editar línea existente (todos los campos editables mientras esté en DRAFT) ──

export const updatePurchaseItemSchema = z
  .object({
    quantity: z.coerce
      .number()
      .positive("La cantidad debe ser mayor a cero")
      .optional(),

    unit_cost: z.coerce
      .number()
      .min(0, "El costo unitario no puede ser negativo")
      .optional(),

    tax_amount: z.coerce
      .number()
      .min(0, "El impuesto no puede ser negativo")
      .optional(),

    // notes: si se envía no puede ser vacío. Para dejar sin notas, omitir el campo.
    // No se soporta limpiar notas enviando null en este corte.
    notes: z
      .string()
      .trim()
      .min(1, "Las observaciones no pueden estar vacías; omite el campo si no aplica")
      .max(500)
      .optional(),
  })
  .refine(
    (data) =>
      data.quantity   !== undefined ||
      data.unit_cost  !== undefined ||
      data.tax_amount !== undefined ||
      data.notes      !== undefined,
    { message: "Debe enviar al menos un campo a actualizar." },
  );

export type UpdatePurchaseItemInput = z.infer<typeof updatePurchaseItemSchema>;
