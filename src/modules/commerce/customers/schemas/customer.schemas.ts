// ─────────────────────────────────────────────────────────────────
// commerce/customers — customer.schemas.ts
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

const TAXPAYER_TYPES = ["FINAL_CONSUMER", "REGISTERED_TAXPAYER", "EXCLUDED_SUBJECT"] as const;

export const createCustomerSchema = z.object({
  customer_code: z
    .string()
    .trim()
    .min(1, "El código de cliente es requerido")
    .max(30, "El código no puede superar 30 caracteres")
    .optional(),

  name: z
    .string()
    .trim()
    .min(1, "El nombre es requerido")
    .max(200, "El nombre no puede superar 200 caracteres"),

  legal_name: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable(),

  taxpayer_type: z.enum(TAXPAYER_TYPES, {
    message: "Tipo de contribuyente no válido",
  }),

  id_type_code: z
    .string()
    .trim()
    .max(5)
    .optional()
    .nullable(),

  nit: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable(),

  nrc: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable(),

  dui: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable(),

  activity_code: z
    .string()
    .trim()
    .max(10)
    .optional()
    .nullable(),

  activity_name: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable(),

  dept_code: z
    .string()
    .trim()
    .max(5)
    .optional()
    .nullable(),

  municipality_code: z
    .string()
    .trim()
    .max(5)
    .optional()
    .nullable(),

  address_complement: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable(),

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

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ── Actualizar cliente ────────────────────────────────────────────

export const updateCustomerSchema = createCustomerSchema
  .omit({ customer_code: true })
  .partial()
  .extend({
    status: z
      .enum(["active", "inactive"], { message: "Estado no válido" })
      .optional(),
  });

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ── Filtros de lista ──────────────────────────────────────────────

export const customerFiltersSchema = z.object({
  tenant_id:    z.string().min(1),
  status:       z.enum(["active", "inactive"]).optional(),
  taxpayer_type: z.enum(TAXPAYER_TYPES).optional(),
  search:       z.string().trim().optional(),
  page:         z.coerce.number().int().positive().default(1),
  page_size:    z.coerce.number().int().positive().max(100).default(25),
  sort_field:   z
    .enum(["customer_code", "name", "created_at"])
    .default("customer_code"),
  sort_direction: z.enum(["asc", "desc"]).default("asc"),
});

export type CustomerFilters = z.infer<typeof customerFiltersSchema>;
