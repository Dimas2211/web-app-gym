// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale.schemas.ts
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Crear venta DRAFT ─────────────────────────────────────────────

export const createSaleDraftSchema = z.object({
  sale_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "sale_date debe tener formato YYYY-MM-DD"),

  customer_id: z
    .string()
    .uuid("customer_id debe ser un UUID válido")
    .optional()
    .nullable(),

  payment_method_code: z
    .string()
    .trim()
    .max(10)
    .optional()
    .nullable(),

  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable(),
});

export type CreateSaleDraftInput = z.infer<typeof createSaleDraftSchema>;

// ── Actualizar cabecera de venta DRAFT ───────────────────────────

export const updateSaleDraftSchema = z.object({
  sale_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "sale_date debe tener formato YYYY-MM-DD")
    .optional(),

  customer_id: z
    .string()
    .uuid("customer_id debe ser un UUID válido")
    .optional()
    .nullable(),

  payment_method_code: z
    .string()
    .trim()
    .max(10)
    .optional()
    .nullable(),

  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable(),
});

export type UpdateSaleDraftInput = z.infer<typeof updateSaleDraftSchema>;

// ── Agregar línea a venta DRAFT ───────────────────────────────────

export const addSaleItemSchema = z.object({
  product_id: z
    .string()
    .uuid("product_id debe ser un UUID válido"),

  quantity: z
    .number({ invalid_type_error: "La cantidad debe ser numérica" })
    .positive("La cantidad debe ser mayor que cero")
    .max(99999, "Cantidad fuera de rango"),

  unit_price: z
    .number({ invalid_type_error: "El precio debe ser numérico" })
    .nonnegative("El precio no puede ser negativo")
    .max(9999999, "Precio fuera de rango"),

  discount_amount: z
    .number()
    .nonnegative("El descuento no puede ser negativo")
    .default(0),

  // El service calcula tax_amount; este campo es solo sugerencia
  // del cliente y puede quedar nulo — el recálculo lo determina.
  tax_rate_override: z
    .number()
    .nonnegative()
    .max(100)
    .optional()
    .nullable(),

  notes: z
    .string()
    .trim()
    .max(300)
    .optional()
    .nullable(),
});

export type AddSaleItemInput = z.infer<typeof addSaleItemSchema>;

// ── Editar línea existente ────────────────────────────────────────

export const updateSaleItemSchema = z.object({
  quantity: z
    .number()
    .positive("La cantidad debe ser mayor que cero")
    .max(99999)
    .optional(),

  unit_price: z
    .number()
    .nonnegative()
    .max(9999999)
    .optional(),

  discount_amount: z
    .number()
    .nonnegative()
    .optional(),

  tax_rate_override: z
    .number()
    .nonnegative()
    .max(100)
    .optional()
    .nullable(),

  notes: z
    .string()
    .trim()
    .max(300)
    .optional()
    .nullable(),
});

export type UpdateSaleItemInput = z.infer<typeof updateSaleItemSchema>;

// ── Eliminar línea ────────────────────────────────────────────────

export const removeSaleItemSchema = z.object({
  item_id: z.string().uuid("item_id debe ser un UUID válido"),
});

export type RemoveSaleItemInput = z.infer<typeof removeSaleItemSchema>;

// ── Filtros de lista ──────────────────────────────────────────────

export const saleFiltersSchema = z.object({
  tenant_id:    z.string().min(1),
  location_id:  z.string().min(1),
  status:       z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]).optional(),
  customer_id:  z.string().uuid().optional(),
  date_from:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search:       z.string().trim().optional(),
  page:         z.coerce.number().int().positive().default(1),
  page_size:    z.coerce.number().int().positive().max(100).default(25),
  sort_field:   z
    .enum(["sale_code", "sale_date", "total_amount", "status", "created_at"])
    .default("sale_date"),
  sort_direction: z.enum(["asc", "desc"]).default("desc"),
});

export type SaleFilters = z.infer<typeof saleFiltersSchema>;

// ── Pago básico ───────────────────────────────────────────────────

export const salePaymentSchema = z.object({
  payment_method_code: z
    .string()
    .trim()
    .min(1, "El método de pago es requerido")
    .max(10),

  amount: z
    .number()
    .positive("El monto del pago debe ser mayor que cero"),

  reference: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable(),

  notes: z
    .string()
    .trim()
    .max(300)
    .optional()
    .nullable(),
});

export type SalePaymentInput = z.infer<typeof salePaymentSchema>;
