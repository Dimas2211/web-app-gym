/**
 * Validaciones Zod para el dominio Tenant.
 *
 * ESTADO: Contrato genérico. Sin conectar a actions ni UI todavía.
 * Cross-industry: no contiene semántica GYM.
 *
 * Consistente con los tipos en ./types.ts.
 */

import { z } from "zod";

// ─── Schema base ───────────────────────────────────────────────────────────────

const baseTenantSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(150, "Máximo 150 caracteres"),
  logo_url: z
    .string()
    .url("URL de logo inválida")
    .optional()
    .or(z.literal("")),
});

// ─── Creación ──────────────────────────────────────────────────────────────────

/**
 * Schema para crear un tenant.
 * slug es obligatorio en creación y debe ser URL-safe.
 * Una vez creado, el slug no se modifica (ver updateTenantSchema).
 */
export const createTenantSchema = baseTenantSchema.extend({
  slug: z
    .string()
    .min(2, "El slug debe tener al menos 2 caracteres")
    .max(100, "Máximo 100 caracteres")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Solo letras minúsculas, números y guiones. Ejemplo: mi-empresa"
    ),
});

// ─── Actualización ─────────────────────────────────────────────────────────────

/**
 * Schema para actualizar un tenant.
 * slug excluido: un tenant no puede cambiar su slug una vez creado
 * (afectaría routing, URLs públicas y referencias externas).
 */
export const updateTenantSchema = baseTenantSchema.partial();

// ─── Tipos inferidos ───────────────────────────────────────────────────────────

export type CreateTenantSchema = z.infer<typeof createTenantSchema>;
export type UpdateTenantSchema = z.infer<typeof updateTenantSchema>;
