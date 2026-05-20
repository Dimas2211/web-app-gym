// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-issuer-config.schemas.ts
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

const DTE_ENVIRONMENTS = ["TEST", "PRODUCTION"] as const;

// ── Crear configuración de emisor ─────────────────────────────────

export const createDteIssuerConfigSchema = z.object({
  environment: z.enum(DTE_ENVIRONMENTS, {
    message: "El ambiente DTE debe ser TEST o PRODUCTION",
  }),

  nit: z
    .string()
    .trim()
    .min(1, "El NIT del emisor es requerido")
    .max(20),

  nrc: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable(),

  name: z
    .string()
    .trim()
    .min(1, "El nombre del emisor es requerido")
    .max(200),

  legal_name: z
    .string()
    .trim()
    .max(200)
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

  establishment_code: z
    .string()
    .trim()
    .max(10)
    .optional()
    .nullable(),

  establishment_type_code: z
    .string()
    .trim()
    .max(5)
    .optional()
    .nullable(),

  point_of_sale_code: z
    .string()
    .trim()
    .max(10)
    .optional()
    .nullable(),

  cod_estable_mh: z
    .string()
    .trim()
    .length(4, "cod_estable_mh debe tener exactamente 4 caracteres (ej. 'M001')")
    .optional()
    .nullable(),

  cod_punto_venta_mh: z
    .string()
    .trim()
    .length(4, "cod_punto_venta_mh debe tener exactamente 4 caracteres (ej. 'P001')")
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

export type CreateDteIssuerConfigInput = z.infer<typeof createDteIssuerConfigSchema>;

// ── Actualizar configuración de emisor ────────────────────────────

export const updateDteIssuerConfigSchema = createDteIssuerConfigSchema
  .omit({ environment: true })
  .partial()
  .extend({
    is_active: z.boolean().optional(),
  });

export type UpdateDteIssuerConfigInput = z.infer<typeof updateDteIssuerConfigSchema>;

// ── Filtros de lista ──────────────────────────────────────────────

export const dteIssuerConfigFiltersSchema = z.object({
  tenant_id:   z.string().min(1),
  location_id: z.string().min(1),
  environment: z.enum(DTE_ENVIRONMENTS).optional(),
  is_active:   z.boolean().optional(),
});

export type DteIssuerConfigFilters = z.infer<typeof dteIssuerConfigFiltersSchema>;

// ── Crear documento DTE pendiente ─────────────────────────────────

export const createDteOutgoingDocumentDraftSchema = z.object({
  sale_id: z
    .string()
    .uuid("sale_id debe ser un UUID válido"),

  dte_type_code: z
    .enum(["01", "03"], {
      message: "Tipo DTE no válido. En MVP solo se permite '01' (FE) y '03' (CCFE).",
    }),

  issuer_config_id: z
    .string()
    .uuid("issuer_config_id debe ser un UUID válido"),

  environment: z.enum(DTE_ENVIRONMENTS, {
    message: "El ambiente DTE debe ser TEST o PRODUCTION",
  }),
});

export type CreateDteOutgoingDocumentDraftInput = z.infer<
  typeof createDteOutgoingDocumentDraftSchema
>;
