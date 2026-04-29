// ─────────────────────────────────────────────────────────────────
// commerce/purchases — create-purchase.schema.ts
//
// Schema Zod para crear una compra en estado DRAFT.
// Todos los campos documentales son requeridos (la acción los valida antes).
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import {
  VALID_DOCUMENT_TYPES,
  VALID_PAYMENT_CONDITIONS,
  VALID_CANCELLATION_TYPES,
} from "../constants/purchase-document.constants";

export const createPurchaseSchema = z.object({
  supplier_id: z
    .string()
    .uuid("supplier_id debe ser un UUID válido"),

  purchase_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "purchase_date debe tener formato YYYY-MM-DD"),

  purchase_code: z
    .string()
    .trim()
    .regex(/^\d+$/, "El correlativo debe ser solo numérico")
    .min(1),

  document_type: z.enum(VALID_DOCUMENT_TYPES, { message: "Tipo de documento no válido" }),

  document_series: z.string().trim().min(1, "La serie es requerida").max(20),

  document_number: z.string().trim().min(1, "El número de documento es requerido").max(50),

  payment_condition: z.enum(VALID_PAYMENT_CONDITIONS, { message: "Forma de pago no válida" }),

  cancellation_type: z.enum(VALID_CANCELLATION_TYPES, { message: "Tipo de cancelación no válido" }),

  notes: z.string().trim().max(500).optional(),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
