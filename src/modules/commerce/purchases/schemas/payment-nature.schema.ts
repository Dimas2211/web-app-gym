// ─────────────────────────────────────────────────────────────────
// commerce/purchases — payment-nature.schema.ts
//
// Validador Zod para actualizar la Naturaleza del pago de una compra
// (relevante para la Retención de Renta en FSE 14). manual_base solo
// se exige para GOODS_AND_SERVICES — la validación fina (0 <= base <=
// totalCompra, clasificación persona) vive en income-tax-withholding.util.ts
// y purchase.service.ts, no aquí.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const VALID_PAYMENT_NATURES = [
  "GOODS",
  "SERVICES",
  "GOODS_AND_SERVICES",
  "LUMP_SUM_CONTRACT",
  "OTHER",
] as const;

export const updatePurchasePaymentNatureSchema = z.object({
  purchase_id:    z.string().uuid("purchase_id debe ser un UUID válido"),
  payment_nature: z.enum(VALID_PAYMENT_NATURES, { message: "Naturaleza del pago no válida" }),
  manual_base:    z.number().finite().nullable().optional(),
});

export type UpdatePurchasePaymentNatureInput = z.infer<typeof updatePurchasePaymentNatureSchema>;
