// ─────────────────────────────────────────────────────────────────
// commerce/products — update-product.schema.ts
//
// Validador Zod para la edición de un producto del catálogo maestro.
//
// Diferencias vs create-product.schema:
//   - id: requerido (identifica el registro a actualizar)
//   - product_code: excluido (clave de negocio, no editable)
//   - status: excluido (se gestiona en update-product-status.action)
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import { productTypeEnum } from "./create-product.schema";

export const updateProductSchema = z
  .object({
    // Identidad del registro
    id: z
      .string({ required_error: "ID de producto requerido." })
      .uuid("ID de producto inválido."),

    // Identidad del producto (product_code excluido — readonly)
    name: z
      .string({ required_error: "El nombre del producto es requerido." })
      .min(1, "El nombre del producto es requerido.")
      .max(200, "El nombre no puede superar los 200 caracteres.")
      .trim(),

    description: z
      .string()
      .max(1000, "La descripción no puede superar los 1000 caracteres.")
      .trim()
      .nullable()
      .optional(),

    // Tipo
    product_type: productTypeEnum,

    // Clasificación
    category_id: z
      .string({ required_error: "La categoría es requerida." })
      .uuid("La categoría seleccionada no es válida."),

    line_id: z
      .string()
      .uuid("La línea seleccionada no es válida.")
      .nullable()
      .optional(),

    subline_id: z
      .string()
      .uuid("La sublínea seleccionada no es válida.")
      .nullable()
      .optional(),

    brand: z
      .string()
      .max(100, "La marca no puede superar los 100 caracteres.")
      .trim()
      .nullable()
      .optional(),

    // Logística
    unit_id: z
      .string({ required_error: "La unidad de medida es requerida." })
      .uuid("La unidad de medida seleccionada no es válida."),

    package_unit: z
      .string()
      .max(100, "El empaque no puede superar los 100 caracteres.")
      .trim()
      .nullable()
      .optional(),

    supplier_id: z
      .string()
      .uuid("El proveedor seleccionado no es válido.")
      .nullable()
      .optional(),

    sku: z
      .string()
      .max(100, "El SKU no puede superar los 100 caracteres.")
      .trim()
      .nullable()
      .optional(),

    // Flags operativos
    is_stockable: z.boolean({
      required_error: "Debes indicar si el producto controla stock.",
    }),

    allow_purchase: z.boolean({
      required_error: "Debes indicar si el producto está habilitado para compra.",
    }),

    allow_sale: z.boolean({
      required_error: "Debes indicar si el producto está habilitado para venta.",
    }),

    // Precios
    cost_price: z
      .number()
      .positive("El precio de costo debe ser mayor a 0.")
      .nullable()
      .optional(),

    sale_price: z
      .number()
      .positive("El precio de venta debe ser mayor a 0.")
      .nullable()
      .optional(),

    tax_rate_id: z
      .string()
      .uuid("La tasa de impuesto seleccionada no es válida.")
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Coherencia relacional: subline requiere line
    if (data.subline_id && !data.line_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Si seleccionas una sublínea, debes seleccionar también una línea.",
        path: ["subline_id"],
      });
    }
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
