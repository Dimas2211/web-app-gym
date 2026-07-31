// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale.schemas.ts
//
// F3-C21 — Validación de entrada para el módulo comercial FEX 11.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Cliente extranjero (alta rápida desde la pantalla de exportación) ──

export const createForeignCustomerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre del receptor es requerido")
    .max(200),

  legal_name: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable(),

  // CAT-022: 36 NIT, 13 DUI, 02 Carnet, 03 Pasaporte, 37 Otro
  id_type_code: z.enum(["36", "13", "02", "03", "37"], {
    message: "Tipo de documento no válido",
  }),

  // Número de documento — se persiste en nit o dui según id_type_code.
  document_number: z
    .string()
    .trim()
    .min(1, "El número de documento es requerido")
    .max(30),

  country_code: z
    .string()
    .trim()
    .min(1, "El país es requerido"),

  country_name: z
    .string()
    .trim()
    .min(1, "El nombre de país es requerido")
    .max(50),

  // tipoPersona: 1 jurídica, 2 natural
  customer_person_type: z.enum(["1", "2"], {
    message: "Tipo de persona no válido",
  }),

  activity_name: z
    .string()
    .trim()
    .min(1, "La descripción de actividad económica es requerida")
    .max(200),

  address_complement: z
    .string()
    .trim()
    .min(5, "El complemento de dirección debe tener al menos 5 caracteres")
    .max(300),

  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable(),

  email: z
    .string()
    .trim()
    .email("Correo electrónico no válido")
    .max(100)
    .optional()
    .nullable(),
});

export type CreateForeignCustomerInput = z.infer<typeof createForeignCustomerSchema>;

// ── Línea de venta de exportación ─────────────────────────────────

export const exportSaleItemSchema = z.object({
  product_id: z.string().uuid("product_id debe ser un UUID válido"),

  quantity: z
    .number({ invalid_type_error: "La cantidad debe ser numérica" })
    .positive("La cantidad debe ser mayor que cero")
    .max(99999),

  unit_price: z
    .number({ invalid_type_error: "El precio debe ser numérico" })
    .nonnegative("El precio no puede ser negativo")
    .max(9999999),

  discount_amount: z
    .number()
    .nonnegative("El descuento no puede ser negativo")
    .default(0),
});

export type ExportSaleItemInput = z.infer<typeof exportSaleItemSchema>;

// ── Venta de exportación completa ─────────────────────────────────

export const createExportSaleSchema = z.object({
  sale_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "sale_date debe tener formato YYYY-MM-DD"),

  customer_id: z.string().uuid("customer_id debe ser un UUID válido"),

  // CAT-016: 1 contado, 2 crédito, 3 otro
  condition_operation_code: z.enum(["1", "2", "3"]).default("1"),

  payment_method_code: z
    .string()
    .trim()
    .max(10)
    .optional()
    .nullable(),

  payment_term_code: z
    .enum(["01", "02", "03"])
    .optional()
    .nullable(),

  payment_term_value: z
    .number()
    .int()
    .positive()
    .optional()
    .nullable(),

  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable(),

  items: z
    .array(exportSaleItemSchema)
    .min(1, "La venta de exportación debe tener al menos un producto"),

  // ── Datos fiscales de exportación (SaleExportDetails) ────────────

  item_type_export: z.union([z.literal(1), z.literal(2), z.literal(3)]),

  fiscal_precinct_code: z
    .string()
    .trim()
    .optional()
    .nullable(),

  regime_code: z
    .string()
    .trim()
    .optional()
    .nullable(),

  incoterm_code: z
    .string()
    .trim()
    .optional()
    .nullable(),

  incoterm_desc: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable(),

  insurance_amount: z
    .number()
    .nonnegative("El seguro no puede ser negativo")
    .default(0),

  freight_amount: z
    .number()
    .nonnegative("El flete no puede ser negativo")
    .default(0),
});

export type CreateExportSaleInput = z.infer<typeof createExportSaleSchema>;
