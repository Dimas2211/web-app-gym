// ─────────────────────────────────────────────────────────────────
// commerce/purchases — dte-import.schema.ts
//
// Schema Zod para validar el cuerpo normalizado de POST /api/purchases/dte-import.
// El route handler normaliza primero { raw_json: {...} } o DTE directo
// antes de pasar por este schema.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

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
