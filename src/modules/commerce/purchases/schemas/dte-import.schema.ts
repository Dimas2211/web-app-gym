// ─────────────────────────────────────────────────────────────────
// commerce/purchases — dte-import.schema.ts
//
// Schemas Zod para el flujo de importación DTE:
//
//   dteImportBodySchema          — POST /api/purchases/dte-import
//   createPurchaseFromDteSchema  — POST /api/purchases/dte-import/[id]/create-purchase
//
// El route de importación normaliza primero { raw_json: {...} } o DTE
// directo antes de pasar por dteImportBodySchema.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Schema de importación de JSON DTE ────────────────────────────

const plainObjectSchema = z
  .record(z.unknown())
  .refine((v) => !Array.isArray(v), {
    message: "El DTE debe ser un objeto JSON, no un array.",
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "El DTE no puede ser un objeto vacío.",
  });

export const dteImportBodySchema = z.object({
  raw_json: plainObjectSchema,
});

export type DteImportBodyInput = z.infer<typeof dteImportBodySchema>;

// ── Schema de creación de Purchase DRAFT desde DTE aprobado ──────
// Representa el payload revisado y aprobado por el usuario.
// supplier_id y cada product_id vienen explícitos (no hay auto-matching aquí).
// line_number es solo trazabilidad; no se persiste en esta fase.
// tax_amount: si se omite o viene null, se usa 0 (comportamiento consistente
// con addPurchaseItemSchema que también defaultea a 0).

export const createPurchaseFromDteItemSchema = z.object({
  line_number: z.number().int().positive().optional(),

  product_id: z
    .string()
    .uuid("product_id debe ser un UUID válido"),

  quantity: z
    .number()
    .positive("quantity debe ser mayor que 0"),

  unit_cost: z
    .number()
    .min(0, "unit_cost debe ser >= 0"),

  tax_amount: z
    .number()
    .min(0, "tax_amount debe ser >= 0")
    .nullable()
    .optional(),

  line_total: z
    .number()
    .min(0)
    .nullable()
    .optional(),
});

export const createPurchaseFromDteSchema = z.object({
  supplier_id: z
    .string()
    .uuid("supplier_id debe ser un UUID válido"),

  items: z
    .array(createPurchaseFromDteItemSchema)
    .min(1, "Debe incluir al menos una línea aprobada"),

  notes: z
    .string()
    .trim()
    .max(500)
    .optional(),
});

export type CreatePurchaseFromDteInput     = z.infer<typeof createPurchaseFromDteSchema>;
export type CreatePurchaseFromDteItemInput = z.infer<typeof createPurchaseFromDteItemSchema>;
